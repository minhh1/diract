// app/api/residual-land-solver-pages/public/[pageId]/route.ts
// GENUINELY UNAUTHENTICATED customer-facing route. No supabase.auth.getUser()
// or session/membership check -- access is gated only by the page id
// existing, is_active = true, and (if set) the access code matching, on
// EVERY method (saves are server-side writes, so POST/DELETE re-check the
// code rather than trusting that a prior GET did). Uses the service-role
// admin client throughout since there is no user session. Mirrors
// app/api/finance-model-pages/public/[pageId]/route.ts's shape.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadActiveResidualLandSolverPage, codeMatches } from "@/lib/residualLandSolverPageGate";
import { GST_METHODS } from "@/lib/feasibilityCalculator";
import { AU_STATES } from "@/lib/stampDuty";

// Everything the solver reads (lib/residualLandValue.ts) -- unknown keys
// in a submitted calculation are dropped, values coerced to finite number
// or null, so arbitrary jsonb can never land in the table.
const INPUT_KEYS = [
  "dwellingsCount", "avgDwellingSizeSqm", "siteAreaSqm", "expectedSalePricePerDwelling",
  "constructionRatePerSqm", "professionalFeesPct", "contingencyPct", "marketingSellingPct",
  "otherAcquisitionCosts", "holdingCostsAnnual", "projectDurationMonths", "interestRatePct",
  "loanToCostPct", "targetMarginPct",
] as const;

// A customer's what-if list, not a database -- the cap keeps an
// unauthenticated (if code-gated) write endpoint from being unbounded.
const MAX_SAVED_CALCS = 50;

function makeAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

// Shared gate for every method: resolves the page, then enforces the
// access code from ?code=. GET distinguishes "no code yet" (a 200 asking
// for one, leaking nothing) from "wrong code" (401); mutations never get
// the courtesy prompt -- no valid code, no write.
async function gateRequest(req: NextRequest, pageId: string, method: "GET" | "mutation") {
  const admin = makeAdmin();
  const gate = await loadActiveResidualLandSolverPage(admin, pageId);
  if (gate.error) return { error: gate.error, admin, page: null };
  const { page } = gate;

  if (page.access_code) {
    const code = req.nextUrl.searchParams.get("code");
    if (!code && method === "GET") {
      return { error: NextResponse.json({ title: page.title, requiresCode: true }, { status: 200 }), admin, page: null };
    }
    if (!codeMatches(page, code)) {
      return { error: NextResponse.json({ error: "Incorrect access code" }, { status: 401 }), admin, page: null };
    }
  }
  return { error: null as null, admin, page };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const { error, admin, page } = await gateRequest(req, pageId, "GET");
  if (error) return error;

  const { data: calcs, error: listError } = await admin
    .from("residual_land_solver_saved_calcs")
    .select("id, name, inputs, state, gst_method, updated_at")
    .eq("page_id", page.id)
    .order("updated_at", { ascending: false });
  if (listError) return NextResponse.json({ error: listError.message }, { status: 500 });

  return NextResponse.json({ title: page.title, requiresCode: false, savedCalcs: calcs });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const { error, admin, page } = await gateRequest(req, pageId, "mutation");
  if (error) return error;

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 100) : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const inputs: Record<string, number | null> = {};
  for (const key of INPUT_KEYS) {
    const raw = body?.inputs?.[key];
    const n = Number(raw);
    inputs[key] = raw == null || raw === "" || !Number.isFinite(n) ? null : n;
  }
  const state = AU_STATES.includes(body?.state) ? body.state : null;
  const gstMethod = GST_METHODS.includes(body?.gstMethod) ? body.gstMethod : null;

  const { data: existing } = await admin
    .from("residual_land_solver_saved_calcs")
    .select("id").eq("page_id", page.id).eq("name", name).maybeSingle();

  if (existing) {
    const { error: updateError } = await admin
      .from("residual_land_solver_saved_calcs")
      .update({ inputs, state, gst_method: gstMethod, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    return NextResponse.json({ id: existing.id, updated: true });
  }

  const { count } = await admin
    .from("residual_land_solver_saved_calcs")
    .select("id", { count: "exact", head: true }).eq("page_id", page.id);
  if ((count ?? 0) >= MAX_SAVED_CALCS) {
    return NextResponse.json({ error: `Limit of ${MAX_SAVED_CALCS} saved calculations reached -- delete one first` }, { status: 400 });
  }

  const { data: created, error: insertError } = await admin
    .from("residual_land_solver_saved_calcs")
    .insert({ page_id: page.id, company_id: page.company_id, name, inputs, state, gst_method: gstMethod })
    .select("id").single();
  if (insertError || !created) return NextResponse.json({ error: insertError?.message || "Failed to save" }, { status: 500 });

  return NextResponse.json({ id: created.id, updated: false });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const { error, admin, page } = await gateRequest(req, pageId, "mutation");
  if (error) return error;

  const calcId = req.nextUrl.searchParams.get("id");
  if (!calcId) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // page_id in the filter keeps one page's link from deleting another
  // page's calcs even with a guessed uuid.
  const { error: deleteError } = await admin
    .from("residual_land_solver_saved_calcs")
    .delete().eq("id", calcId).eq("page_id", page.id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
