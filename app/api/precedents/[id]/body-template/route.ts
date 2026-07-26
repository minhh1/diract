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

async function loadPrecedent(admin: any, precedentId: string, companyId: string) {
  const { data } = await admin
    .from("precedents").select("id, company_id, body_template").eq("id", precedentId).is("deleted_at", null).maybeSingle();
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

  const { data: examples } = await admin
    .from("precedent_body_examples")
    .select("id, original_filename, created_at")
    .eq("precedent_id", precedentId)
    .order("created_at", { ascending: true });

  return NextResponse.json({ examples: examples || [], template: precedent.body_template || null });
}

function parseSegments(input: any): BodyTemplateSegment[] | null {
  if (!Array.isArray(input)) return null;
  const out: BodyTemplateSegment[] = [];
  for (const s of input) {
    if (s?.type === "text" && typeof s.text === "string" && s.text.trim()) {
      out.push({ type: "text", text: s.text });
    } else if (s?.type === "field" && s.key && s.label) {
      out.push({ type: "field", key: String(s.key).trim(), label: String(s.label).trim(), example: String(s.example || "").trim() });
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
