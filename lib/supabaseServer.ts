// lib/supabaseServer.ts
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";

// The mobile app has no cookie jar to share with these routes, so it
// authenticates with `Authorization: Bearer <access_token>` instead (see
// mobile/src/lib/api.ts) -- every one of this function's ~40 call sites
// (mostly via authorizeCompanyMember() in lib/documentTemplateAuth.ts)
// gets mobile support for free rather than needing a per-route change.
// Falls through to the normal cookie-based SSR client, unchanged, for the
// web app.
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const headerStore = await headers();
  const authHeader = headerStore.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );
  }

  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // cookies().set() throws when called from a Server Component
            // (only Server Actions/Route Handlers may set cookies) -- every
            // current caller of this function is a Route Handler, so this
            // has never fired in practice. Matches the try/catch Supabase's
            // own Next.js template wraps this in, for the same reason: proxy.ts
            // already refreshes the session cookie on every request before any
            // Server Component renders, so this function seeing a stale/
            // expired cookie is the rarer path, not the load-bearing one --
            // but a future caller from a Server Component shouldn't crash the
            // page over it.
          }
        },
      },
    }
  );
}