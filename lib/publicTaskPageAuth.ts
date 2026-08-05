// lib/publicTaskPageAuth.ts
// Shared authorization for public task page API routes — loads the page,
// checks it's active/not expired, and determines which users' tasks the
// requester is allowed to see/act on based on the page's self/team/company
// scope. Uses the service-role client (RLS bypass is safe here because
// authorization is fully enforced in this function).
import { NextResponse } from "next/server";

export async function loadPageAndAuthorize(admin: any, pageId: string, userId: string) {
  // companies:company_id(company_type) rides along on this same query (not
  // a separate round trip) -- every caller needs it to compute "today" in
  // Australia/Sydney time for the two AU-only verticals (see
  // lib/companyLocalDate.ts) rather than whatever UTC offset the server
  // happens to be running in.
  const { data: page } = await admin
    .from("public_task_pages")
    .select("id, company_id, created_by, title, scope, team_id, columns, expires_at, is_active, companies:company_id(company_type)")
    .eq("id", pageId).maybeSingle();

  if (!page) return { error: NextResponse.json({ error: "Page not found" }, { status: 404 }) };
  if (!page.is_active) return { error: NextResponse.json({ error: "This page has been revoked" }, { status: 410 }) };
  if (page.expires_at && new Date(page.expires_at) < new Date()) {
    return { error: NextResponse.json({ error: "This page has expired" }, { status: 410 }) };
  }

  let targetUserIds: string[] = [];
  let scopeName = "";
  let isAdmin = false;

  // 'my_and_unassigned' (see app/api/public-tasks/[pageId]/route.ts) is
  // private to its creator exactly like 'self' -- it only differs in also
  // surfacing unallocated tasks and allowing any assignee on new tasks,
  // both handled in that route, not here.
  //
  // Every branch below fires its membership check + whatever scope-specific
  // lookups it needs (targetUserIds, the "Tasks - X" header name) together
  // via Promise.all instead of one after another -- none of these queries
  // actually depend on each other's *results*, only on `page` (already
  // resolved above), so there's no correctness reason to serialize them.
  // This previously took 2-4 sequential round trips per request; now it's
  // one round trip's worth of latency regardless of scope.
  if (page.scope === "self" || page.scope === "my_and_unassigned") {
    targetUserIds = [page.created_by];
    const [{ data: membership }, { data: creator }] = await Promise.all([
      admin.from("company_memberships").select("role").eq("company_id", page.company_id).eq("user_id", userId).maybeSingle(),
      admin.from("profiles").select("full_name, email").eq("id", page.created_by).maybeSingle(),
    ]);
    if (!membership) return { error: NextResponse.json({ error: "You don't have access to this company" }, { status: 403 }) };
    isAdmin = membership.role === "company_admin";
    if (!isAdmin && userId !== page.created_by) {
      return { error: NextResponse.json({ error: "This page is private to its creator" }, { status: 403 }) };
    }
    scopeName = creator?.full_name || creator?.email || "Me";
  } else if (page.scope === "team") {
    const [{ data: membership }, { data: team }, { data: members }] = await Promise.all([
      admin.from("company_memberships").select("role").eq("company_id", page.company_id).eq("user_id", userId).maybeSingle(),
      // team_name (for the header) and leader_id (for the membership check
      // below) in one query -- the original code fetched this team row
      // twice, once per purpose.
      admin.from("teams").select("team_name, leader_id").eq("id", page.team_id).maybeSingle(),
      admin.from("team_members").select("profile_id").eq("team_id", page.team_id),
    ]);
    if (!membership) return { error: NextResponse.json({ error: "You don't have access to this company" }, { status: 403 }) };
    isAdmin = membership.role === "company_admin";
    targetUserIds = (members || []).map((m: any) => m.profile_id);
    const isTeamMember = targetUserIds.includes(userId) || team?.leader_id === userId;
    if (!isAdmin && !isTeamMember) {
      return { error: NextResponse.json({ error: "You're not a member of this team" }, { status: 403 }) };
    }
    scopeName = team?.team_name || "Team";
  } else {
    // company scope -- targetUserIds (every member) and "is the caller a
    // member, and are they admin" both come out of the exact same
    // company_memberships rows, so this is one query doing what used to be
    // two separate ones (a user-scoped membership check + an unfiltered
    // all-members list).
    const [{ data: allMembers }, { data: company }] = await Promise.all([
      admin.from("company_memberships").select("user_id, role").eq("company_id", page.company_id),
      admin.from("companies").select("name").eq("id", page.company_id).maybeSingle(),
    ]);
    const membership = (allMembers || []).find((m: any) => m.user_id === userId);
    if (!membership) return { error: NextResponse.json({ error: "You don't have access to this company" }, { status: 403 }) };
    isAdmin = membership.role === "company_admin";
    targetUserIds = (allMembers || []).map((m: any) => m.user_id);
    scopeName = company?.name || "Company";
  }

  return { page, isAdmin, targetUserIds, scopeName };
}
