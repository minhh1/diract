// app/api/precedents/[id]/body-template/examples/[exampleId]/route.ts
// Admin-only: remove one uploaded example document, then re-run detection
// over whatever examples remain (clears the precedent's body_template back
// to null if none are left) -- see lib/precedents/redetectBodyTemplate.ts.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { redetectBodyTemplate } from "@/lib/precedents/redetectBodyTemplate";

const BUCKET = "precedent-documents";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; exampleId: string }> }) {
  const { id: precedentId, exampleId } = await params;
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Only a company admin can remove an example document" }, { status: 403 });

  const { data: example } = await admin
    .from("precedent_body_examples").select("id, precedent_id, company_id, storage_path")
    .eq("id", exampleId).maybeSingle();
  if (!example || example.precedent_id !== precedentId || example.company_id !== companyId) {
    return NextResponse.json({ error: "Example not found" }, { status: 404 });
  }

  await admin.storage.from(BUCKET).remove([example.storage_path]);
  const { error } = await admin.from("precedent_body_examples").delete().eq("id", exampleId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let template;
  try {
    template = await redetectBodyTemplate(admin, precedentId, companyId, user.id);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to re-detect the template" }, { status: 502 });
  }

  const { data: examples } = await admin
    .from("precedent_body_examples")
    .select("id, original_filename, created_at")
    .eq("precedent_id", precedentId)
    .order("created_at", { ascending: true });

  return NextResponse.json({ ok: true, examples: examples || [], template });
}
