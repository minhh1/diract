"use client";

// The rich deep-dive page for "Teams management" -- reuses the real team
// card mockup, and adds the real per-team permission toggles
// (components/admin/AdminTeamsTab.tsx:66-101, PERMISSION_DEFS) and the
// real category-tag auto-suggestion mechanism
// (components/public/financeModel/TimelineSubtab.tsx:190-202).
import { Users, Tag } from "lucide-react";
import { useMockupTheme } from "@/components/marketing/MockupThemeProvider";
import { MOCKUPS } from "@/components/marketing/mockups";
import { DetailHero, Section } from "./Section";

const TeamsMockup = MOCKUPS.teamsManagement;

const PERMISSIONS = [
  "Allow members to enter time on behalf of other staff",
  "Allow members to view all staff's time entries",
  "Allow members to view all company tasks",
  "Without the above, members can still see tasks assigned to this team",
];

export default function TeamsManagementDetail() {
  const isDark = useMockupTheme();
  return (
    <section className="px-6 pb-28">
      <div className="max-w-4xl mx-auto">
        <DetailHero
          badgeIcon={Users}
          badgeText="Teams management"
          badgeClass="bg-amber-50 border-amber-100 text-amber-700"
          headlineLines={["Who sees what,", "set once per team."]}
          accentClass="text-amber-600"
          subheadline="Organise fee earners into teams, put someone in charge of each one, and control exactly what the rest of the team can see beyond their own work."
        />

        <Section eyebrow="Team" eyebrowClass="text-amber-500" title="A leader, and everyone who reports to them">
          <div className={isDark ? "dark" : ""}><TeamsMockup /></div>
        </Section>

        <Section eyebrow="Permissions" eyebrowClass="text-amber-500" title="Four real toggles, per team">
          <div className="space-y-2 max-w-lg">
            {PERMISSIONS.map((p) => (
              <div key={p} className="rounded-xl bg-slate-50 px-4 py-2.5 text-[12px] text-slate-600">{p}</div>
            ))}
          </div>
        </Section>

        <Section eyebrow="Categories" eyebrowClass="text-amber-500" title="The right team, suggested automatically">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            Tag a team with the categories it owns, like "Construction" or "Fixing Stage," and typing that same category into a
            timeline task auto-suggests that team, without removing anyone you've already assigned by hand.
          </p>
          <div className={`flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 max-w-md ${isDark ? "dark" : ""}`}>
            <Tag size={14} className="text-amber-500 shrink-0" />
            <span className="text-[12px] font-medium text-slate-700">Category tags</span>
          </div>
        </Section>
      </div>
    </section>
  );
}
