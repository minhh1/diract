// app/api/join-company/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";

// Service role client — bypasses RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  console.log('[join-company] route called');
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { token } = body;
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });

  // Get the current user from the session
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  // Look up token using admin client (bypasses RLS)
  const { data: tokenData, error: tokenError } = await supabaseAdmin
    .from('registration_tokens')
    .select('id, company_id, used_at, expires_at, company:company_id(id, name)')
    .eq('token', token)
    .single();

  console.log('[join-company] token lookup:', { found: !!tokenData, error: tokenError?.message });

  if (!tokenData) {
    return NextResponse.json(
      { error: 'Invalid token — not found' },
      { status: 400 }
    );
  }

  if (tokenData.used_at) {
    return NextResponse.json(
      { error: 'This invitation link has already been used' },
      { status: 400 }
    );
  }

  if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
    return NextResponse.json(
      { error: 'This invitation link has expired' },
      { status: 400 }
    );
  }

  const companyId = tokenData.company_id;
  if (!companyId) {
    return NextResponse.json(
      { error: 'Token has no company associated' },
      { status: 400 }
    );
  }

  // Check if already a member
  const { data: existing } = await supabaseAdmin
    .from('company_memberships')
    .select('id')
    .eq('company_id', companyId)
    .eq('user_id', user.id)
    .single();

  if (!existing) {
    // Insert membership using admin client (bypasses RLS)
    const { error: memberError } = await supabaseAdmin
      .from('company_memberships')
      .upsert({
        company_id: companyId,
        user_id: user.id,
        role: 'operator',  // never carry over role from other companies
      }, { onConflict: 'company_id,user_id', ignoreDuplicates: false });
      // ignoreDuplicates: false means it UPDATES existing rows too

    if (memberError) {
      console.error('[join-company] membership upsert error:', memberError);
      return NextResponse.json({ error: memberError.message }, { status: 500 });
    }
  }

  // Switch active company
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({ active_company_id: companyId })
    .eq('id', user.id);

  if (profileError) {
    console.error('[join-company] profile update error:', profileError);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  // Mark token as used
  await supabaseAdmin
    .from('registration_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', tokenData.id);

  console.log('[join-company] success — user', user.id, 'joined company', companyId);

  return NextResponse.json({
    ok: true,
    companyId,
    companyName: (tokenData.company as any)?.name || 'Company',
  });
}