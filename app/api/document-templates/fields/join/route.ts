// app/api/document-templates/fields/join/route.ts
// Admin-side (auth required). Marks two fields — usually from different
// uploaded documents for the same project — as "the same answer" (the
// client is asked once, applied to every joined document's tag), or
// reverses that.
//
// POST body: { fieldId, joinTargetFieldId } — joinTargetFieldId null unlinks
// fieldId (makes it independent again). Otherwise fieldId's whole group
// (itself plus anyone already aliased to it) is repointed onto
// joinTargetFieldId's group root, so joined_to_field_id always points
// directly at a root, never at another alias (no chains to walk elsewhere).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

interface FieldRow { id: string; template_id: string; joined_to_field_id: string | null }

function resolveRoot(fieldId: string, byId: Map<string, FieldRow>): string {
  const seen = new Set<string>();
  let current = byId.get(fieldId);
  let currentId = fieldId;
  while (current?.joined_to_field_id && !seen.has(currentId)) {
    seen.add(currentId);
    currentId = current.joined_to_field_id;
    current = byId.get(currentId);
  }
  return currentId;
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { fieldId, joinTargetFieldId } = body;
  if (!fieldId) return NextResponse.json({ error: "fieldId is required" }, { status: 400 });

  const { data: field } = await admin
    .from("document_template_fields")
    .select("id, template_id, joined_to_field_id, document_templates!inner(id, company_id, project_id)")
    .eq("id", fieldId).maybeSingle();
  if (!field || (field as any).document_templates.company_id !== companyId) {
    return NextResponse.json({ error: "Field not found" }, { status: 404 });
  }
  const projectId = (field as any).document_templates.project_id;

  // ── Unlink ──────────────────────────────────────────────────────
  if (!joinTargetFieldId) {
    const { error } = await admin.from("document_template_fields").update({ joined_to_field_id: null }).eq("id", fieldId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (joinTargetFieldId === fieldId) {
    return NextResponse.json({ error: "A field can't be joined with itself" }, { status: 400 });
  }

  const { data: targetField } = await admin
    .from("document_template_fields")
    .select("id, template_id, document_templates!inner(id, company_id, project_id)")
    .eq("id", joinTargetFieldId).maybeSingle();
  if (!targetField || (targetField as any).document_templates.company_id !== companyId) {
    return NextResponse.json({ error: "Target field not found" }, { status: 404 });
  }
  if ((targetField as any).document_templates.project_id !== projectId) {
    return NextResponse.json({ error: "Fields must belong to the same project" }, { status: 400 });
  }

  // Load every field across this project's templates to resolve join roots
  // and re-point an entire group at once (see module comment).
  const { data: projectTemplates } = await admin.from("document_templates").select("id").eq("project_id", projectId);
  const templateIds = (projectTemplates || []).map((t: any) => t.id);
  const { data: allFields } = await admin
    .from("document_template_fields").select("id, template_id, joined_to_field_id").in("template_id", templateIds);
  const byId = new Map<string, FieldRow>((allFields || []).map((f: any) => [f.id, f]));

  const rootA = resolveRoot(fieldId, byId);
  const rootB = resolveRoot(joinTargetFieldId, byId);
  if (rootA === rootB) return NextResponse.json({ ok: true, alreadyJoined: true });

  const { error } = await admin
    .from("document_template_fields")
    .update({ joined_to_field_id: rootB })
    .or(`id.eq.${rootA},joined_to_field_id.eq.${rootA}`);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
