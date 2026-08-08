// app/api/calendar/roster/shifts/route.ts
// List/create roster shifts. GET returns shifts in a date range plus the
// company's Staff entities (entity_type='Staff', same scope
// RelationPicker.tsx's $team_scope sentinel already uses for Time & Fee
// Entries' Staff field -- see lib/services/staffEntityService.ts) so the
// client can render the staff x day grid without a second round trip.
// Also returns the company's existing teams/team_members (see
// components/admin/AdminTeamsTab.tsx -- teams are a pre-existing, admin-
// managed concept the roster reuses via roster_shifts.team_id rather than
// inventing its own).
// A plain staff member (no roster.edit/roster.publish/admin) only ever
// sees THEIR OWN final shifts, not the whole company's roster -- draft/
// unconfirmed shifts aren't "their schedule" yet (also enforced in RLS,
// this is defense in depth since the admin client bypasses RLS), and other
// people's shifts aren't theirs to see either. A manager (roster.edit or
// roster.publish) or admin sees everyone's, draft and final, so they can
// actually build/review the week. New shifts always start as 'draft'
// regardless of what the caller sends -- publishing is its own explicit
// action (see .../publish/route.ts), never implicit on create.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { hasOverlappingShift } from "@/lib/rosterOverlap";

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user, isAdmin, hasPermission } = auth;
  const canEdit = isAdmin || hasPermission("roster.edit");
  const canPublish = isAdmin || hasPermission("roster.publish");
  const canSeeDrafts = canEdit || canPublish;

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  if (!start || !end) return NextResponse.json({ error: "start and end (YYYY-MM-DD) are required" }, { status: 400 });

  // A plain staff member only ever sees their own row and their own shifts
  // -- not the rest of the company's roster.
  let staffQuery = admin
    .from("entities")
    .select("id, name, linked_profile_id")
    .eq("company_id", companyId)
    .eq("entity_type", "Staff")
    .is("deleted_at", null);
  if (!canSeeDrafts) staffQuery = staffQuery.eq("linked_profile_id", user.id);
  const { data: staff } = await staffQuery.order("name");

  let query = admin.from("roster_shifts").select("*").eq("company_id", companyId).gte("shift_date", start).lte("shift_date", end);
  if (!canSeeDrafts) {
    query = query.eq("status", "final");
    const ownIds = (staff ?? []).map((s: any) => s.id);
    query = ownIds.length ? query.in("staff_entity_id", ownIds) : query.eq("staff_entity_id", "00000000-0000-0000-0000-000000000000");
  }
  const { data: shifts, error } = await query.order("shift_date").order("start_time");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Profile pics come from the linked login (entities has no avatar of its
  // own) -- a separate lookup rather than a PostgREST embed since there's
  // no established embed convention for this FK elsewhere in the app.
  const profileIds = (staff ?? []).map((s: any) => s.linked_profile_id).filter(Boolean);
  const { data: profiles } = profileIds.length
    ? await admin.from("profiles").select("id, avatar_url").in("id", profileIds)
    : { data: [] };
  const avatarById = new Map((profiles ?? []).map((p: any) => [p.id, p.avatar_url]));
  const staffWithAvatars = (staff ?? []).map((s: any) => ({
    id: s.id, name: s.name, avatar_url: avatarById.get(s.linked_profile_id) ?? null, linked_profile_id: s.linked_profile_id,
  }));

  const { data: teams } = await admin.from("teams").select("id, team_name").eq("company_id", companyId).eq("is_active", true).order("team_name");

  // Which of a staff member's teams a shift's Team picker should offer --
  // keyed by profile_id (team_members' own key), not staff_entity_id, since
  // membership lives on the login, same join staffWithAvatars uses above.
  const teamIds = (teams ?? []).map((t: any) => t.id);
  const { data: memberships } = teamIds.length
    ? await admin.from("team_members").select("team_id, profile_id").in("team_id", teamIds)
    : { data: [] };

  return NextResponse.json({
    shifts: shifts ?? [], staff: staffWithAvatars, teams: teams ?? [], memberships: memberships ?? [], canEdit, canPublish,
  });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user, isAdmin, hasPermission } = auth;
  if (!isAdmin && !hasPermission("roster.edit")) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const { staff_entity_id, shift_date, start_time, end_time, role_note, team_id } = body ?? {};
  if (!staff_entity_id || !shift_date || !start_time || !end_time) {
    return NextResponse.json({ error: "staff_entity_id, shift_date, start_time, and end_time are required" }, { status: 400 });
  }

  const { data: staffEntity } = await admin.from("entities").select("id").eq("id", staff_entity_id).eq("company_id", companyId).eq("entity_type", "Staff").is("deleted_at", null).maybeSingle();
  if (!staffEntity) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });

  if (team_id) {
    const { data: team } = await admin.from("teams").select("id").eq("id", team_id).eq("company_id", companyId).maybeSingle();
    if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  if (await hasOverlappingShift(admin, { companyId, staffEntityId: staff_entity_id, shiftDate: shift_date, startTime: start_time, endTime: end_time })) {
    return NextResponse.json({ error: "This staff member already has a shift that overlaps this time -- edit that shift instead of adding a duplicate, since a duplicate would double-count their hours." }, { status: 409 });
  }

  const { data: created, error } = await admin
    .from("roster_shifts")
    .insert({
      company_id: companyId, staff_entity_id, shift_date, start_time, end_time,
      role_note: role_note ? String(role_note) : null, team_id: team_id || null, status: "draft", created_by: user.id,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ shift: created });
}
