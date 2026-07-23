import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server'

// Fire-and-forget invocation counter feeding the Platform Health tab's
// "API calls per day, per endpoint" chart — path + method + timestamp only,
// no status code (Proxy runs pre-handler, before a status exists) and no
// request body. Logged via event.waitUntil so it doesn't add latency to the
// actual request and can't get cut off once the response is returned.
function logApiInvocation(pathname: string, method: string): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return Promise.resolve();
  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  return Promise.resolve(admin.from('api_invocations').insert({ path: pathname, method })).then(() => {}, () => {});
}

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const { pathname } = request.nextUrl;

  // Allow Google verification files through
  if (pathname.startsWith('/google')) return NextResponse.next();

  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/track/')) {
    event.waitUntil(logApiInvocation(pathname, request.method));
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  // getSession() reads and verifies the JWT from the cookie locally — no
  // network round-trip to Supabase's auth server. Proxy runs on every
  // request (including prefetches), so per Next.js's own guidance this
  // check should stay "optimistic": redirect based on the cookie, and leave
  // real authorization to RLS and each page's own checks, not Proxy. That's
  // already how this app works — Proxy is only a UX-level redirect gate,
  // never the actual security boundary.
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user

  // Logged-in user on homepage → redirect to dashboard immediately
  if (user && pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard/projects', request.url))
  }

  // Unauthenticated user on dashboard → redirect to login
  if (!user && pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
    '/dashboard/:path*',
  ],
}