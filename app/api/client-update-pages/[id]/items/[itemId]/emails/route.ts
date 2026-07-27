// app/api/client-update-pages/[id]/items/[itemId]/emails/route.ts
// Staff-only: manually append an email reference (subject/sender/date/
// snippet) to a matter -- see the migration's header comment for why this
// is a dedicated table rather than a row in project_emails. No GET here --
// reads go through lib/clientUpdatePageDetail.ts (loadPageDetail), which
// already loads every item's appended emails alongside its notes. POST
// returns the created row so the caller doesn't need a separate fetch.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";
import { logChange, resolveActorName } from "@/lib/clientUpdatePageLog";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const { data: item } = await admin.from("client_update_page_items").select("id, project_id").eq("id", itemId).eq("page_id", id).maybeSingle();
  if (!item) return NextResponse.json({ error: "Matter not found on this page" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const subject = String(body.subject || "").trim();
  const fromName = String(body.fromName || "").trim();
  const snippet = String(body.snippet || "").trim();
  if (!subject && !snippet) return NextResponse.json({ error: "Add a subject or a summary of the email" }, { status: 400 });

  const { data: profile } = await admin.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle();

  const { data: created, error } = await admin.from("client_update_page_emails").insert({
    item_id: itemId,
    subject: subject || null,
    from_name: fromName || null,
    from_address: body.fromAddress ? String(body.fromAddress).trim() : null,
    snippet: snippet || null,
    email_date: body.emailDate || undefined,
    added_by_name: profile?.full_name || profile?.email || null,
  }).select("id, subject, from_name, from_address, snippet, email_date, added_by_name, created_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: project } = await admin.from("projects").select("name").eq("id", item.project_id).maybeSingle();
  const actorName = await resolveActorName(admin, user.id);
  await logChange(admin, id, actorName, "staff", "email_appended", `Appended email "${subject || snippet.slice(0, 40)}" to "${project?.name || "a matter"}"`);

  return NextResponse.json({ email: created });
}
