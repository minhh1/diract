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
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}