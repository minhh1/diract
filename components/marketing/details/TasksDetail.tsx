"use client";

// The rich deep-dive page for "Tasks" -- reuses the real tasks table
// mockup, and adds the two real relationship features found in
// supabase/task_dependencies.sql (AND-semantics dependencies, enforced in
// components/dashboard/tabs/ChecklistTab.tsx) and lib/taskWatchers.ts
// (watchers).
import { ListChecks, Lock, Eye } from "lucide-react";
import { useMockupTheme } from "@/components/marketing/MockupThemeProvider";
import { MOCKUPS } from "@/components/marketing/mockups";
import { DetailHero, Section } from "./Section";

const TasksMockup = MOCKUPS.tasks;

export default function TasksDetail() {
  const isDark = useMockupTheme();
  return (
    <section className="px-6 pb-28">
      <div className="max-w-4xl mx-auto">
        <DetailHero
          badgeIcon={ListChecks}
          badgeText="Tasks"
          badgeClass="bg-violet-50 border-violet-100 text-violet-600"
          headlineLines={["Every to-do tied to its matter,", "in the right order."]}
          accentClass="text-violet-600"
          subheadline="Assigned to a person or a team, due on a real date, and — when the order matters — blocked until whatever it depends on is actually done."
        />

        <Section eyebrow="Board" eyebrowClass="text-violet-500" title="Every task against its matter">
          <div className={isDark ? "dark" : ""}><TasksMockup /></div>
        </Section>

        <Section eyebrow="Dependencies" eyebrowClass="text-violet-500" title="Can't be ticked off out of order">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            Mark one task as depending on others, and its completion checkbox stays disabled until every one of those is
            actually done — not a soft warning, a real block.
          </p>
          <div className={`flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50/30 px-4 py-3 max-w-md ${isDark ? "dark" : ""}`}>
            <Lock size={14} className="text-amber-600 shrink-0" />
            <span className="text-[12px] font-medium text-slate-700">Blocked — 2 tasks still open</span>
          </div>
        </Section>

        <Section eyebrow="Watchers" eyebrowClass="text-violet-500" title="Kept in the loop without being assigned">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            Add anyone as a watcher on a task they need visibility on but don't own — every update gets logged to the task's
            own activity feed either way.
          </p>
          <div className={`flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 max-w-md ${isDark ? "dark" : ""}`}>
            <Eye size={14} className="text-violet-500 shrink-0" />
            <span className="text-[12px] font-medium text-slate-700">2 watchers</span>
          </div>
        </Section>
      </div>
    </section>
  );
}
