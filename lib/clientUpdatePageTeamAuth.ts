// lib/clientUpdatePageTeamAuth.ts
// Authorization for a 'team'-visibility Detailed Table Page (client_update_
// pages.visibility = 'team') -- generalizes lib/publicTaskPageAuth.ts's
// single-team "team" scope branch to client_update_page_teams' multiple
// teams (see 20260729210000_client_update_pages_visibility_teams_generic_record.sql).
// Authorized = a company admin, OR the leader of any of the page's teams,
// OR a member of any of the page's teams. Caller must already know the
// requester is a member of page.company_id (e.g. via authorizeCompanyMember())
// -- this only decides the team-level question on top of that.
import { NextResponse } from "next/server";

export async function authorizeTeamOnlyPageAccess(
  admin: any,
  page: { id: string; company_id: string },
  userId: string
): Promise<{ ok: true; isAdmin: boolean } | { ok: false; error: NextResponse }> {
  const [{ data: membership }, { data: pageTeams }] = await Promise.all([
    admin.from("company_memberships").select("role").eq("company_id", page.company_id).eq("user_id", userId).maybeSingle(),
    admin.from("client_update_page_teams").select("team_id").eq("page_id", page.id),
  ]);
  if (!membership) {
    return { ok: false, error: NextResponse.json({ error: "You don't have access to this company", reason: "team_restricted" }, { status: 403 }) };
  }
  const isAdmin = membership.role === "company_admin";
  if (isAdmin) return { ok: true, isAdmin };

  const teamIds = (pageTeams || []).map((t: any) => t.team_id);
  if (!teamIds.length) {
    return { ok: false, error: NextResponse.json({ error: "This page isn't available to any team yet", reason: "team_restricted" }, { status: 403 }) };
  }

  const [{ data: teams }, { data: members }] = await Promise.all([
    admin.from("teams").select("id, leader_id").in("id", teamIds),
    admin.from("team_members").select("team_id").in("team_id", teamIds).eq("profile_id", userId),
  ]);
  const isLeader = (teams || []).some((t: any) => t.leader_id === userId);
  const isMember = (members || []).length > 0;
  if (!isLeader && !isMember) {
    return { ok: false, error: NextResponse.json({ error: "You're not a member of a team that can access this page", reason: "team_restricted" }, { status: 403 }) };
  }
  return { ok: true, isAdmin };
}
