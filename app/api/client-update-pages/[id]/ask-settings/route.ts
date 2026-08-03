// app/api/client-update-pages/[id]/ask-settings/route.ts
// Toggles the "ask anything about this matter" AI feature's two staff-only
// options (like freeze-column/cell-logging's own routes) -- enabled gates
// whether the client themselves sees the ask input at all; scope controls
// how much context the AI sees when answering (see
// lib/ai/matterQuestionAnswer.ts's AskScope). Bundled into one route since
// they're always edited from the same settings panel.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";

const VALID_SCOPES = ["emails", "emails_notes", "all"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const patch: { ai_ask_enabled?: boolean; ai_ask_scope?: string } = {};
  if (typeof body.enabled === "boolean") patch.ai_ask_enabled = body.enabled;
  if (typeof body.scope === "string" && VALID_SCOPES.includes(body.scope)) patch.ai_ask_scope = body.scope;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { error } = await admin.from("client_update_pages").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
