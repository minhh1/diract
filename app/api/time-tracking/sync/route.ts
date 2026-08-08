// app/api/time-tracking/sync/route.ts
// Receives a batch of raw browser-activity segments from the time-tracking
// extension (see extension/background.ts) and inserts them into
// time_tracking_segments. Bearer-token authed the same way mobile/ already
// is -- lib/supabaseServer.ts treats a Bearer session identically to the
// web app's cookie session, so authorizeCompanyMember() needs no changes
// for a non-browser-session caller.
//
// 403s unless a company admin has explicitly turned this on
// (time_tracking_settings.enabled) -- workplace activity tracking is more
// sensitive than this app's other consent-gated features (see the AI data
// access grant flow), so it never defaults to on and a member's own
// extension can't silently start syncing before an admin opts the company in.
//
// matched_project_id is resolved here, server-side -- NOT with
// lib/ai/actions.ts's resolveProjectByName (tried that first; it checks
// whether the whole search string appears INSIDE a project's short name,
// which is backwards here: a browser tab title is typically longer and
// noisier than the matter name it mentions, e.g. "Purchase - Units 1 & 2,
// 305 Auburn Road, Hawthorn VIC 3122 - Settlement Letter - Google Docs"
// contains the real matter name "Purchase - Units 1 & 2, 305 Auburn Road,
// Hawthorn VIC 3122" as a substring, not the other way around -- confirmed
// live, resolveProjectByName found nothing for exactly this case). This
// checks the opposite direction: does a known matter's name or matter
// number appear somewhere inside the tracked text. Segments that don't
// resolve to exactly one project stay unmatched and are excluded from
// drafting (see app/api/time-entries/auto-generate/route.ts) in v1 -- no
// manual-match UI yet.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

interface MatchCandidate {
  id: string;
  name: string;
  matterNumber: string | null;
}

async function loadMatchCandidates(admin: any, companyId: string): Promise<MatchCandidate[]> {
  const { data: projects } = await admin.from("projects").select("id, name").eq("company_id", companyId).is("deleted_at", null);
  const rows: MatchCandidate[] = (projects || []).map((p: any) => ({ id: p.id, name: p.name, matterNumber: null }));

  const { data: matterNumberField } = await admin.from("company_custom_fields")
    .select("id").eq("company_id", companyId).eq("table_name", "projects").eq("field_key", "matter_number").is("deleted_at", null).maybeSingle();
  if (matterNumberField) {
    const { data: values } = await admin.from("company_custom_field_values")
      .select("record_id, value_text").eq("field_id", matterNumberField.id).in("record_id", rows.map((r) => r.id));
    const numberByProjectId = new Map<string, string | null>((values || []).map((v: any) => [v.record_id, v.value_text]));
    for (const r of rows) r.matterNumber = numberByProjectId.get(r.id) || null;
  }
  return rows;
}

// A short candidate (a 3-digit matter number, a one-word matter name) can
// false-positive-match as a mere substring of an unrelated longer number/
// word in the text -- word-boundary-anchored regex avoids "12" matching
// inside "12345", the same concern a plain .includes() would have.
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function mentionsCandidate(text: string, candidate: string): boolean {
  if (candidate.length < 3) return false; // too short to be a reliable signal either way
  return new RegExp(`\\b${escapeRegExp(candidate.toLowerCase())}\\b`).test(text.toLowerCase());
}

// Real matter names collide on substrings often enough that "more than one
// candidate matched" can't just mean "give up" -- confirmed live: a matter
// named "305 Auburn Road" and another named "Purchase - Units 1 & 2, 305
// Auburn Road, Hawthorn VIC 3122" both legitimately match the same tracked
// title, since the short one's whole name is contained inside the long
// one's. The long/specific match is obviously the intended one -- prefer
// whichever matched string (name or matter number) is LONGEST, and only
// truly bail out to unmatched if two candidates tie at that longest length
// (a genuine ambiguity, not just nesting).
function longestMatchLength(text: string, candidate: MatchCandidate): number {
  const nameLen = mentionsCandidate(text, candidate.name) ? candidate.name.length : 0;
  const numberLen = candidate.matterNumber && mentionsCandidate(text, candidate.matterNumber) ? candidate.matterNumber.length : 0;
  return Math.max(nameLen, numberLen);
}

function findMatchingProjectId(text: string, candidates: MatchCandidate[]): string | null {
  const scored = candidates.map((c) => ({ id: c.id, length: longestMatchLength(text, c) })).filter((c) => c.length > 0);
  if (!scored.length) return null;
  const maxLength = Math.max(...scored.map((c) => c.length));
  const best = scored.filter((c) => c.length === maxLength);
  return best.length === 1 ? best[0].id : null; // a genuine tie at the same specificity -- stay unmatched rather than guess
}

interface RawSegment {
  domain: string;
  title: string | null;
  startedAt: string;
  endedAt: string;
}

function isValidSegment(s: any): s is RawSegment {
  if (!s || typeof s.domain !== "string" || !s.domain.trim()) return false;
  if (typeof s.startedAt !== "string" || typeof s.endedAt !== "string") return false;
  const start = new Date(s.startedAt).getTime();
  const end = new Date(s.endedAt).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user } = auth;

  const { data: settings } = await admin.from("time_tracking_settings").select("enabled").eq("company_id", companyId).maybeSingle();
  if (!settings?.enabled) return NextResponse.json({ error: "Time tracking is not enabled for this company" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const rawSegments: unknown[] = Array.isArray(body?.segments) ? body.segments : [];
  const segments = rawSegments.filter(isValidSegment);
  if (!segments.length) return NextResponse.json({ error: "No valid segments" }, { status: 400 });

  // Loaded once per batch, not per segment -- matching itself is then pure
  // in-process string comparison, cheap enough to just redo per segment
  // without needing the same "dedupe by unique text" caching a per-segment
  // DB round trip would have wanted.
  const candidates = await loadMatchCandidates(admin, companyId);
  const matchByText = new Map<string, string | null>();
  for (const s of segments) {
    const text = (s.title || s.domain).trim();
    if (matchByText.has(text)) continue;
    matchByText.set(text, findMatchingProjectId(text, candidates));
  }

  const rows = segments.map((s) => ({
    company_id: companyId,
    user_id: user.id,
    domain: s.domain.trim(),
    title: s.title?.trim() || null,
    started_at: s.startedAt,
    ended_at: s.endedAt,
    matched_project_id: matchByText.get((s.title || s.domain).trim()) ?? null,
  }));

  const { error } = await admin.from("time_tracking_segments").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ inserted: rows.length });
}
