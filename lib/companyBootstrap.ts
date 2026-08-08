"use client";

// lib/companyBootstrap.ts
// The one place that resolves "who is signed in, and what company/role do
// they have" plus fires every warm-up call that depends on that identity
// (custom tables/dashboards lists, relation picker options, table/dashboard
// shells). Both components/CompanyContext.tsx (the app's actual identity
// source of truth) and components/AppLoader.tsx (the loading screen, which
// sits ABOVE CompanyProvider in the tree and so can't just call useCompany())
// call this same function -- module-level in-flight dedup (same pattern as
// lib/hooks/useCustomTables.ts's fetchTables) means whichever mounts first
// does the one real network round trip; the other just awaits the same
// promise, so this never doubles up the query regardless of mount order.
import { supabase } from "@/lib/supabase";
import { perfLog } from "@/lib/perfLog";
import { warmRelationOptionsCache } from "@/components/dashboard/RelationPicker";
import { warmCustomTables } from "@/lib/hooks/useCustomTables";
import { warmCustomDashboards } from "@/lib/hooks/useCustomDashboards";
import { warmCustomTableShells, startSystemTableRowPrefetch, warmSystemTableShells, warmSystemTableViewConfig } from "@/lib/hooks/prefetchShells";
import { warmQuickGlanceProjects, warmQuickGlanceLayout } from "@/lib/hooks/prefetchQuickGlance";
import { emptyInvoiceSettings, type InvoiceSettings } from "@/lib/invoices/types";
import type { TableLabelOverrides, DisabledSystemTables } from "@/components/CompanyContext";

export interface CompanyBootstrapResult {
  companyId: string | null;
  companyName: string | null;
  companyType: string | null;
  userId: string;
  userEmail: string | null;
  isAdmin: boolean;
  isSiteAdmin: boolean;
  // The caller's company_memberships role for the active company (e.g.
  // 'company_admin', 'manager', 'operator', 'kiosk') -- not just the
  // isAdmin boolean derived from it. components/CompanyContext.tsx uses
  // this directly to switch a kiosk session into its restricted shell
  // (app/(app)/dashboard/layout.tsx); everything else in the app so far
  // has only needed the isAdmin boolean.
  role: string | null;
  // Team membership/leadership -- see lib/teamScope.ts's own team_members
  // query for why `teams` isn't itself company-scoped (checking membership
  // first is what keeps this leak-free). Used to gate/scope the Team
  // Leader-facing slice of Admin > Default Settings (see
  // components/admin/AdminDefaultSettingsTab.tsx) and to resolve a member's
  // own effective team/person-scoped defaults.
  myTeamIds: string[];
  ledTeamIds: string[];
  tableLabelOverrides: TableLabelOverrides;
  disabledSystemTables: DisabledSystemTables;
  invoiceSettings: InvoiceSettings;
  logoUrl: string | null;
}

// Six discrete, real milestones -- not a fake timer -- for AppLoader's
// progress bar. Every step is awaited for real completion, so the bar only
// reaches a step once that data is genuinely cached, not just requested.
// "shells" is schema/customFields/relatedFields/saved-view-config/rows for
// the four system tables AND schema/fields/rows/column-sort-config/default-
// filters for every custom table/dashboard (company-specific, could be
// dozens) -- together they're what makes EVERY table, system or custom,
// feel instant the moment the loading screen dismisses, not just whichever
// one the user happened to land on first.
//
// This used to be two separate steps ("tableShells" for system tables,
// "shells" for custom tables), each independently deciding which of its own
// jobs were worth awaiting vs. leaving fire-and-forget -- which is exactly
// how system-table row prefetch quietly ended up NOT awaited while
// custom-table row prefetch was, on two different code-review passes. One
// merged step with one Promise.all over every job for both means there's
// no separate place left for that kind of split-brain drift to hide: every
// "is this table ready" job either blocks the splash together, or none of
// them do. The AppLoader's own ceiling still protects a company with a
// very large table count from a truly dead network.
export type BootstrapStep = "session" | "identity" | "tables" | "dashboards" | "relations" | "shells";
export const BOOTSTRAP_STEPS: BootstrapStep[] = ["session", "identity", "tables", "dashboards", "relations", "shells"];

interface BootstrapOptions {
  onStep?: (step: BootstrapStep) => void;
}

let inFlight: Promise<CompanyBootstrapResult | null> | null = null;
// Both CompanyContext and AppLoader call resolveCompanyBootstrap, typically
// within the same synchronous commit (AppLoader always renders children now,
// so both mount in the same initial pass) -- but which one happens to call
// first (and so becomes the one whose in-flight promise the other awaits) is
// an implementation detail, not something either caller should have to know.
// A list of listeners, notified on every step regardless of registration
// order, means a "late" caller's progress callback still fires for every
// step instead of only the first caller's doing so.
let stepListeners: Array<(step: BootstrapStep) => void> = [];
function notifyStep(step: BootstrapStep): void {
  for (const fn of stepListeners) fn(step);
}

// Resolves to null when there's no signed-in user -- callers (CompanyContext,
// AppLoader) both treat that as "nothing to warm, show the app/login as-is."
async function runBootstrap(): Promise<CompanyBootstrapResult | null> {
  perfLog("companyBootstrap: start");
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  notifyStep("session");
  perfLog("companyBootstrap: session resolved");
  if (!user) return null;

  const [{ data: prof }, { data: allMemberships }, { data: myTeamRows }, { data: ledTeamRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("active_company_id, is_site_admin, companies:active_company_id(name, company_type, table_label_overrides, disabled_system_tables, invoice_settings, logo_url)")
      .eq("id", user.id)
      .single(),
    supabase
      .from("company_memberships")
      .select("company_id, role")
      .eq("user_id", user.id),
    supabase
      .from("team_members")
      .select("team_id")
      .eq("profile_id", user.id),
    supabase
      .from("teams")
      .select("id")
      .eq("leader_id", user.id)
      .eq("is_active", true),
  ]);
  notifyStep("identity");
  perfLog("companyBootstrap: identity resolved");

  const cid = prof?.active_company_id || null;
  const companies = prof?.companies as any;
  const activeRole = (allMemberships || []).find(m => m.company_id === cid)?.role ?? null;
  const result: CompanyBootstrapResult = {
    companyId: cid,
    companyName: companies?.name || null,
    companyType: companies?.company_type || null,
    userId: user.id,
    userEmail: user.email ?? null,
    isAdmin: activeRole === "company_admin",
    isSiteAdmin: !!prof?.is_site_admin,
    role: activeRole,
    myTeamIds: (myTeamRows || []).map(t => t.team_id),
    ledTeamIds: (ledTeamRows || []).map(t => t.id),
    tableLabelOverrides: companies?.table_label_overrides || {},
    disabledSystemTables: companies?.disabled_system_tables || {},
    invoiceSettings: { ...emptyInvoiceSettings(), ...(companies?.invoice_settings || {}) },
    logoUrl: companies?.logo_url || null,
  };

  // A kiosk session's active_company_id() is permanently NULL (see
  // supabase/migrations/20260808200100_kiosk_rls_lockdown.sql), so every
  // one of these warmers would just query tables it's denied against --
  // skip them outright rather than firing requests that can only ever come
  // back empty. Still notify every step so AppLoader's progress bar (which
  // gates on all six steps firing) doesn't hang for a kiosk login.
  if (activeRole !== "kiosk") {
    await warmCustomTables(user.id).catch(() => {});
    notifyStep("tables");
    await warmCustomDashboards(user.id).catch(() => {});
    notifyStep("dashboards");
    await warmRelationOptionsCache().catch(() => {});
    notifyStep("relations");
    // Every remaining "is this table ready to render" job, system and custom
    // alike, in one Promise.all -- schema/customFields/relatedFields/saved-
    // view-config/rows for the 4 system tables, schema/fields/rows/column-
    // sort-config/default-filters for every custom table/dashboard. All four
    // jobs warm independent data for independent tables, so there's no
    // ordering dependency between them; the step only reports done once ALL
    // of them finish, so the splash keeps gating on "nothing left to fetch
    // anywhere," not just whichever table happens to run first.
    await Promise.all([
      warmSystemTableShells(cid).catch(() => {}),
      warmSystemTableViewConfig(cid, user.id, result.myTeamIds).catch(() => {}),
      startSystemTableRowPrefetch(cid).catch(() => {}),
      warmCustomTableShells(cid, user.id, result.myTeamIds).catch(() => {}),
      // Property Developer Quick Glance's own bespoke join -- see that
      // warmer's own doc comment for why the generic warmers above don't
      // already cover it. No-op for any other company type.
      cid && result.companyType === 'Property Developer'
        ? warmQuickGlanceProjects(cid).catch(() => {})
        : Promise.resolve(),
      // The Quick Glance widget ARRANGEMENT itself -- every company type,
      // not just Property Developer (see that warmer's own doc comment).
      // Quick Glance is almost always the landing page right after this
      // splash dismisses, so leaving this unwarmed meant it showed its own
      // second spinner immediately after AppLoader's -- reported live as
      // "still spinning on first load" despite every other step here
      // already being warm.
      cid ? warmQuickGlanceLayout(cid, result.companyType).catch(() => {}) : Promise.resolve(),
    ]);
    notifyStep("shells");
  } else {
    notifyStep("tables"); notifyStep("dashboards"); notifyStep("relations"); notifyStep("shells");
  }

  perfLog("companyBootstrap: done");
  return result;
}

export function resolveCompanyBootstrap(options: BootstrapOptions = {}): Promise<CompanyBootstrapResult | null> {
  if (options.onStep) stepListeners.push(options.onStep);
  if (inFlight) return inFlight;
  inFlight = runBootstrap().finally(() => { inFlight = null; stepListeners = []; });
  return inFlight;
}
