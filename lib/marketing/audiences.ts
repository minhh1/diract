// Content registry for the /for/[audience] landing pages -- adding the
// next company/industry variant is "add an entry here," not "build a new
// page." app/(marketing)/for/[audience]/page.tsx renders whichever entry
// matches the slug through the same Hero/FeatureSpotlight components the
// main landing page uses.
import type { SpotlightAccent, SpotlightIconName } from "@/components/marketing/FeatureSpotlight";
import type { MockupName } from "@/components/marketing/mockups";

export interface AudienceFeature {
  slug: string;
  icon: SpotlightIconName;
  title: string;
  body: string;
  accent: SpotlightAccent;
  visual: MockupName;
}

export interface AudienceContent {
  slug: string;
  navLabel: string;
  badge: string;
  headlineLines: [string, string];
  subheadline: string;
  heroVisual: MockupName;
  eyebrow: string;
  heading: string;
  primaryCtaLabel: string;
  features: AudienceFeature[];
}

export const AUDIENCES: Record<string, AudienceContent> = {
  "law-firm-au": {
    slug: "law-firm-au",
    navLabel: "For law firms",
    badge: "Built for Australian law firms",
    headlineLines: ["Matter management,", "built for legal practice."],
    subheadline: "Diract brings your matters, time, trust accounting, and client communication into one system — purpose-built for Australian firms, with ABN/ACN-aware onboarding from day one.",
    heroVisual: "matterBoard",
    eyebrow: "For law firms",
    heading: "Everything your practice needs, nothing it doesn't",
    primaryCtaLabel: "Start your firm's workspace",
    features: [
      {
        slug: "time-entries",
        icon: "Clock",
        title: "Time entries",
        body: "Log billable time against matters as you work, captured directly from tasks and correspondence, not reconstructed at month-end.",
        accent: "indigo",
        visual: "timeEntries",
      },
      {
        slug: "ai-time-entries",
        icon: "Sparkles",
        title: "Auto time entries",
        body: "Time entries generated automatically from your day's activity — review and approve in seconds instead of guessing at what you did.",
        accent: "violet",
        visual: "autoTimeEntries",
      },
      {
        slug: "trust-compliance",
        icon: "Landmark",
        title: "Trust account",
        body: "A live trust ledger for every matter, with automatic irregularity checks so nothing slips through before settlement.",
        accent: "emerald",
        visual: "trustAccount",
      },
      {
        slug: "fees-reports",
        icon: "BarChart3",
        title: "Fees reports",
        body: "See fees billed, WIP, and recovery by matter, fee earner, or practice area — no month-end spreadsheet required.",
        accent: "sky",
        visual: "feesReport",
      },
      {
        slug: "disbursements-import",
        icon: "Upload",
        title: "Mass import disbursements",
        body: "Upload a supplier's tax invoice PDF and every disbursement it covers — across as many matters as it bills — gets extracted, grouped, and ready to add in one review screen.",
        accent: "amber",
        visual: "disbursementsImport",
      },
      {
        slug: "precedents",
        icon: "FileText",
        title: "Precedents",
        body: "A shared library of precedent documents your team can issue straight into a matter, fully tracked from draft to execution.",
        accent: "indigo",
        visual: "precedents",
      },
      {
        slug: "teams-management",
        icon: "Users",
        title: "Teams management",
        body: "Organise fee earners into teams, assign matters, and control who sees what across your practice.",
        accent: "amber",
        visual: "teamsManagement",
      },
      {
        slug: "client-updates",
        icon: "LayoutPanelLeft",
        title: "Client updates",
        body: "Give clients a branded, always-current view of their matter's progress — no more \"just checking in\" phone calls.",
        accent: "sky",
        visual: "clientUpdates",
      },
      {
        slug: "tasks",
        icon: "ListChecks",
        title: "Tasks",
        body: "Track every to-do against its matter, assigned to the right person, with due dates that actually get followed up.",
        accent: "violet",
        visual: "tasks",
      },
    ],
  },
  "property-developers-au": {
    slug: "property-developers-au",
    navLabel: "For property developers",
    badge: "Built for Australian property developers",
    headlineLines: ["Development finance,", "modelled end to end."],
    subheadline: "Diract brings your loan facilities, finance models, and entity data into one system — purpose-built for Australian property developers, from acquisition through to settlement.",
    heroVisual: "loanTable",
    eyebrow: "For property developers",
    heading: "From feasibility to funding, all in one place",
    primaryCtaLabel: "Start your development workspace",
    features: [
      {
        slug: "loan-facilities",
        icon: "Landmark",
        title: "Loan tables",
        body: "Track every facility on one portfolio board — lender, type, and principal, with repayment phases you can fix in place as your capital stack evolves.",
        accent: "indigo",
        visual: "loanTable",
      },
      {
        slug: "finance-model",
        icon: "TrendingUp",
        title: "Finance model",
        body: "A real budget-vs-actual view for every deal, reconciled straight against Xero — plus a full feasibility calculator alongside it.",
        accent: "violet",
        visual: "financeModel",
      },
      {
        slug: "loan-schedule",
        icon: "CalendarClock",
        title: "Loan tab in finance models",
        body: "A computed repayment schedule against the same finance model — opening balance, interest, principal, and closing balance, period by period.",
        accent: "sky",
        visual: "loanSchedule",
      },
      {
        slug: "residual-land-solver",
        icon: "Calculator",
        title: "Residual land solver",
        body: "Solve for the land value your numbers can actually support, straight from your GRV and cost inputs — no separate spreadsheet.",
        accent: "amber",
        visual: "residualLand",
      },
      {
        slug: "entity-validation",
        icon: "BadgeCheck",
        title: "Entity data validation",
        body: "ABN and ACN are checked with a real checksum as you type, and BSB, account, and company details are captured cleanly alongside them — so bad entity data never makes it into a deal.",
        accent: "emerald",
        visual: "entityValidation",
      },
    ],
  },
};

export function getAudience(slug: string): AudienceContent | null {
  return AUDIENCES[slug] ?? null;
}

export function audienceNavLinks(): { href: string; label: string }[] {
  return Object.values(AUDIENCES).map((a) => ({ href: `/for/${a.slug}`, label: a.navLabel }));
}
