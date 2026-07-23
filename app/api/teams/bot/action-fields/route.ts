// app/api/teams/bot/action-fields/route.ts
// Admin-only read/write for teams_bot_action_field_settings -- the per-
// company configuration of which create_task/create_project fields the
// Teams bot must ask about before creating (required) and what to fall
// back to silently when a field is left optional (default_value). See
// lib/ai/actionFields.ts for the merge logic and
// app/api/teams/bot/[companyId]/route.ts for where this is consumed.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadFieldConfig, type ActionType } from "@/lib/ai/actionFields";

function parseActionType(value: string | null): ActionType | null {
  return value === "create_task" || value === "create_project" ? value : null;
}

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const actionType = parseActionType(req.nextUrl.searchParams.get("actionType"));
  if (!actionType) return NextResponse.json({ error: "actionType must be create_task or create_project" }, { status: 400 });

  const fields = await loadFieldConfig(admin, companyId, actionType);
  return NextResponse.json({ fields });
}

export async function PUT(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const actionType = parseActionType(body?.action_type);
  const fieldKey = typeof body?.field_key === "string" ? body.field_key : null;
  if (!actionType || !fieldKey) {
    return NextResponse.json({ error: "action_type and field_key are required" }, { status: 400 });
  }

  // Re-derive the field's identity (built-in vs custom, its custom_field_id)
  // from the same merged catalog the bot itself uses, rather than trusting
  // is_custom/custom_field_id from the request body -- also how "name"/
  // "project_name" (always-required, not configurable) get rejected below.
  const fields = await loadFieldConfig(admin, companyId, actionType);
  const field = fields.find((f) => f.key === fieldKey);
  if (!field) return NextResponse.json({ error: "Unknown field" }, { status: 404 });
  if (field.alwaysRequired) {
    return NextResponse.json({ error: `"${field.label}" is always required and can't be reconfigured` }, { status: 400 });
  }

  const required = typeof body.required === "boolean" ? body.required : field.required;
  const defaultValue = typeof body.default_value === "string" && body.default_value.trim() ? body.default_value.trim() : null;

  const { error } = await admin.from("teams_bot_action_field_settings").upsert(
    {
      company_id: companyId,
      action_type: actionType,
      field_key: fieldKey,
      is_custom: field.isCustom,
      custom_field_id: field.customFieldId ?? null,
      required,
      default_value: defaultValue,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id,action_type,field_key" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
