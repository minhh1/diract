// app/api/outlook/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { APP_URL, MICROSOFT_TENANT, OUTLOOK_REDIRECT_URI } from "@/lib/config";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    console.error('Microsoft OAuth error:', error);
    return NextResponse.redirect(
      `${APP_URL}/dashboard/outlook?error=` + error
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${APP_URL}/dashboard/outlook?error=no_code`
    );
  }

  // Exchange code for tokens
  const tokenRes = await fetch(`https://login.microsoftonline.com/${MICROSOFT_TENANT}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      redirect_uri: OUTLOOK_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  const tokens = await tokenRes.json();
  console.log('Outlook token exchange result:', {
    hasAccessToken: !!tokens.access_token,
    hasRefreshToken: !!tokens.refresh_token,
    error: tokens.error,
  });

  if (tokens.error) {
    return NextResponse.redirect(
      `${APP_URL}/dashboard/outlook?error=` + tokens.error
    );
  }

  // Get the connected mailbox's address
  const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = await profileRes.json();
  const email = profile.mail || profile.userPrincipalName;
  console.log('Microsoft profile email:', email);

  // Create Supabase client
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignore cookie errors in route handlers
          }
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // User not logged in -- redirect to login, they'll need to reconnect
    return NextResponse.redirect(
      `${APP_URL}/login?redirect=/dashboard/outlook`
    );
  }

  const { data: prof } = await supabase
    .from('profiles')
    .select('active_company_id')
    .eq('id', user.id)
    .single();

  const { error: upsertError } = await supabase
    .from('user_outlook_tokens')
    .upsert({
      user_id: user.id,
      company_id: prof?.active_company_id,
      email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: new Date(
        Date.now() + (tokens.expires_in || 3600) * 1000
      ).toISOString(),
    }, { onConflict: 'user_id' });

  if (upsertError) {
    console.error('Outlook token upsert error:', upsertError);
    return NextResponse.redirect(
      `${APP_URL}/dashboard/outlook?error=${upsertError.message}`
    );
  }

  return NextResponse.redirect(
    `${APP_URL}/dashboard/outlook?connected=true`
  );
}
