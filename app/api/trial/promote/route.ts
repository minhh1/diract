// app/api/trial/promote/route.ts
// "Keep it": clears company_type on the CALLER'S CURRENT (active_company_id)
// company, same "always the active company, never a body param" reasoning
// as trial/close/route.ts. See promote_trial_sandbox_company in
// supabase/migrations/20260730110000_template_trial_mode.sql.
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export async function POST() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { companyId } = auth;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("promote_trial_sandbox_company", {
    p_company_id: companyId,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
