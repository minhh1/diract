// app/api/xero/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { APP_URL, XERO_REDIRECT_URI } from "@/lib/config";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');

  const cookieStore = await cookies();
  const expectedState = cookieStore.get('xero_oauth_state')?.value;

  if (error) {
    return NextResponse.redirect(`${APP_URL}/dashboard/admin?tab=xero&xero=error&message=${encodeURIComponent(error)}`);
  }
  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(`${APP_URL}/dashboard/admin?tab=xero&xero=error&message=${encodeURIComponent('Invalid or expired request')}`);
  }

  // Exchange code for tokens
  const basicAuth = Buffer.from(
    `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`
  ).toString('base64');

  const tokenRes = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: XERO_REDIRECT_URI,
    }),
  });
  const tokens = await tokenRes.json();

  if (tokens.error) {
    const detail = tokens.error_description ? `${tokens.error}: ${tokens.error_description}` : tokens.error;
    return NextResponse.redirect(`${APP_URL}/dashboard/admin?tab=xero&xero=error&message=${encodeURIComponent(detail)}`);
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Ignore cookie errors in route handlers
          }
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${APP_URL}/login?redirect=/dashboard/admin`);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_company_id')
    .eq('id', user.id)
    .single();
  const companyId = profile?.active_company_id;
  if (!companyId) {
    return NextResponse.redirect(`${APP_URL}/dashboard/admin?tab=xero&xero=error&message=${encodeURIComponent('No active company')}`);
  }

  // Which organisation(s) the user just authorized -- a single grant can
  // cover more than one, so this needs a separate call, not just the token
  // response.
  const connectionsRes = await fetch('https://api.xero.com/connections', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const tenants = await connectionsRes.json();

  if (!Array.isArray(tenants) || tenants.length === 0) {
    return NextResponse.redirect(`${APP_URL}/dashboard/admin?tab=xero&xero=error&message=${encodeURIComponent('No organisations were authorized')}`);
  }

  const expiresAt = new Date(Date.now() + (tokens.expires_in || 1800) * 1000).toISOString();

  const rows = tenants.map((t: { id: string; tenantId: string; tenantName?: string }) => ({
    company_id: companyId,
    tenant_id: t.tenantId,
    tenant_name: t.tenantName || null,
    xero_connection_ref_id: t.id,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expires_at: expiresAt,
    connected_by: user.id,
  }));

  const { error: upsertError } = await supabase
    .from('company_xero_connections')
    .upsert(rows, { onConflict: 'company_id,tenant_id' });

  const response = NextResponse.redirect(
    upsertError
      ? `${APP_URL}/dashboard/admin?tab=xero&xero=error&message=${encodeURIComponent(upsertError.message)}`
      : `${APP_URL}/dashboard/admin?tab=xero&xero=connected`
  );
  response.cookies.set('xero_oauth_state', '', { maxAge: 0, path: '/' });
  return response;
}
