// lib/ai/autoTimeEntryDraft.ts
// Turns one user's day of completed tasks + matter-linked emails into a set
// of merged, estimated-duration Time & Fee Entries drafts -- shared by
// app/api/time-entries/auto-generate/route.ts for both the "my day" flow
// and the admin "everyone's day" flow (one call per target user either
// way, never mixed across users -- merging only ever happens within a
// single person's own items, on the same matter).
//
// Items are passed to the model using short reference tags (T1/E1/...)
// rather than their real UUIDs -- an LLM asked to echo a UUID back
// verbatim in its response is a real source of silent mismatches; tags are
// short enough to reproduce reliably and are resolved back to real ids
// here, never trusted from the model's own text.
import { callHostedModel } from "./modelCall";

export interface AutoTimeEntryTaskInput { id: string; name: string; notes: string | null; matterId: string; matterLabel: string; }
export interface AutoTimeEntryEmailInput { id: string; subject: string | null; snippet: string | null; matterId: string; matterLabel: string; fromName: string | null; }
// Browser-tracked activity (see app/api/time-tracking/sync/route.ts), the
// third input alongside tasks/emails -- matched to a matter server-side
// before this ever runs. durationMinutes is real (measured), not estimated
// like a drafted entry's hours, so it's shown to the model as a strong hint
// rather than left for it to guess the way task/email durations are.
export interface AutoTimeEntrySegmentInput { id: string; title: string | null; domain: string; matterId: string; matterLabel: string; durationMinutes: number; }

// How much a generated description says beyond the bare minimum -- user-
// adjustable per entry (and settable as a personal default) in
// AutoTimeRecordingPanel.tsx, persisted at profiles.auto_time_entry_detail_level.
export type DescriptionDetailLevel = 'brief' | 'standard' | 'detailed';

const DETAIL_INSTRUCTIONS: Record<DescriptionDetailLevel, string> = {
  brief: 'Keep each description as short as possible -- a bare few words, the minimum a biller would write (e.g. "Review contract.", "Correspondence with purchaser\'s solicitor.").',
  standard: 'Write each description the way a professional would phrase it on an actual bill -- concise, past tense, no filler, ending with a full stop (e.g. "Draft and send settlement letter to purchaser\'s solicitor.", "Review title search and update file notes.").',
  detailed: 'Write each description with more specificity than a typical bill line -- name the actual document, party, or next step drawn from the task notes or email content where it\'s available, while staying one line and professional (e.g. "Draft and send settlement letter to purchaser\'s solicitor confirming extension of settlement date to 14 March and deposit release conditions.").',
};

export interface AutoTimeEntryDraft {
  matterId: string;
  matterLabel: string;
  description: string;
  hours: number;
  sourceTaskIds: string[];
  sourceEmailIds: string[];
  sourceSegmentIds: string[];
}

// Every entry reads like a line on an actual bill -- ending with a full
// stop, same as the worked examples in SYSTEM_PROMPT below (which the model
// doesn't reliably follow on its own, confirmed live), and the leftover-item
// fallback descriptions (a bare task name/email subject) below.
function ensureTrailingPeriod(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function buildSystemPrompt(detailLevel: DescriptionDetailLevel): string {
  return `You are a timekeeper assistant for a professional services firm (mostly legal). Given one person's completed tasks, matter-linked emails, and tracked browser activity for a single day, produce a list of billable time entries as they would appear on a timesheet.

Rules:
- Group items by matter (the "Matter" shown against each item) -- never combine items from different matters into one entry.
- Within the SAME matter, if a task, one or more emails, and/or tracked browser activity clearly describe the same underlying piece of work (e.g. a task "Draft settlement letter", an email actually sending it, and browser activity in a document editor around the same time), merge them into ONE entry rather than creating a separate entry for each -- list every task/email/segment reference (e.g. T1, E2, S1) that contributed to that entry. This matters most for browser activity: it's very often just the hands-on-keyboard evidence of a task or email that's already listed separately, not a distinct piece of work of its own -- merge it in rather than double-counting the same work under two entries.
- Distinct, unrelated pieces of work on the same matter should stay as separate entries.
- Every task, every email, and every segment must be accounted for by exactly one entry -- never drop one, never include the same reference in two entries.
- ${DETAIL_INSTRUCTIONS[detailLevel]}
- Estimate a realistic duration in hours for each entry given what it actually involved -- a short email is often 0.1-0.2h (6-12 minutes), a substantive email or short call note might be 0.2-0.4h, drafting or reviewing a document is usually 0.3-1.5h depending on what the task/notes describe. Tracked browser activity comes with a real measured duration already (shown in minutes) -- when a segment is merged into an entry, let its actual duration inform the estimate rather than guessing independently of it.

Respond with ONLY a JSON array, nothing else -- no markdown fences, no prose:
[{"matterRef": "M1", "description": "...", "hours": 0.5, "taskRefs": ["T1"], "emailRefs": ["E1","E2"], "segmentRefs": ["S1"]}]`;
}

export async function draftAutoTimeEntries(
  modelId: string,
  tasks: AutoTimeEntryTaskInput[],
  emails: AutoTimeEntryEmailInput[],
  detailLevel: DescriptionDetailLevel = 'standard',
  segments: AutoTimeEntrySegmentInput[] = []
): Promise<{ drafts: AutoTimeEntryDraft[]; inputTokens: number; outputTokens: number } | null> {
  if (!tasks.length && !emails.length && !segments.length) return null;

  // matterId -> short ref, and the reverse, plus a human label for the prompt.
  const matterIds = Array.from(new Set([...tasks.map(t => t.matterId), ...emails.map(e => e.matterId), ...segments.map(s => s.matterId)]));
  const matterRefById = new Map(matterIds.map((id, i) => [id, `M${i + 1}`]));
  const matterLabelByRef = new Map(matterIds.map(id => [matterRefById.get(id)!, tasks.find(t => t.matterId === id)?.matterLabel ?? emails.find(e => e.matterId === id)?.matterLabel ?? segments.find(s => s.matterId === id)?.matterLabel ?? "Unknown matter"]));

  const taskRefById = new Map(tasks.map((t, i) => [t.id, `T${i + 1}`]));
  const emailRefById = new Map(emails.map((e, i) => [e.id, `E${i + 1}`]));
  const segmentRefById = new Map(segments.map((s, i) => [s.id, `S${i + 1}`]));

  const lines: string[] = [];
  for (const m of matterIds) {
    lines.push(`Matter ${matterRefById.get(m)}: ${matterLabelByRef.get(matterRefById.get(m)!)}`);
    for (const t of tasks.filter(t => t.matterId === m)) {
      lines.push(`  ${taskRefById.get(t.id)} (task): ${t.name}${t.notes ? ` -- ${t.notes}` : ""}`);
    }
    for (const e of emails.filter(e => e.matterId === m)) {
      lines.push(`  ${emailRefById.get(e.id)} (email)${e.fromName ? ` from ${e.fromName}` : ""}: ${e.subject || "(no subject)"}${e.snippet ? ` -- ${e.snippet}` : ""}`);
    }
    for (const s of segments.filter(s => s.matterId === m)) {
      lines.push(`  ${segmentRefById.get(s.id)} (browser activity, ${s.durationMinutes}m): ${s.title || "(untitled page)"} (${s.domain})`);
    }
  }

  const messages = [
    { role: "system", content: buildSystemPrompt(detailLevel) },
    { role: "user", content: lines.join("\n") },
  ];

  const usage = await callHostedModel(modelId, messages);
  let parsed: any[] = [];
  try {
    const match = usage.content.match(/\[[\s\S]*\]/);
    parsed = JSON.parse(match ? match[0] : usage.content);
    if (!Array.isArray(parsed)) parsed = [];
  } catch {
    parsed = [];
  }

  const drafts: AutoTimeEntryDraft[] = [];
  for (const entry of parsed) {
    const matterId = matterIds.find(id => matterRefById.get(id) === entry?.matterRef);
    if (!matterId) continue;
    const description = typeof entry.description === "string" ? entry.description.trim() : "";
    if (!description) continue;
    const hours = typeof entry.hours === "number" && entry.hours > 0 ? Math.round(entry.hours * 10) / 10 : 0.1;
    const sourceTaskIds = (Array.isArray(entry.taskRefs) ? entry.taskRefs : [])
      .map((ref: string) => tasks.find(t => taskRefById.get(t.id) === ref)?.id)
      .filter((id: string | undefined): id is string => !!id);
    const sourceEmailIds = (Array.isArray(entry.emailRefs) ? entry.emailRefs : [])
      .map((ref: string) => emails.find(e => emailRefById.get(e.id) === ref)?.id)
      .filter((id: string | undefined): id is string => !!id);
    const sourceSegmentIds = (Array.isArray(entry.segmentRefs) ? entry.segmentRefs : [])
      .map((ref: string) => segments.find(s => segmentRefById.get(s.id) === ref)?.id)
      .filter((id: string | undefined): id is string => !!id);
    if (!sourceTaskIds.length && !sourceEmailIds.length && !sourceSegmentIds.length) continue;
    drafts.push({ matterId, matterLabel: matterLabelByRef.get(matterRefById.get(matterId)!) || "", description: ensureTrailingPeriod(description), hours, sourceTaskIds, sourceEmailIds, sourceSegmentIds });
  }

  // Anything the model dropped entirely (missed a ref) still becomes its
  // own entry, one per leftover item -- never silently lose a completed
  // task, email, or tracked segment just because the model's grouping
  // missed it.
  const coveredTaskIds = new Set(drafts.flatMap(d => d.sourceTaskIds));
  const coveredEmailIds = new Set(drafts.flatMap(d => d.sourceEmailIds));
  const coveredSegmentIds = new Set(drafts.flatMap(d => d.sourceSegmentIds));
  for (const t of tasks) {
    if (coveredTaskIds.has(t.id)) continue;
    drafts.push({ matterId: t.matterId, matterLabel: t.matterLabel, description: ensureTrailingPeriod(t.name), hours: 0.2, sourceTaskIds: [t.id], sourceEmailIds: [], sourceSegmentIds: [] });
  }
  for (const e of emails) {
    if (coveredEmailIds.has(e.id)) continue;
    drafts.push({ matterId: e.matterId, matterLabel: e.matterLabel, description: ensureTrailingPeriod(e.subject || "Email correspondence"), hours: 0.1, sourceTaskIds: [], sourceEmailIds: [e.id], sourceSegmentIds: [] });
  }
  for (const s of segments) {
    if (coveredSegmentIds.has(s.id)) continue;
    drafts.push({
      matterId: s.matterId, matterLabel: s.matterLabel,
      description: ensureTrailingPeriod(s.title || s.domain),
      hours: Math.max(0.1, Math.round((s.durationMinutes / 60) * 10) / 10),
      sourceTaskIds: [], sourceEmailIds: [], sourceSegmentIds: [s.id],
    });
  }

  return { drafts, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
}

// Rephrases ONE already-drafted entry's description at a different detail
// level -- the task(s)/email(s) it's built from, the matter it's on, and its
// hours are all already fixed (see AutoTimeRecordingPanel's per-entry detail
// control); this never re-groups or re-attributes, it only asks the model to
// re-describe the exact same source material. Kept separate from
// draftAutoTimeEntries above rather than routed through it with a
// single-item list, since that function's whole prompt is built around
// grouping/merging across a full day's worth of items.
export async function redraftEntryDescription(
  modelId: string,
  tasks: { name: string; notes: string | null }[],
  emails: { subject: string | null; snippet: string | null; fromName: string | null }[],
  detailLevel: DescriptionDetailLevel,
  segments: { title: string | null; domain: string }[] = []
): Promise<{ description: string; inputTokens: number; outputTokens: number } | null> {
  if (!tasks.length && !emails.length && !segments.length) return null;

  const lines: string[] = [];
  for (const t of tasks) lines.push(`Task: ${t.name}${t.notes ? ` -- ${t.notes}` : ""}`);
  for (const e of emails) lines.push(`Email${e.fromName ? ` from ${e.fromName}` : ""}: ${e.subject || "(no subject)"}${e.snippet ? ` -- ${e.snippet}` : ""}`);
  for (const s of segments) lines.push(`Browser activity: ${s.title || "(untitled page)"} (${s.domain})`);

  const systemPrompt = `You are a timekeeper assistant for a professional services firm (mostly legal). The task(s)/email(s) below all describe ONE existing time entry -- rewrite its description as it would appear on a bill.

${DETAIL_INSTRUCTIONS[detailLevel]}

Respond with ONLY the description text, nothing else -- no quotes, no markdown, no explanation.`;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: lines.join("\n") },
  ];

  const usage = await callHostedModel(modelId, messages);
  const description = ensureTrailingPeriod(usage.content.trim().replace(/^["']|["']$/g, ""));
  if (!description) return null;
  return { description, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
}
