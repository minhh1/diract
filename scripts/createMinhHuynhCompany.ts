// One-off setup for the dashboard-editable landing-page-copy feature (see
// supabase/migrations/20260808110000_marketing_page_content.sql,
// app/api/marketing-pages/*): creates a company scoped to exactly
// minh@huynhco.com (no other member), and seeds marketing_page_content with
// the current static copy for home, both /for/[audience] pages, and all 23
// feature deep-dive pages, so the editor opens pre-filled with real content
// instead of blank.
//
// Idempotent -- safe to re-run: reuses an existing "Minh Huynh" company if
// one already exists (by name), and upserts seed rows by (company_id,
// page_key) so re-running never duplicates or clobbers content someone has
// already started editing (draft_content is only inserted on first create,
// never overwritten on a re-run -- see the ON CONFLICT DO NOTHING below).
//
// Run: npx tsx scripts/createMinhHuynhCompany.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { HOME_FEATURES } from "../lib/marketing/homeFeatures";
import { AUDIENCES } from "../lib/marketing/audiences";
import { DEFAULT_CONTENT as customTablesFields } from "../components/marketing/details/CustomTablesDetail";
import { DEFAULT_CONTENT as autoAddRules } from "../components/marketing/details/AutoAddRulesDetail";
import { DEFAULT_CONTENT as multiCompany } from "../components/marketing/details/MultiCompanyDetail";
import { DEFAULT_CONTENT as roleBasedAccess } from "../components/marketing/details/RoleAccessDetail";
import { DEFAULT_CONTENT as reportingDashboards } from "../components/marketing/details/ReportingDashboardsDetail";
import { DEFAULT_CONTENT as sharedGmailLabels } from "../components/marketing/details/GmailLabelsDetail";
import { DEFAULT_CONTENT as aiSafety } from "../components/marketing/details/AiSafetyDetail";
import { DEFAULT_CONTENT as marketplace } from "../components/marketing/details/MarketplaceDetail";
import { DEFAULT_CONTENT as quickGlance } from "../components/marketing/details/QuickGlanceDetail";
import { DEFAULT_CONTENT as timeEntries } from "../components/marketing/details/TimeEntriesDetail";
import { DEFAULT_CONTENT as aiTimeEntries } from "../components/marketing/details/AiTimeEntriesDetail";
import { DEFAULT_CONTENT as trustCompliance } from "../components/marketing/details/TrustComplianceDetail";
import { DEFAULT_CONTENT as feesReports } from "../components/marketing/details/FeesReportsDetail";
import { DEFAULT_CONTENT as disbursementsImport } from "../components/marketing/details/DisbursementsImportDetail";
import { DEFAULT_CONTENT as precedents } from "../components/marketing/details/PrecedentsDetail";
import { DEFAULT_CONTENT as teamsManagement } from "../components/marketing/details/TeamsManagementDetail";
import { DEFAULT_CONTENT as clientUpdates } from "../components/marketing/details/ClientUpdatesDetail";
import { DEFAULT_CONTENT as tasks } from "../components/marketing/details/TasksDetail";
import { DEFAULT_CONTENT as loanFacilities } from "../components/marketing/details/LoanFacilitiesDetail";
import { DEFAULT_CONTENT as financeModel } from "../components/marketing/details/FinanceModelDetail";
import { DEFAULT_CONTENT as loanSchedule } from "../components/marketing/details/LoanScheduleDetail";
import { DEFAULT_CONTENT as residualLandSolver } from "../components/marketing/details/ResidualLandSolverDetail";
import { DEFAULT_CONTENT as entityValidation } from "../components/marketing/details/EntityValidationDetail";
import type { FeatureDetailCopy } from "../lib/marketingPages/publishedContent";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter(l => l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
);
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const TARGET_EMAIL = "minh@huynhco.com";
// Fixed, not gen_random_uuid()'d, so lib/marketingPages/auth.ts's
// MINH_HUYNH_COMPANY_ID constant can be hardcoded before this script ever
// runs, same as this repo's other hardcoded dogfood-company-id references.
const FIXED_COMPANY_ID = "66d7eaff-67a7-4478-bdeb-c18c46f4e844";

interface HeroSpotlightCopy {
  badge: string;
  headlineLine1: string;
  headlineLine2: string;
  subheadline: string;
  eyebrow: string;
  heading: string;
  primaryCtaLabel: string;
  features: { slug: string; title: string; body: string }[];
}

// Copied verbatim from app/(marketing)/page.tsx -- that file has no
// importable constant for its own Hero/FeatureSpotlight copy (unlike the
// audience pages, whose copy already lives in lib/marketing/audiences.ts).
const HOME_COPY: HeroSpotlightCopy = {
  badge: "A CRM that adapts to your business",
  headlineLine1: "Built around your process,",
  headlineLine2: "not the other way around.",
  subheadline: "Diract is a configurable CRM platform. You plug in the tables, fields, and workflows your business actually runs on, and manage everything from one place.",
  eyebrow: "Everything your business needs",
  heading: "A CRM built around your tables, not a template",
  primaryCtaLabel: "Get started",
  features: HOME_FEATURES.map(f => ({ slug: f.slug, title: f.title, body: f.body })),
};

function audienceCopy(slug: keyof typeof AUDIENCES): HeroSpotlightCopy {
  const a = AUDIENCES[slug];
  return {
    badge: a.badge,
    headlineLine1: a.headlineLines[0],
    headlineLine2: a.headlineLines[1],
    subheadline: a.subheadline,
    eyebrow: a.eyebrow,
    heading: a.heading,
    primaryCtaLabel: a.primaryCtaLabel,
    features: a.features.map(f => ({ slug: f.slug, title: f.title, body: f.body })),
  };
}

// Slugs match RICH_DETAILS in app/(marketing)/features/[slug]/page.tsx --
// every slug with a bespoke deep-dive component gets a feature-detail row
// here so its DEFAULT_CONTENT (the component's own hardcoded copy) becomes
// the draft, editable from Admin -> Landing pages (Phase B). Slugs that
// fall through to GenericFeatureDetail instead are already covered by the
// hero-spotlight rows above (their card copy lives in that features[]
// array) and don't get a row of their own.
const FEATURE_DETAIL_PAGES: { slug: string; content: FeatureDetailCopy }[] = [
  { slug: "custom-tables-fields", content: customTablesFields },
  { slug: "auto-add-rules", content: autoAddRules },
  { slug: "multi-company", content: multiCompany },
  { slug: "role-based-access", content: roleBasedAccess },
  { slug: "reporting-dashboards", content: reportingDashboards },
  { slug: "shared-gmail-labels", content: sharedGmailLabels },
  { slug: "ai-safety", content: aiSafety },
  { slug: "marketplace", content: marketplace },
  { slug: "quick-glance", content: quickGlance },
  { slug: "time-entries", content: timeEntries },
  { slug: "ai-time-entries", content: aiTimeEntries },
  { slug: "trust-compliance", content: trustCompliance },
  { slug: "fees-reports", content: feesReports },
  { slug: "disbursements-import", content: disbursementsImport },
  { slug: "precedents", content: precedents },
  { slug: "teams-management", content: teamsManagement },
  { slug: "client-updates", content: clientUpdates },
  { slug: "tasks", content: tasks },
  { slug: "loan-facilities", content: loanFacilities },
  { slug: "finance-model", content: financeModel },
  { slug: "loan-schedule", content: loanSchedule },
  { slug: "residual-land-solver", content: residualLandSolver },
  { slug: "entity-validation", content: entityValidation },
];

const SEED_PAGES: { page_key: string; page_kind: string; content: HeroSpotlightCopy | FeatureDetailCopy }[] = [
  { page_key: "home", page_kind: "hero-spotlight", content: HOME_COPY },
  { page_key: "for/law-firm-au", page_kind: "hero-spotlight", content: audienceCopy("law-firm-au") },
  { page_key: "for/property-developers-au", page_kind: "hero-spotlight", content: audienceCopy("property-developers-au") },
  ...FEATURE_DETAIL_PAGES.map(({ slug, content }) => ({ page_key: `features/${slug}`, page_kind: "feature-detail", content })),
];

async function findUserIdByEmail(email: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  });
  const json = await res.json();
  const user = json.users?.find((u: any) => u.email === email);
  if (!user) throw new Error(`No auth user found for ${email}`);
  return user.id;
}

async function main() {
  const userId = await findUserIdByEmail(TARGET_EMAIL);
  console.log(`Found ${TARGET_EMAIL} -> ${userId}`);

  const { data: existing } = await admin.from("companies").select("id").eq("id", FIXED_COMPANY_ID).maybeSingle();
  let companyId = existing?.id as string | undefined;

  if (companyId) {
    console.log(`Reusing existing "Minh Huynh" company -> ${companyId}`);
  } else {
    const { data: created, error } = await admin
      .from("companies")
      .insert({ id: FIXED_COMPANY_ID, name: "Minh Huynh", status: "pending" })
      .select("id")
      .single();
    if (error) throw error;
    companyId = created.id;
    console.log(`Created "Minh Huynh" company -> ${companyId}`);
  }

  const { data: existingMembership } = await admin
    .from("company_memberships")
    .select("id")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existingMembership) {
    console.log("Membership already exists.");
  } else {
    const { error } = await admin
      .from("company_memberships")
      .insert({ company_id: companyId, user_id: userId, role: "company_admin" });
    if (error) throw error;
    console.log(`Added ${TARGET_EMAIL} as company_admin.`);
  }

  for (const page of SEED_PAGES) {
    const { data: existingPage } = await admin
      .from("marketing_page_content")
      .select("id")
      .eq("company_id", companyId)
      .eq("page_key", page.page_key)
      .maybeSingle();
    if (existingPage) {
      console.log(`Skipping "${page.page_key}" -- already seeded (draft_content left untouched).`);
      continue;
    }
    const { error } = await admin.from("marketing_page_content").insert({
      company_id: companyId,
      page_key: page.page_key,
      page_kind: page.page_kind,
      draft_content: page.content,
    });
    if (error) throw error;
    console.log(`Seeded "${page.page_key}".`);
  }

  console.log(`\nCompany id (for MINH_HUYNH_COMPANY_ID / MINH_HUYNH_USER_ID constants): company=${companyId} user=${userId}`);
}

main().catch(err => { console.error(err); process.exit(1); });
