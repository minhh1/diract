// app/api/time-tracking/sync/route.ts
// Receives a batch of raw browser-activity segments from the time-tracking
// extension (see extension/background.ts) and inserts them into
// time_tracking_segments. Bearer-token authed the same way mobile/ already
// is -- lib/supabaseServer.ts treats a Bearer session identically to the
// web app's cookie session, so authorizeCompanyMember() needs no changes
// for a non-browser-session caller.
//
// 403s unless a company admin has explicitly turned this on
// (time_tracking_settings.enabled) -- workplace activity tracking is more
// sensitive than this app's other consent-gated features (see the AI data
// access grant flow), so it never defaults to on and a member's own
// extension can't silently start syncing before an admin opts the company in.
//
// matched_project_id is resolved here, server-side, with
// lib/ai/actions.ts's resolveProjectByName -- the same name/custom-field/
// fuzzy-token matcher the Teams bot already uses to turn free text into a
// project, reused as-is rather than reimplementing matching logic. Segments
// that don't resolve to exactly one project stay unmatched and are excluded
// from drafting (see app/api/time-entries/auto-generate/route.ts) in v1 --
// no manual-match UI yet.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { resolveProjectByName } from "@/lib/ai/actions";

interface RawSegment {
  domain: string;
  title: string | null;
  startedAt: string;
  endedAt: string;
}

function isValidSegment(s: any): s is RawSegment {
  if (!s || typeof s.domain !== "string" || !s.domain.trim()) return false;
  if (typeof s.startedAt !== "string" || typeof s.endedAt !== "string") return false;
  const start = new Date(s.startedAt).getTime();
  const end = new Date(s.endedAt).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user } = auth;

  const { data: settings } = await admin.from("time_tracking_settings").select("enabled").eq("company_id", companyId).maybeSingle();
  if (!settings?.enabled) return NextResponse.json({ error: "Time tracking is not enabled for this company" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const rawSegments: unknown[] = Array.isArray(body?.segments) ? body.segments : [];
  const segments = rawSegments.filter(isValidSegment);
  if (!segments.length) return NextResponse.json({ error: "No valid segments" }, { status: 400 });

  // Dedupe by search text within this batch -- several segments on the same
  // page (e.g. a long research session with brief tab switches away and
  // back) shouldn't each pay for their own resolveProjectByName round trip.
  const matchByText = new Map<string, string | null>();
  for (const s of segments) {
    const text = (s.title || s.domain).trim();
    if (matchByText.has(text)) continue;
    const result = await resolveProjectByName(admin, companyId, text);
    matchByText.set(text, result.status === "found" ? result.match.id : null);
  }

  const rows = segments.map((s) => ({
    company_id: companyId,
    user_id: user.id,
    domain: s.domain.trim(),
    title: s.title?.trim() || null,
    started_at: s.startedAt,
    ended_at: s.endedAt,
    matched_project_id: matchByText.get((s.title || s.domain).trim()) ?? null,
  }));

  const { error } = await admin.from("time_tracking_segments").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ inserted: rows.length });
}
