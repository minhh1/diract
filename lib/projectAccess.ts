// lib/projectAccess.ts
// Filters a list of tasks down to only those whose project the *viewer*
// (not the assignee) actually has access to — per-project access_mode can
// restrict a project to specific teams/members, and being on the same
// team-scoped public page doesn't override that. Uses the service-role
// client (RLS bypass is safe here since this function is the enforcement).
export async function filterTasksByProjectAccess<T extends { project_id: string | null }>(
  admin: any,
  userId: string,
  tasks: T[]
): Promise<T[]> {
  const projectIds = [...new Set(tasks.map(t => t.project_id).filter(Boolean))] as string[];
  if (!projectIds.length) return tasks;

  const { data: projects } = await admin.from("projects").select("id, access_mode").in("id", projectIds);
  const accessModeById: Record<string, string> = {};
  for (const p of projects || []) accessModeById[p.id] = p.access_mode || "all_members";

  const teamRestricted = projectIds.filter(id => accessModeById[id] === "specific_teams");
  const memberRestricted = projectIds.filter(id => accessModeById[id] === "specific_members");

  let accessibleViaTeam = new Set<string>();
  if (teamRestricted.length) {
    const { data: userTeams } = await admin.from("team_members").select("team_id").eq("profile_id", userId);
    const teamIds = (userTeams || []).map((t: any) => t.team_id);
    if (teamIds.length) {
      const { data: pt } = await admin.from("project_teams").select("project_id")
        .in("project_id", teamRestricted).in("team_id", teamIds);
      accessibleViaTeam = new Set((pt || []).map((r: any) => r.project_id));
    }
  }

  let accessibleViaMember = new Set<string>();
  if (memberRestricted.length) {
    const { data: pm } = await admin.from("project_members").select("project_id")
      .in("project_id", memberRestricted).eq("profile_id", userId);
    accessibleViaMember = new Set((pm || []).map((r: any) => r.project_id));
  }

  return tasks.filter(t => {
    if (!t.project_id) return true;
    const mode = accessModeById[t.project_id] || "all_members";
    if (mode === "specific_teams") return accessibleViaTeam.has(t.project_id);
    if (mode === "specific_members") return accessibleViaMember.has(t.project_id);
    return true; // all_members, or a project with no explicit restriction
  });
}

// General-purpose version of the same access_mode/project_teams/
// project_members check above, for callers that need to know "which
// projects can this user see" up front (e.g. a project search box) rather
// than filtering an already-loaded list of something else. Returns 'all'
// for company admins (who bypass per-project restrictions entirely, same
// as filterTasksByProjectAccess's callers already assume via isAdmin
// checks elsewhere) so callers can skip the `.in('id', ...)` filter
// rather than materializing every project id.
export async function getAccessibleProjectIds(
  admin: any,
  companyId: string,
  userId: string,
  isAdmin: boolean
): Promise<"all" | Set<string>> {
  if (isAdmin) return "all";

  const { data: projects } = await admin.from("projects").select("id, access_mode").eq("company_id", companyId).is("deleted_at", null);
  const all = projects || [];

  const teamRestricted = all.filter((p: any) => (p.access_mode || "all_members") === "specific_teams").map((p: any) => p.id);
  const memberRestricted = all.filter((p: any) => (p.access_mode || "all_members") === "specific_members").map((p: any) => p.id);

  let accessibleViaTeam = new Set<string>();
  if (teamRestricted.length) {
    const { data: userTeams } = await admin.from("team_members").select("team_id").eq("profile_id", userId);
    const teamIds = (userTeams || []).map((t: any) => t.team_id);
    if (teamIds.length) {
      const { data: pt } = await admin.from("project_teams").select("project_id").in("project_id", teamRestricted).in("team_id", teamIds);
      accessibleViaTeam = new Set((pt || []).map((r: any) => r.project_id));
    }
  }

  let accessibleViaMember = new Set<string>();
  if (memberRestricted.length) {
    const { data: pm } = await admin.from("project_members").select("project_id").in("project_id", memberRestricted).eq("profile_id", userId);
    accessibleViaMember = new Set((pm || []).map((r: any) => r.project_id));
  }

  const result = new Set<string>();
  for (const p of all) {
    const mode = p.access_mode || "all_members";
    if (mode === "specific_teams") { if (accessibleViaTeam.has(p.id)) result.add(p.id); }
    else if (mode === "specific_members") { if (accessibleViaMember.has(p.id)) result.add(p.id); }
    else result.add(p.id);
  }
  return result;
}
