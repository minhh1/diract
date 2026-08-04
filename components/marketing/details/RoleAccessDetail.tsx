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

const RoleAccessMockup = MOCKUPS.roleAccess;

export default function RoleAccessDetail() {
  const isDark = useMockupTheme();
  return (
    <section className="px-6 pb-28">
      <div className="max-w-4xl mx-auto">
        <DetailHero
          badgeIcon={ShieldCheck}
          badgeText="Role-based access"
          badgeClass="bg-amber-50 border-amber-100 text-amber-700"
          headlineLines={["Two company-wide roles,", "not a permissions matrix to configure."]}
          accentClass="text-amber-600"
          subheadline="A company admin and everyone else — with a finer per-table, per-dashboard layer on top for when a specific resource needs tighter control than that."
        />

        <Section eyebrow="Team" eyebrowClass="text-amber-500" title="Admin, or member — clear at a glance">
          <div className={isDark ? "dark" : ""}><RoleAccessMockup /></div>
        </Section>

        <Section eyebrow="What's gated" eyebrowClass="text-amber-500" title="Concretely, what an admin controls">
          <div className="space-y-2 max-w-lg">
            {[
              "Creating a table the whole company can see (everyone else gets a private one)",
              "Deleting a shared table — anyone else has to submit a request instead",
              "Company-wide admin settings and secrets",
            ].map((item) => (
              <div key={item} className="rounded-xl bg-slate-50 px-4 py-2.5 text-[12px] text-slate-600">{item}</div>
            ))}
          </div>
        </Section>

        <Section eyebrow="Finer control" eyebrowClass="text-amber-500" title="Per-table and per-dashboard, when you need it">
          <p className="text-[15px] text-slate-500 leading-relaxed">
            Beyond the two company-wide roles, an individual table or dashboard can carry its own admin/editor/viewer
            permissions — for the one board that genuinely needs to be locked down tighter than everything else.
          </p>
        </Section>
      </div>
    </section>
  );
}
