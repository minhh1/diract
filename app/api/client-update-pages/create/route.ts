// app/api/client-update-pages/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { inferFieldType } from "@/lib/clientUpdatePageTableResolver";

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

interface FieldPick { fieldSource: "base" | "custom"; fieldKey: string; label: string }

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId, isAdmin } = auth;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  const { title, clientLabel, slug, baseTable, fields, visibility, teamIds, expiresAt } = body;
  if (!title?.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!baseTable) return NextResponse.json({ error: "A table is required" }, { status: 400 });
  if (!["public", "team"].includes(visibility)) return NextResponse.json({ error: "Invalid visibility" }, { status: 400 });

  const cleanSlug = slugify(slug || title);
  if (!cleanSlug) return NextResponse.json({ error: "Could not derive a URL slug from that title" }, { status: 400 });
  const { data: clash } = await admin.from("client_update_pages").select("id").eq("slug", cleanSlug).maybeSingle();
  if (clash) return NextResponse.json({ error: `The URL "/public/updates/${cleanSlug}" is already taken` }, { status: 409 });

  // Team-only visibility needs at least one team, and the caller must be
  // authorized for every team named -- same matrix
  // app/api/public-tasks/create/route.ts already uses for its own team
  // scope: a company admin, that team's leader, or a member of it.
  const cleanTeamIds: string[] = visibility === "team" && Array.isArray(teamIds) ? [...new Set(teamIds)] : [];
  if (visibility === "team") {
    if (!cleanTeamIds.length) return NextResponse.json({ error: "Select at least one team" }, { status: 400 });
    const { data: teams } = await admin.from("teams").select("id, leader_id").in("id", cleanTeamIds);
    if (!teams || teams.length !== cleanTeamIds.length) return NextResponse.json({ error: "One or more teams not found" }, { status: 404 });
    if (!isAdmin) {
      const { data: memberships } = await admin.from("team_members").select("team_id").eq("profile_id", user.id).in("team_id", cleanTeamIds);
      const memberTeamIds = new Set((memberships || []).map((m: any) => m.team_id));
      const unauthorized = teams.some((t: any) => t.leader_id !== user.id && !memberTeamIds.has(t.id));
      if (unauthorized) return NextResponse.json({ error: "You're not a member of one or more of these teams" }, { status: 403 });
    }
  }

  // Custom tables get a real 6-char id (never a system table name), so
  // source_table_id can be set alongside base_table -- a denormalized
  // convenience FK other code (e.g. the auto_fed rule engine) already
  // expects for a custom-table-backed page.
  const { data: customTable } = await admin.from("company_tables").select("id").eq("id", baseTable).eq("company_id", companyId).maybeSingle();
  const sourceTableId = customTable?.id || null;

  const accessCode = visibility === "public" ? String(Math.floor(100000 + Math.random() * 900000)) : null;

  const { data: page, error } = await admin.from("client_update_pages").insert({
    company_id: companyId, title: title.trim(), client_label: visibility === "public" ? (clientLabel?.trim() || null) : null,
    slug: cleanSlug, access_code: accessCode, visibility,
    expires_at: visibility === "public" ? (expiresAt || null) : null,
    base_table: baseTable, source_table_id: sourceTableId, created_by: user.id,
  }).select("id, slug, access_code, visibility").single();
  if (error || !page) return NextResponse.json({ error: error?.message || "Failed to create page" }, { status: 500 });

  if (cleanTeamIds.length) {
    await admin.from("client_update_page_teams").insert(cleanTeamIds.map((teamId: string) => ({ page_id: page.id, team_id: teamId })));
  }

  const picks: FieldPick[] = Array.isArray(fields) ? fields : [];
  if (picks.length) {
    const rows = await Promise.all(picks.map(async (f: FieldPick, i: number) => {
      const { fieldType, selectOptions } = await inferFieldType(admin, companyId, baseTable, f.fieldSource, f.fieldKey);
      return {
        page_id: page.id, group_id: null, field_source: f.fieldSource, field_key: f.fieldKey,
        label: f.label, display_order: i, field_type: fieldType, select_options: selectOptions,
      };
    }));
    await admin.from("client_update_page_fields").insert(rows);
  }

  return NextResponse.json({ ok: true, page });
}
