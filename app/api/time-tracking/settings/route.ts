// app/api/time-tracking/settings/route.ts
// Admin-only read/write for time_tracking_settings.enabled -- the company-
// level gate app/api/time-tracking/sync/route.ts checks before accepting
// any browser-extension activity. Mirrors app/api/ai/settings/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const { data, error } = await admin
    .from("time_tracking_settings")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ settings: data ?? { company_id: companyId, enabled: false } });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (typeof body?.enabled !== "boolean") return NextResponse.json({ error: "enabled (boolean) is required" }, { status: 400 });

  const { data, error } = await admin
    .from("time_tracking_settings")
    .upsert({ company_id: companyId, enabled: body.enabled, updated_at: new Date().toISOString() }, { onConflict: "company_id" })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ settings: data });
}
