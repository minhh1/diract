// app/api/join-company/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";
import { joinCompanyWithToken } from "@/lib/services/joinCompanyWithToken";

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { token } = body;
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[join-company] Missing env vars:', { supabaseUrl: !!supabaseUrl, serviceRoleKey: !!serviceRoleKey });
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const result = await joinCompanyWithToken(supabaseAdmin, user.id, token);
  if (!result.ok) {
    console.error('[join-company] failed:', result.error);
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  console.log('[join-company] success -- user', user.id, 'joined company', result.companyId);
  return NextResponse.json(result);
}