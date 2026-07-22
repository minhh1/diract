// app/api/schema/revert/route.ts
// Reverts the caller's company schema back to how it looked right after a
// given schema_change_log entry (see supabase/schema_change_log.sql's
// revert_schema_change()). Calls the RPC through the user's own session
// (not the admin/service-role client) so the function's internal auth.uid()
// membership check resolves correctly -- see the comment in
// revert_schema_change for why that check exists at all.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { companyId } = auth;

  const body = await req.json().catch(() => ({}));
  const logSeq = body.logSeq;
  if (typeof logSeq !== "number") {
    return NextResponse.json({ error: "logSeq is required" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("revert_schema_change", {
    p_company_id: companyId,
    p_log_seq: logSeq,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ status: "reverted" });
}
