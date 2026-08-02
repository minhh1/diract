// app/api/finance-model-pages/public/[pageId]/fm/route.ts
// GENUINELY UNAUTHENTICATED read-only data for the FULL Finance Model on a
// public share page -- the subtab set (Timeline, Loans, Duty & Fees,
// Feasibility, Attachments) needs the same data the authenticated
// /api/finance-model/* routes serve, but a public viewer has no session.
//
// ONE route rather than an unauthenticated twin of each internal route, so
// there is a single place to audit what a link-holder can reach. Three
// invariants, all enforced here:
//   1. GET only. There is no POST/PATCH/DELETE export in this file, so the
//      public Finance Model is structurally read-only -- not merely
//      read-only because the UI hides its buttons.
//   2. Every resource is scoped to the page's OWN project. `projectId` is
//      resolved from the page row, never taken from the query string, so a
//      link to one project can't be pointed at another.
//   3. Child resources keyed by something other than project (loan phases,
//      interest rates) are verified to belong to this project's loans
//      before anything is returned, closing the same enumeration hole.
//
// Deliberately NOT served here: transactions. The raw Xero ledger is the
// one thing that stays internal-only on a public link.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadActiveFinanceModelPage, codeMatches } from "@/lib/financeModelPageGate";
import { getCustomTable, listCustomTableRows, getCustomTableRowsByIds } from "@/lib/customTableAdmin";
import {
  BUDGET_LINES_SLUG, LOANS_SLUG, LOAN_INTEREST_RATES_SLUG, LOAN_PHASES_SLUG,
  SETTINGS_SLUG, FEASIBILITY_INPUTS_SLUG, FEASIBILITY_SCENARIOS_SLUG,
  loadProjectProperty,
} from "@/lib/financeModel/data";

// Mirrors app/api/finance-model/feasibility-inputs/route.ts's map -- the
// client expects camelCase keys.
const FEASIBILITY_FIELDS: Record<string, string> = {
  dwellingsCount: "dwellings_count", avgDwellingSizeSqm: "avg_dwelling_size_sqm", siteAreaSqm: "site_area_sqm",
  expectedSalePricePerDwelling: "expected_sale_price_per_dwelling", constructionRatePerSqm: "construction_rate_per_sqm",
  professionalFeesPct: "professional_fees_pct", contingencyPct: "contingency_pct", marketingSellingPct: "marketing_selling_pct",
  otherAcquisitionCosts: "other_acquisition_costs", holdingCostsAnnual: "holding_costs_annual",
  projectDurationMonths: "project_duration_months", interestRatePct: "interest_rate_pct", loanToCostPct: "loan_to_cost_pct",
  targetMarginPct: "target_margin_pct", facilityLimit: "facility_limit", facilityInterestRatePct: "facility_interest_rate_pct",
  maxLvrPct: "max_lvr_pct", preferredReturnPct: "preferred_return_pct", promotePct: "promote_pct",
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const gate = await loadActiveFinanceModelPage(admin, pageId);
  if (gate.error) return gate.error;
  const { page } = gate;

  if (page.access_code) {
    const code = req.nextUrl.searchParams.get("code");
    if (!codeMatches(page, code)) return NextResponse.json({ error: "Incorrect access code" }, { status: 401 });
  }

  const companyId = page.company_id;
  const projectId = page.project_id; // never from the query string -- see invariant 2
  const resource = req.nextUrl.searchParams.get("resource");
  const redact = !!(page as any).redact_figures;

  // Strips money before it leaves the server (see
  // supabase/migrations/20260802140000_public_pages_redact_figures.sql for
  // why this is server-decided rather than a request parameter). Amounts
  // become null, not a placeholder string, so nothing recoverable is sent
  // and downstream numeric code never meets a non-numeric value; free text
  // is scrubbed too, since labels and notes carry amounts inline.
  const MONEY_KEYS = /(amount|principal|price|cost|value|fee|duty|interest|balance|limit|total)/i;
  const scrubText = (v: any) => typeof v === "string" ? v
      .replace(/\$\s?\d[\d,]*(\.\d+)?/g, "$\u2022\u2022\u2022\u2022\u2022\u2022")
      // Money is often written into notes without a dollar sign
      // ("336 repayments of 4,849.24"). Two decimal places is the
      // giveaway -- narrow enough not to eat dates or account numbers.
      .replace(/\b\d{1,3}(?:,\d{3})*\.\d{2}\b|\b\d{4,}\.\d{2}\b/g, "\u2022\u2022\u2022\u2022\u2022\u2022") : v;
  const redactRow = (row: any) => {
    if (!redact || !row || typeof row !== "object") return row;
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(row)) {
      // Custom-table values come back as strings as often as numbers, so
      // a typeof check alone lets "745267.00" straight through -- match
      // anything that IS a number or parses as one.
      const isMoney = MONEY_KEYS.test(k) && (typeof v === "number" || (typeof v === "string" && v !== "" && !isNaN(Number(v))));
      out[k] = isMoney ? null : scrubText(v);
    }
    return out;
  };
  const redactRows = (rows: any[]) => redact ? rows.map(redactRow) : rows;

  // Rows of a project-scoped custom table, by slug.
  const rowsOf = async (slug: string) => {
    const table = await getCustomTable(admin, companyId, slug);
    return table ? await listCustomTableRows(admin, table, "project", projectId) : [];
  };

  // Is this loan reachable from the page's project -- either homed on it
  // or split-allocated to it? Two point lookups rather than listing every
  // loan on the project: the Feasibility subtab fires a phases AND a rates
  // request per loan, so a full table read per request meant a dozen
  // concurrent scans and requests that simply never came back.
  const loanBelongsToProject = async (loanId: string): Promise<boolean> => {
    const table = await getCustomTable(admin, companyId, LOANS_SLUG);
    if (!table) return false;
    const [row] = await getCustomTableRowsByIds(admin, table, [loanId]);
    if (row && row.project === projectId) return true;
    const { data } = await admin
      .from("finance_model_loan_allocations")
      .select("loan_id")
      .eq("company_id", companyId).eq("project_id", projectId).eq("loan_id", loanId)
      .maybeSingle();
    return !!data;
  };

  switch (resource) {
    case "budget-lines":
      return NextResponse.json({ budgetLines: redactRows(await rowsOf(BUDGET_LINES_SLUG)), figuresRedacted: redact });

    case "budget-categories": {
      const { data } = await admin
        .from("finance_model_budget_categories").select("*").eq("company_id", companyId).order("display_order");
      return NextResponse.json({ categories: data || [] });
    }

    case "settings": {
      const rows = await rowsOf(SETTINGS_SLUG);
      return NextResponse.json({ gstMethod: rows[0]?.gst_method ?? null });
    }

    case "tasks": {
      // Mirrors app/api/finance-model/tasks/route.ts's shape exactly (the
      // Timeline subtab is shared between the authenticated dashboard and
      // this public page) -- the columns this used to select (status,
      // display_order, parent_task_id, blocked_by_task_id) don't exist on
      // `tasks` at all, so this silently returned zero rows on every public
      // page (Supabase's `error` was never checked, so the empty `data`
      // fell through as if the project genuinely had no tasks).
      const { data: taskRows } = await admin
        .from("tasks")
        .select(`
          id, name, notes, start_date, due_date, is_completed, assignee_id, category, source_template_item_id,
          assignee:assignee_id(id, full_name), task_statuses:status_id(label, color_hex),
          task_teams(team_id, teams:team_id(id, team_name))
        `)
        .eq("project_id", projectId).is("deleted_at", null).order("due_date", { ascending: true, nullsFirst: false });
      const taskIds = (taskRows || []).map((t: any) => t.id);
      const { data: dependencies } = taskIds.length
        ? await admin.from("task_dependencies").select("task_id, depends_on_task_id").in("task_id", taskIds)
        : { data: [] };
      const tasks = (taskRows || []).map((t: any) => ({
        ...t,
        teams: (t.task_teams || []).map((tt: any) => tt.teams).filter(Boolean),
        task_teams: undefined,
      }));
      // Bundled into this same response rather than three more resource
      // cases: TimelineSubtab's load() fetched these directly from Supabase
      // (teams/profiles/projects), which returns nothing under RLS with no
      // session -- same class of bug as the tasks query above, just failing
      // quietly instead of on the wrong columns.
      const [{ data: teams }, { data: projectRow }] = await Promise.all([
        admin.from("teams").select("id, team_name, category_tags").eq("company_id", companyId).eq("is_active", true).order("team_name"),
        admin.from("projects").select("created_at").eq("id", projectId).single(),
      ]);
      return NextResponse.json({
        tasks, dependencies: dependencies || [], teams: teams || [],
        projectCreatedAt: projectRow?.created_at || null,
      });
    }

    case "loans": {
      const home = await rowsOf(LOANS_SLUG);
      const homeIds = new Set(home.map(l => l.id));
      const { data: allocRows } = await admin
        .from("finance_model_loan_allocations").select("loan_id, project_id, split_percent").eq("company_id", companyId);
      const percentHere = new Map<string, number>();
      const anySplit = new Set<string>();
      for (const r of allocRows || []) {
        anySplit.add(r.loan_id);
        if (r.project_id === projectId) percentHere.set(r.loan_id, Number(r.split_percent));
      }
      const foreignIds = [...percentHere.keys()].filter(id => !homeIds.has(id));
      const table = await getCustomTable(admin, companyId, LOANS_SLUG);
      const foreign = table ? await getCustomTableRowsByIds(admin, table, foreignIds) : [];
      const loans = [...home, ...foreign].map(l => {
        const principal = Number(l.principal_amount) || 0;
        const isSplit = anySplit.has(l.id);
        const percent = percentHere.has(l.id) ? percentHere.get(l.id)! : isSplit ? 0 : (homeIds.has(l.id) ? 100 : 0);
        return { ...l, allocation_percent: percent, allocated_principal_amount: principal * (percent / 100), is_split: isSplit };
      });
      return NextResponse.json({ loans: redactRows(loans), figuresRedacted: redact });
    }

    case "loan-phases":
    case "loan-interest-rates": {
      const loanId = req.nextUrl.searchParams.get("loanId");
      if (!loanId) return NextResponse.json({ error: "loanId is required" }, { status: 400 });
      // Invariant 3 -- a loan from another project is simply not visible.
      if (!(await loanBelongsToProject(loanId))) {
        return NextResponse.json(resource === "loan-phases" ? { phases: [] } : { rates: [] });
      }
      const slug = resource === "loan-phases" ? LOAN_PHASES_SLUG : LOAN_INTEREST_RATES_SLUG;
      const table = await getCustomTable(admin, companyId, slug);
      const rows = table ? await listCustomTableRows(admin, table, "loan", loanId) : [];
      const safeRows = redactRows(rows);
      return NextResponse.json(resource === "loan-phases" ? { phases: safeRows } : { rates: safeRows });
    }

    case "feasibility-inputs": {
      const rows = await rowsOf(FEASIBILITY_INPUTS_SLUG);
      const row = rows[0];
      const inputs: Record<string, number | null> = {};
      for (const [jsKey, dbKey] of Object.entries(FEASIBILITY_FIELDS)) {
        inputs[jsKey] = row?.[dbKey] != null ? Number(row[dbKey]) : null;
      }
      return NextResponse.json({ inputs: redact ? redactRow(inputs) : inputs, figuresRedacted: redact });
    }

    case "feasibility-scenarios":
      return NextResponse.json({ scenarios: redactRows(await rowsOf(FEASIBILITY_SCENARIOS_SLUG)) });

    case "templates": {
      // The Timeline's "Apply template" library. Loaded via the browser's
      // own Supabase client internally, which returns nothing anonymously
      // under RLS -- so a public viewer saw an empty template list and no
      // way to see how the Gantt is actually built. Company-wide
      // templates carry no project figures, just task names and offsets.
      const [{ data: templates }, { data: project }] = await Promise.all([
        admin.from("checklist_templates")
          .select("*, items:checklist_template_items(*)")
          .eq("company_id", companyId).order("created_at"),
        admin.from("projects").select("created_at, estimated_completion_date").eq("id", projectId).maybeSingle(),
      ]);
      return NextResponse.json({
        templates: (templates || []).map((t: any) => ({
          ...t,
          items: (t.items || []).sort((a: any, b: any) => a.display_order - b.display_order),
        })),
        project: project || null,
      });
    }

    case "attachments": {
      const { data } = await admin
        .from("finance_model_attachments").select("*").eq("project_id", projectId).order("created_at", { ascending: false });
      return NextResponse.json({ attachments: data || [] });
    }

    case "overview": {
      const { data: project } = await admin.from("projects").select("name").eq("id", projectId).maybeSingle();
      // projectId is handed back so the public shell can mount the
      // subtabs, which are written against it. Harmless to expose: every
      // read still goes through THIS route, which resolves the project
      // from the page and ignores any caller-supplied id.
      return NextResponse.json({
        projectId,
        companyId,
        projectName: project?.name ?? null,
        property: redact ? redactRow(await loadProjectProperty(admin, projectId)) : await loadProjectProperty(admin, projectId),
        figuresRedacted: redact,
      });
    }

    default:
      return NextResponse.json({ error: "Unknown resource" }, { status: 400 });
  }
}
