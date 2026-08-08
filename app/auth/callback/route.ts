// app/auth/callback/route.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { adminClient } from '@/lib/documentTemplateAuth'
import { installTemplateForCompany } from '@/lib/templates/installTemplateForCompany'
import { joinCompanyWithToken } from '@/lib/services/joinCompanyWithToken'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Token can come from query param (email flow) or cookie (Google OAuth flow)
  const inviteToken = searchParams.get('token')
    || request.cookies.get('invite_token')?.value
    || null

  // Where to land after sign-in -- e.g. back on the public task page the
  // user was trying to view, or (via `next`) the reset-password form after
  // a password-recovery link. Only relative paths are honoured.
  const nextParam = searchParams.get('next')
  const postLoginRedirect = request.cookies.get('post_login_redirect')?.value
  const destination = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')
    ? nextParam
    : postLoginRedirect && postLoginRedirect.startsWith('/') && !postLoginRedirect.startsWith('//')
    ? postLoginRedirect
    : '/dashboard/quick-glance'

  if (code) {
    const response = NextResponse.redirect(`${origin}${destination}`)
    if (postLoginRedirect) response.cookies.set('post_login_redirect', '', { maxAge: 0, path: '/' })
    // Tells components/AppLoader.tsx this is a real sign-in (Google OAuth),
    // not just a revisit with a still-valid session -- see its own comment
    // on why. Set here (not client-side) since this whole request is a
    // server-issued redirect; the browser follows it as one fresh
    // navigation, so the client only ever sees the destination page, never
    // this route directly.
    response.cookies.set('nk_just_logged_in', '1', { maxAge: 60, path: '/' })

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return request.cookies.get(name)?.value },
          set(name: string, value: string, options: CookieOptions) {
            response.cookies.set({ name, value, ...options })
          },
          remove(name: string, options: CookieOptions) {
            response.cookies.set({ name, value: '', ...options })
          },
        },
      }
    )

    // Exchange code for session
    const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error || !user) {
      return NextResponse.redirect(`${origin}/login?error=auth_failed`)
    }

    // Ensure profile exists
    await supabase.from('profiles').upsert({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || '',
      is_active: true,
    }, { onConflict: 'id' })

    // The law-firm-au onboarding wizard (app/(marketing)/for/law-firm-au/
    // get-started/page.tsx) creates the company and user in the same
    // request as sign-up, but can only install the Law Firm template
    // client-side if a session comes back immediately. When email
    // confirmation is required instead, there's no session to call the
    // install API with until the user clicks the confirmation link -- which
    // lands here. installTemplate is carried through emailRedirectTo's
    // query string (same pattern this route already uses for `next`), and
    // is a no-op for every other sign-in path since the param is absent.
    const installTemplateSlug = searchParams.get('install_template')
    if (installTemplateSlug) {
      try {
        const { data: profile } = await supabase.from('profiles').select('active_company_id').eq('id', user.id).maybeSingle()
        if (profile?.active_company_id) {
          await installTemplateForCompany({
            supabase,
            admin: adminClient(),
            companyId: profile.active_company_id,
            userId: user.id,
            slug: installTemplateSlug,
            resolutions: {},
            installDashboards: true,
          })
        }
      } catch (err) {
        console.error('[auth/callback] template install failed:', err)
      }
    }

    // Handle invite token -- add user to company. Uses the service-role
    // admin client, not the user's own session client: team_members and
    // registration_tokens both have admin-only RLS write policies, which a
    // brand-new operator-role invitee can't satisfy yet themselves (see
    // joinCompanyWithToken's header comment).
    if (inviteToken) {
      const result = await joinCompanyWithToken(adminClient(), user.id, inviteToken)
      if (result.ok) {
        response.cookies.set('invite_token', '', { maxAge: 0, path: '/' })
      } else {
        console.error('[auth/callback] invite join failed:', result.error)
      }
    }

    return response
  }

  // No code -- redirect to login
  return NextResponse.redirect(`${origin}/login`)
}