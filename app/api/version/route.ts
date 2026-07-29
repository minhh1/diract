// app/api/version/route.ts
// Polled by components/VersionCheckBanner.tsx to detect a new deployment
// while a user already has the app open -- never cached, always reflects
// whichever deployment is actually serving this request right now.
import { NextResponse } from "next/server";
import { BUILD_ID } from "@/lib/buildId";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ buildId: BUILD_ID });
}
