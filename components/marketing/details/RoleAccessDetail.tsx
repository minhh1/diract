"use client";

// The rich deep-dive page for "Role-based access" -- grounded in the real
// two company-wide roles (company_memberships.role: 'operator' /
// 'company_admin') and concrete admin-gated behavior found in
// components/CustomTableBuilder.tsx (shared-table creation/deletion), plus
// the newer resource-level permission layer (role in 'admin'/'editor'/
// 'viewer' per table or dashboard, supabase/migrations/
// 20260801400000_resource_permissions.sql).
import { ShieldCheck } from "lucide-react";
import { useMockupTheme } from "@/components/marketing/MockupThemeProvider";
import { MOCKUPS } from "@/components/marketing/mockups";
import { DetailHero, Section } from "./Section";
import type { FeatureDetailCopy } from "@/lib/marketingPages/publishedContent";

const RoleAccessMockup = MOCKUPS.roleAccess;

const GATED_ITEMS = [
  "Creating a table the whole company can see (everyone else gets a private one)",
  "Deleting a shared table, which anyone else has to submit a request for instead",
  "Company-wide admin settings and secrets",
];

export const DEFAULT_CONTENT: FeatureDetailCopy = {
  badgeText: "Role-based access",
  headlineLine1: "Two company-wide roles,",
  headlineLine2: "not a permissions matrix to configure.",
  subheadline: "A company admin and everyone else, with a finer per-table, per-dashboard layer on top for when a specific resource needs tighter control than that.",
  sections: [
    { key: "team", eyebrow: "Team", title: "Admin, or member: clear at a glance", body: [] },
    { key: "gated", eyebrow: "What's gated", title: "Concretely, what an admin controls", body: [] },
    {
      key: "finer",
      eyebrow: "Finer control",
      title: "Per-table and per-dashboard, when you need it",
      body: ["Beyond the two company-wide roles, an individual table or dashboard can carry its own admin/editor/viewer permissions, for the one board that genuinely needs to be locked down tighter than everything else."],
    },
  ],
};

export default function RoleAccessDetail({ content }: { content?: FeatureDetailCopy } = {}) {
  const isDark = useMockupTheme();
  const copy = content ?? DEFAULT_CONTENT;
  return (
    <section className="px-6 pb-28">
      <div className="max-w-4xl mx-auto">
        <DetailHero
          badgeIcon={ShieldCheck}
          badgeText={copy.badgeText}
          badgeClass="bg-amber-50 border-amber-100 text-amber-700"
          headlineLines={[copy.headlineLine1, copy.headlineLine2]}
          accentClass="text-amber-600"
          subheadline={copy.subheadline}
        />

        <Section eyebrow={copy.sections[0].eyebrow} eyebrowClass="text-amber-500" title={copy.sections[0].title}>
          <div className={isDark ? "dark" : ""}><RoleAccessMockup /></div>
        </Section>

        <Section eyebrow={copy.sections[1].eyebrow} eyebrowClass="text-amber-500" title={copy.sections[1].title}>
          <div className="space-y-2 max-w-lg">
            {GATED_ITEMS.map((item) => (
              <div key={item} className="rounded-xl bg-slate-50 px-4 py-2.5 text-[12px] text-slate-600">{item}</div>
            ))}
          </div>
        </Section>

        <Section eyebrow={copy.sections[2].eyebrow} eyebrowClass="text-amber-500" title={copy.sections[2].title}>
          <p className="text-[15px] text-slate-500 leading-relaxed">
            {copy.sections[2].body[0]}
          </p>
        </Section>
      </div>
    </section>
  );
}
