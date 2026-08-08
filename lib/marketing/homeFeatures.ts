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
    body: "Build the exact tables your business needs, with your own custom fields, statuses, and record types, instead of working around someone else's rigid template.",
    accent: "indigo",
    visual: "customTable",
  },
  {
    slug: "ai-builder",
    icon: "Sparkles",
    title: "Describe it, and the AI builds it",
    body: "Tell the assistant what your business does and it creates the tables, fields, and dashboards for it on the spot. Need a client-facing page too? Describe what it should say and it drafts one, asking a quick question first if anything's unclear.",
    accent: "amber",
    visual: "aiBuilder",
  },
  {
    slug: "auto-add-rules",
    icon: "Workflow",
    title: "Auto-add rules",
    body: "Set a rule once, based on a status, a type, or any field value, and any matching record gets added to the right board automatically. No manual sorting required.",
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
    body: "Assign an email to a record once, and the same label shows up in every teammate's actual Gmail. It's a real label sitting in their inbox, not just a note left in a database.",
    accent: "sky",
    visual: "gmailLabels",
  },
  {
    slug: "ai-safety",
    icon: "Lock",
    title: "AI doesn't retain your data",
    body: "Conversations with the assistant are deleted automatically after 90 days, not kept forever, and nothing you send it is used to train a model. That's enforced in the product itself, not just a line in a privacy policy.",
    accent: "indigo",
    visual: "aiSafety",
  },
  {
    slug: "marketplace",
    icon: "Store",
    title: "Template marketplace",
    body: "Install a ready-made set of tables and dashboards from the marketplace, try one first in a free sandbox loaded with sample data, or publish your own setup for other companies to use. It isn't built for any single industry.",
    accent: "emerald",
    visual: "marketplace",
  },
];
