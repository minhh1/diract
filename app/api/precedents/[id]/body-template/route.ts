// app/api/precedents/[id]/body-template/route.ts
// GET -> the precedent's uploaded example documents plus its detected
// body_template (see lib/precedents/bodyTemplateDetect.ts), for both the
// Settings admin review UI and the Issue modal's field form. Uploading is a
// separate endpoint (./examples/route.ts) since it also triggers
// re-detection; PATCH here just lets an admin correct the already-detected
// segments directly (rename a field's label, or merge one back into plain
// text) without touching the stored examples, the same "AI identifies,
// human can correct" shape as PATCH /api/precedents/letterhead.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import type { BodyTemplateSegment } from "@/lib/precedents/bodyTemplateDetect";
import { resolveCustomFieldDefaults } from "@/lib/precedents/customFieldDefaults";

async function loadPrecedent(admin: any, precedentId: string, companyId: string) {
  const { data } = await admin
    .from("precedents").select("id, company_id, record_table, body_template").eq("id", precedentId).is("deleted_at", null).maybeSingle();
  if (!data || data.company_id !== companyId) return null;
  return data;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: precedentId } = await params;
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const precedent = await loadPrecedent(admin, precedentId, companyId);
  if (!precedent) return NextResponse.json({ error: "Precedent not found" }, { status: 404 });

  const [{ data: examples }, { data: availableFields }] = await Promise.all([
    admin.from("precedent_body_examples").select("id, original_filename, created_at").eq("precedent_id", precedentId).order("created_at", { ascending: true }),
    admin.from("company_custom_fields").select("id, label").eq("company_id", companyId).eq("table_name", precedent.record_table).is("deleted_at", null).order("display_order"),
  ]);

  // recordId (a specific matter, say) -> resolve each field's bound
  // default, keyed by the body_template's own field key, ready to drop
  // straight into the Issue modal's fieldValues state (see
  // lib/precedents/customFieldDefaults.ts).
  let fieldDefaults: Record<string, string> = {};
  const recordId = req.nextUrl.searchParams.get("recordId");
  const segments = precedent.body_template?.segments as BodyTemplateSegment[] | undefined;
  if (recordId && segments?.length) {
    const boundFields = segments.filter((s): s is Extract<BodyTemplateSegment, { type: "field" }> => s.type === "field" && !!s.autoFillFieldId);
    if (boundFields.length) {
      const resolved = await resolveCustomFieldDefaults(admin, recordId, boundFields.map(f => f.autoFillFieldId));
      for (const f of boundFields) {
        if (f.autoFillFieldId && resolved[f.autoFillFieldId]) fieldDefaults[f.key] = resolved[f.autoFillFieldId];
      }
    }
  }

  return NextResponse.json({ examples: examples || [], template: precedent.body_template || null, availableFields: availableFields || [], fieldDefaults });
}

function parseSegments(input: any): BodyTemplateSegment[] | null {
  if (!Array.isArray(input)) return null;
  const out: BodyTemplateSegment[] = [];
  for (const s of input) {
    if (s?.type === "text" && typeof s.text === "string" && s.text.trim()) {
      out.push({ type: "text", text: s.text });
    } else if (s?.type === "field" && s.key && s.label) {
      out.push({
        type: "field", key: String(s.key).trim(), label: String(s.label).trim(), example: String(s.example || "").trim(),
        autoFillFieldId: s.autoFillFieldId ? String(s.autoFillFieldId) : null,
      });
    } else {
      return null;
    }
  }
  return out;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: precedentId } = await params;
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Only a company admin can edit a precedent's body template" }, { status: 403 });

  const precedent = await loadPrecedent(admin, precedentId, companyId);
  if (!precedent) return NextResponse.json({ error: "Precedent not found" }, { status: 404 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const segments = parseSegments(body?.segments);
  if (!segments) return NextResponse.json({ error: "segments must be an array of {type:'text',text} or {type:'field',key,label,example}" }, { status: 400 });

  const { data, error } = await admin
    .from("precedents")
    .update({ body_template: segments.length ? { segments } : null })
    .eq("id", precedentId)
    .select("body_template")
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message || "Failed to save" }, { status: 500 });
  return NextResponse.json({ ok: true, template: data.body_template || null });
}
