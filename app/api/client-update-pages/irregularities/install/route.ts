// app/api/client-update-pages/irregularities/install/route.ts
// Self-service install of the Irregularities data-quality board for the
// caller's own company -- see supabase/migrations/20260729410000_install_irregularities_board_rpc.sql.
// Calls the RPC through the user's own session (not the admin/service-role
// client) so install_irregularities_board's internal auth.uid() membership
// check resolves correctly -- same pattern as the template marketplace's
// install route.
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export async function POST() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { companyId } = auth;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("install_irregularities_board", { p_company_id: companyId });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
