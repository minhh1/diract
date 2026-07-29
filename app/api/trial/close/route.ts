// app/api/trial/close/route.ts
// "End trial": soft-closes the CALLER'S CURRENT (active_company_id) company
// -- only ever the trial sandbox company the user is presently switched
// into, never an arbitrary id from the request body. See
// close_trial_sandbox_company in
// supabase/migrations/20260730110000_template_trial_mode.sql -- it also
// independently refuses unless company_type = 'trial_sandbox', so this can
// never soft-close a real company even if called incorrectly.
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export async function POST() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { companyId } = auth;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("close_trial_sandbox_company", {
    p_company_id: companyId,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
