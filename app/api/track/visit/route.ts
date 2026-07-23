// app/api/track/visit/route.ts
// Public write-only endpoint for the client-side page-visit beacon (see
// components/VisitBeacon.tsx, mounted once in app/layout.tsx). No auth --
// same trust model as any client analytics pixel; RLS on page_visits only
// allows inserts, never client-side reads. Country is read server-side from
// Vercel's geo header, never sent by the client itself.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const path = typeof body?.path === "string" ? body.path.slice(0, 500) : null;
  if (!path) return NextResponse.json({ ok: false }, { status: 400 });

  const referrer = typeof body?.referrer === "string" ? body.referrer.slice(0, 500) : null;
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId.slice(0, 100) : null;
  const country = req.headers.get("x-vercel-ip-country") || null;

  const admin = adminClient();
  await admin.from("page_visits").insert({ path, referrer, country, session_id: sessionId });

  return NextResponse.json({ ok: true });
}
