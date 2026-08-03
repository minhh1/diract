// app/api/time-entries/submit/route.ts
// Turns selected auto-generate suggestions into real, Released Time & Fee
// Entries records -- one submit_auto_time_entry() RPC call per entry (see
// supabase/migrations/20260803090000_submit_auto_time_entry.sql), which
// atomically creates the record AND claims its source task/email(s) in
// time_entry_ai_sources, so a source already converted by someone else
// (e.g. an admin pushed it moments before the user submitted their own
// copy) can never produce a duplicate entry -- that entry's RPC call just
// fails and is reported back as "already recorded", the rest of the batch
// still goes through.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { ensureStaffEntity } from "@/lib/services/staffEntityService";

const REQUIRED_FIELD_KEYS = ["matter", "staff", "date", "description", "duration_hours", "rate", "amount", "billable", "status"] as const;

interface SubmitEntry {
  key: string;
  userId: string | null;
  matterId: string;
  description: string;
  hours: number;
  date: string;
  sourceTaskIds: string[];
  sourceEmailIds: string[];
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId, isAdmin } = auth;

  const body = await req.json().catch(() => ({}));
  const entries: SubmitEntry[] = Array.isArray(body.entries) ? body.entries : [];
  if (!entries.length) return NextResponse.json({ error: "No entries to submit" }, { status: 400 });

  const { data: table } = await admin.from("company_tables").select("id").eq("company_id", companyId).eq("slug", "time-fee-entries").is("deleted_at", null).maybeSingle();
  if (!table) return NextResponse.json({ error: "Time & Fee Entries table not found" }, { status: 404 });

  const { data: fieldRows } = await admin.from("company_table_fields").select("id, field_key").eq("table_id", table.id).is("deleted_at", null)
    .in("field_key", REQUIRED_FIELD_KEYS as unknown as string[]);
  const fieldIdByKey: Record<string, string> = {};
  for (const f of fieldRows || []) fieldIdByKey[f.field_key] = f.id;
  const missingKeys = REQUIRED_FIELD_KEYS.filter(k => !fieldIdByKey[k]);
  if (missingKeys.length) return NextResponse.json({ error: `Time & Fee Entries is missing expected field(s): ${missingKeys.join(", ")}` }, { status: 500 });

  const results: { key: string; ok: boolean; error?: string; recordId?: string }[] = [];
  const staffEntityCache = new Map<string, { id: string; default_rate: number | null } | null>();

  for (const entry of entries) {
    // Unattributed email suggestions arrive with userId: null until a
    // human (the panel restricts this to an admin) picks who it actually
    // belongs to -- see lib/ai/emailTimekeeperAttribution.ts's rule 4.
    if (!entry.userId) {
      results.push({ key: entry.key, ok: false, error: "Pick a timekeeper before submitting this entry" });
      continue;
    }
    if (entry.userId !== user.id && !isAdmin) {
      results.push({ key: entry.key, ok: false, error: "Only a company admin can submit another person's time entry" });
      continue;
    }
    if (!entry.matterId || !entry.description?.trim() || !entry.hours || entry.hours <= 0 || !entry.date) {
      results.push({ key: entry.key, ok: false, error: "Missing matter, description, hours, or date" });
      continue;
    }
    if (!entry.sourceTaskIds?.length && !entry.sourceEmailIds?.length) {
      results.push({ key: entry.key, ok: false, error: "No source task/email attached" });
      continue;
    }

    const { data: project } = await admin.from("projects").select("id").eq("id", entry.matterId).eq("company_id", companyId).maybeSingle();
    if (!project) {
      results.push({ key: entry.key, ok: false, error: "Matter not found in this company" });
      continue;
    }

    let staffEntity = staffEntityCache.get(entry.userId);
    if (staffEntity === undefined) {
      await ensureStaffEntity(admin, companyId, entry.userId);
      const { data } = await admin.from("entities").select("id, default_rate").eq("company_id", companyId).eq("linked_profile_id", entry.userId).is("deleted_at", null).maybeSingle();
      staffEntity = data || null;
      staffEntityCache.set(entry.userId, staffEntity);
    }
    if (!staffEntity) {
      results.push({ key: entry.key, ok: false, error: "Could not resolve a Staff entity for this person" });
      continue;
    }

    const sources = [
      ...(entry.sourceTaskIds || []).map(id => ({ source_type: "task", source_id: id })),
      ...(entry.sourceEmailIds || []).map(id => ({ source_type: "email", source_id: id })),
    ];

    const { data: recordId, error } = await admin.rpc("submit_auto_time_entry", {
      p_company_id: companyId,
      p_table_id: table.id,
      p_created_by: user.id,
      p_matter_id: entry.matterId,
      p_staff_id: staffEntity.id,
      p_date: entry.date,
      p_description: entry.description.trim(),
      p_hours: entry.hours,
      p_rate: staffEntity.default_rate ?? 0,
      p_field_ids: fieldIdByKey,
      p_sources: sources,
    });

    if (error) {
      const alreadyRecorded = error.message?.includes("time_entry_ai_sources_source_type_source_id_key");
      results.push({ key: entry.key, ok: false, error: alreadyRecorded ? "Already recorded (by you or someone else) since this list was generated" : error.message });
      continue;
    }

    results.push({ key: entry.key, ok: true, recordId: recordId as string });
  }

  return NextResponse.json({ results });
}
