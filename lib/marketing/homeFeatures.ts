// The home landing page's feature list -- pulled into its own file (rather
// than living inline in app/(marketing)/page.tsx) so the feature detail
// route (app/(marketing)/features/[slug]) can look any of these up by slug
// too, the same way it already looks up audience-specific features from
// lib/marketing/audiences.ts.
import type { SpotlightFeature } from "@/components/marketing/FeatureSpotlight";

export const HOME_FEATURES: SpotlightFeature[] = [
  {
    slug: "custom-tables-fields",
    icon: "Table2",
    title: "Custom tables & fields",
    body: "Build the exact tables your business needs — custom fields, statuses, and record types, with no rigid template to work around.",
    accent: "indigo",
    visual: "customTable",
  },
  {
    slug: "auto-add-rules",
    icon: "Workflow",
    title: "Auto-add rules",
    body: "Set a rule once — a status, a type, any field value — and matching records get added to the right board automatically. No manual sorting.",
    accent: "violet",
    visual: "automation",
  },
  {
    slug: "multi-company",
    icon: "Building2",
    title: "Multi-company",
    body: "Manage multiple entities under one login. Switch from one menu on your account, and you're straight into the other company's own data.",
    accent: "sky",
    visual: "multiCompany",
  },
  {
    slug: "role-based-access",
    icon: "ShieldCheck",
    title: "Role-based access",
    body: "Admins control shared tables and company settings; everyone else gets full run of their own work without needing to ask permission for it.",
    accent: "amber",
    visual: "roleAccess",
  },
  {
    slug: "reporting-dashboards",
    icon: "BarChart3",
    title: "Reporting & dashboards",
    body: "See where every record stands with dashboards built around your own data, not someone else's idea of what matters.",
    accent: "emerald",
    visual: "reporting",
  },
  {
    slug: "shared-gmail-labels",
    icon: "Mail",
    title: "Shared Gmail labels",
    body: "Assign an email to a record once, and the same label appears in every teammate's actual Gmail — a real label in their inbox, not just a note in a database.",
    accent: "sky",
    visual: "gmailLabels",
  },
  {
    slug: "ai-safety",
    icon: "Lock",
    title: "AI safety controls",
    body: "A company-wide switch to turn AI off entirely, and conversation history that doesn't sit around forever — real controls, not just a line in the Privacy Policy.",
    accent: "indigo",
    visual: "aiSafety",
  },
];
