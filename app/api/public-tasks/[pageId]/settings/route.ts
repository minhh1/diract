// app/api/public-tasks/[pageId]/settings/route.ts
// Edits an existing public_task_pages row's title/columns/expiry/scope (and
// team_id, when scope is "team") -- everything a page's creator/admin might
// want to change after the fact without revoking and recreating it (which
// would also mint a new pageId/URL, breaking any already-shared link).
// scope changes go through the exact same permission checks
// create/route.ts's own POST already enforces (company-wide requires an
// admin, team requires membership/leadership) -- access only ever
// broadens/narrows for people already inside this company's session-gated
// pages, unlike client_update_pages' public+PIN link, so there's no
// already-shared-secret to invalidate the way a PIN rotation would need.
// 'my_and_unassigned' is deliberately not offered here -- see
// create/route.ts's own comment, it's a dashboard-widget-only scope, not
// something this settings form should let a page drift into or out of.
// Mirrors revoke/route.ts's auth check.
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_TASK_COLUMNS } from "@/lib/publicTaskColumns";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { title, columns, expiresAt, teamId, scope } = body;
  if (!title?.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (scope !== undefined && !["self", "team", "company"].includes(scope)) {
    return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
  }
  if (scope === "team" && !teamId) {
    return NextResponse.json({ error: "Team is required" }, { status: 400 });
  }
  const validKeys = new Set(PUBLIC_TASK_COLUMNS.map(c => c.key));
  const cleanColumns = Array.isArray(columns) ? columns.filter((c: string) => validKeys.has(c as any)) : [];

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: page } = await admin.from("public_task_pages").select("id, company_id, created_by, scope, team_id").eq("id", pageId).maybeSingle();
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  const { data: membership } = await admin
    .from("company_memberships").select("role").eq("company_id", page.company_id).eq("user_id", user.id).maybeSingle();
  const isAdmin = membership?.role === "company_admin";

  if (!isAdmin && page.created_by !== user.id) {
    return NextResponse.json({ error: "Only the page creator or a company admin can edit this page" }, { status: 403 });
  }

  const update: Record<string, any> = {
    title: title.trim(),
    columns: cleanColumns,
    expires_at: expiresAt || null,
  };

  const nextScope = scope ?? page.scope;
  if (scope !== undefined && scope !== page.scope) {
    if (scope === "company" && !isAdmin) {
      return NextResponse.json({ error: "Only company admins can share with the whole company" }, { status: 403 });
    }
    update.scope = scope;
  }
  // teamId applies whenever the (possibly just-changed) scope is "team" --
  // either reassigning an already-team-scoped page to a different team, or
  // supplying the team for a page switching into "team" scope. Cleared to
  // null when moving away from "team" so a stale team_id doesn't linger.
  if (nextScope === "team") {
    if (!teamId) return NextResponse.json({ error: "Team is required" }, { status: 400 });
    const { data: team } = await admin.from("teams").select("id, leader_id").eq("id", teamId).maybeSingle();
    if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
    if (!isAdmin && team.leader_id !== user.id) {
      const { data: teamMembership } = await admin
        .from("team_members").select("id").eq("team_id", teamId).eq("profile_id", user.id).maybeSingle();
      if (!teamMembership) return NextResponse.json({ error: "You're not a member of this team" }, { status: 403 });
    }
    update.team_id = teamId;
  } else if (nextScope !== page.scope) {
    update.team_id = null;
  }

  const { error } = await admin.from("public_task_pages").update(update).eq("id", pageId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
