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
import { warmCustomTableShells, startSystemTableRowPrefetch, warmSystemTableShells } from "@/lib/hooks/prefetchShells";
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

// Seven discrete, real milestones -- not a fake timer -- for AppLoader's
// progress bar. Every step is awaited for real completion, so the bar only
// reaches a step once that data is genuinely cached, not just requested.
// "tableShells" is schema/customFields/relatedFields for the four system
// tables; "shells" is the same idea for every custom table/dashboard
// (company-specific, could be dozens) -- together they're what makes EVERY
// table, system or custom, feel instant the moment the loading screen
// dismisses, not just whichever one the user happened to land on first.
// "shells" used to be reported as soon as that prefetch was *kicked off*
// rather than once it finished, deliberately left running in the
// background -- which meant a session's first visit to any custom table
// still paid a full cold load whenever it happened, just silently, after
// the splash was already gone. Now genuinely awaited like every other step;
// the AppLoader's own ceiling still protects a company with a very large
// table count from a truly dead network.
export type BootstrapStep = "session" | "identity" | "tables" | "dashboards" | "relations" | "tableShells" | "shells";
export const BOOTSTRAP_STEPS: BootstrapStep[] = ["session", "identity", "tables", "dashboards", "relations", "tableShells", "shells"];

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
  const result: CompanyBootstrapResult = {
    companyId: cid,
    companyName: companies?.name || null,
    companyType: companies?.company_type || null,
    userId: user.id,
    userEmail: user.email ?? null,
    isAdmin: (allMemberships || []).find(m => m.company_id === cid)?.role === "company_admin",
    isSiteAdmin: !!prof?.is_site_admin,
    myTeamIds: (myTeamRows || []).map(t => t.team_id),
    ledTeamIds: (ledTeamRows || []).map(t => t.id),
    tableLabelOverrides: companies?.table_label_overrides || {},
    disabledSystemTables: companies?.disabled_system_tables || {},
    invoiceSettings: { ...emptyInvoiceSettings(), ...(companies?.invoice_settings || {}) },
    logoUrl: companies?.logo_url || null,
  };

  await warmCustomTables(user.id).catch(() => {});
  notifyStep("tables");
  await warmCustomDashboards(user.id).catch(() => {});
  notifyStep("dashboards");
  await warmRelationOptionsCache().catch(() => {});
  notifyStep("relations");
  await warmSystemTableShells(cid).catch(() => {});
  notifyStep("tableShells");
  await warmCustomTableShells(cid).catch(() => {});
  // Row data prefetch stays fire-and-forget -- see startSystemTableRowPrefetch's
  // own doc comment for why (unlike shell/metadata, it's cheap per table but
  // not bounded, so it isn't part of what the splash gates on).
  startSystemTableRowPrefetch(cid).catch(() => {});
  notifyStep("shells");

  perfLog("companyBootstrap: done");
  return result;
}

export function resolveCompanyBootstrap(options: BootstrapOptions = {}): Promise<CompanyBootstrapResult | null> {
  if (options.onStep) stepListeners.push(options.onStep);
  if (inFlight) return inFlight;
  inFlight = runBootstrap().finally(() => { inFlight = null; stepListeners = []; });
  return inFlight;
}
