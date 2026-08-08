// app/auth/mobile-handoff/route.ts
// Redeem step of the mobile "open on web" auth handoff -- opened by mobile's
// in-app browser (see mobile/src/lib/webHandoff.ts) with a token_hash minted
// by app/api/auth/mobile-handoff/route.ts's own header comment for the full
// design rationale (why verifyOtp here, server-side, rather than sending the
// browser through Supabase's own hosted verify-and-redirect).
//
// Same cookie-writing shape as app/auth/callback/route.ts (build the
// redirect response first, hand its own cookie jar to createServerClient,
// then perform the auth call) -- copied directly from that route rather than
// reinvented.
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function isSafeRedirectPath(path: string | null): path is string {
  return !!path && path.startsWith("/") && !path.startsWith("//");
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const redirectParam = searchParams.get("redirect");
  // Never trust the mint route's own validation alone -- re-checked here too.
  const destination = isSafeRedirectPath(redirectParam) ? redirectParam : "/dashboard/quick-glance";

  if (!tokenHash) return NextResponse.redirect(`${origin}/login`);

  const response = NextResponse.redirect(`${origin}${destination}`);
  response.cookies.set("nk_just_logged_in", "1", { maxAge: 60, path: "/" });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return request.cookies.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (error) return NextResponse.redirect(`${origin}/login?error=auth_failed`);

  return response;
}
