// app/api/precedents/[id]/issue/route.ts
// Thin HTTP wrapper around lib/precedents/issuePrecedent.ts -- parses the
// request, resolves the authenticated user/company, and hands off to the
// actual issuing pipeline (also called directly by the Teams/WhatsApp bot's
// issue_precedent action, see lib/ai/precedentAction.ts, so both produce an
// identical document rather than two drifting implementations). The body is
// either a plain string the staff member wrote/edited themselves (freeform,
// or pre-filled via the separate optional AI drafting assist -- see
// app/api/precedents/[id]/draft/route.ts) OR, when this precedent has a
// detected body_template and the Issue modal's field form was used,
// reconstructed from fieldValues -- see issuePrecedentDocument. No AI call
// happens in this route at all.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { issuePrecedentDocument } from "@/lib/precedents/issuePrecedent";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: precedentId } = await params;

  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user, companyId } = auth;

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const projectId = String(body?.recordId || "");
  if (!projectId) return NextResponse.json({ error: "recordId is required" }, { status: 400 });

  const signerIds = Array.isArray(body?.signerIds)
    ? body.signerIds.map((id: any) => String(id || "").trim()).filter(Boolean)
    : undefined;
  const fieldValues = body?.fieldValues && typeof body.fieldValues === "object" ? body.fieldValues : undefined;

  const result = await issuePrecedentDocument(admin, {
    companyId,
    userId: user.id,
    precedentId,
    projectId,
    subject: String(body?.subject || ""),
    body: body?.body != null ? String(body.body) : undefined,
    fieldValues,
    recipientAddress: String(body?.recipientAddress || ""),
    recipientName: body?.recipientName != null ? String(body.recipientName) : undefined,
    deliveryMode: body?.deliveryMode != null ? String(body.deliveryMode) : undefined,
    salutation: body?.salutation != null ? String(body.salutation) : undefined,
    signerIds,
    draftBrief: body?.prompt != null ? String(body.prompt) : undefined,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, issuanceId: result.issuanceId, subject: result.subject, url: result.url, docxUrl: result.docxUrl });
}
