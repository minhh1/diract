// app/api/client-update-pages/[id]/settings/route.ts
// Edits a Detailed Table Page's own settings -- title, client label,
// expiry, and (unlike Public Task Pages' equivalent route, which
// deliberately treats scope as immutable once shared) visibility and team
// assignment. Admin-only: flipping a page between public and team-only is
// an access-control decision, not a cosmetic one -- a looser bar here
// would mean any company member could silently make a team-restricted
// page public (or vice versa) without anyone noticing.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";
import { logChange, resolveActorName } from "@/lib/clientUpdatePageLog";

function randomPin(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Only a company admin can change this page's settings" }, { status: 403 });

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const { title, clientLabel, visibility, teamIds, expiresAt } = body;
  if (!title?.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!["public", "team"].includes(visibility)) return NextResponse.json({ error: "Invalid visibility" }, { status: 400 });

  const cleanTeamIds: string[] = visibility === "team" && Array.isArray(teamIds) ? [...new Set(teamIds)] : [];
  if (visibility === "team") {
    if (!cleanTeamIds.length) return NextResponse.json({ error: "Select at least one team" }, { status: 400 });
    const { data: teams } = await admin.from("teams").select("id").in("id", cleanTeamIds);
    if (!teams || teams.length !== cleanTeamIds.length) return NextResponse.json({ error: "One or more teams not found" }, { status: 404 });
  }

  // Switching to public generates a PIN if this page never had one (e.g. it
  // was created team-only); switching to team clears both the PIN and any
  // expiry, matching the DB's own client_update_pages_expiry_public_only_chk
  // constraint (expiry only ever makes sense for a page reachable without a
  // session at all).
  const { data: current } = await admin.from("client_update_pages").select("access_code").eq("id", id).maybeSingle();
  const accessCode = visibility === "public" ? (current?.access_code || randomPin()) : null;

  const { error } = await admin.from("client_update_pages").update({
    title: title.trim(),
    client_label: visibility === "public" ? (clientLabel?.trim() || null) : null,
    visibility,
    access_code: accessCode,
    expires_at: visibility === "public" ? (expiresAt || null) : null,
  }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("client_update_page_teams").delete().eq("page_id", id);
  if (cleanTeamIds.length) {
    await admin.from("client_update_page_teams").insert(cleanTeamIds.map((teamId: string) => ({ page_id: id, team_id: teamId })));
  }

  const actorName = await resolveActorName(admin, user.id);
  await logChange(admin, id, actorName, "staff", "settings_changed", `Updated page settings (${visibility === "public" ? "public" : "team-only"})`);

  return NextResponse.json({ ok: true, accessCode });
}
