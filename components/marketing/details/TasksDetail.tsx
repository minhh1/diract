"use client";

// The rich deep-dive page for "Tasks" -- rebuilt directly from the real
// "public tasks" page (components/public/PublicTasksContent.tsx), a
// shareable, access-scoped task view a signed-in user opens (despite the
// "public" name, it requires a real session -- see that file's own doc
// comment at lines 9-11). That's a materially richer, different real
// screen from the plain internal admin tasks table: dependencies enforced
// as a genuine block (task_dependencies, AND-semantics), watching,
// follow-ups, per-task notes, a link back to the source email a task was
// created from, one-click "mark done, queue the next linked task"
// chaining, auto-grouping into Action/Follow-up/Watching buckets, one-click
// handoff into Time & Fees (with an AI-rewritten description) and
// calendar, and bulk template application.
import { ListChecks, Lock, Eye, Bell, Sparkles, CalendarPlus, LayoutTemplate, StickyNote, Mail, ArrowRight, LayoutGrid } from "lucide-react";
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
          headlineLines={["The task view your team", "actually shares and works from."]}
          accentClass="text-violet-600"
          subheadline="A scoped, shareable task list, signed in, not anonymous, showing exactly what's yours, what you're watching, and what's genuinely blocked, with the surrounding tools one click away instead of a separate tab."
        />

        <Section eyebrow="The view" eyebrowClass="text-violet-500" title="What's actually on the row">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            A completion toggle, the task name with whatever real status applies to it, its matter, and a due date coloured
            by urgency. Those are the same badges you'd see on the real page.
          </p>
          <div className={isDark ? "dark" : ""}><TasksMockup /></div>
        </Section>

        <Section eyebrow="Context" eyebrowClass="text-violet-500" title="A note, and the email it came from">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            Add a short freeform note to any task without leaving the row. When a task was created from an email, open that
            exact message straight from the task instead of hunting for it back in your inbox.
          </p>
          <div className={`flex flex-wrap gap-2.5 ${isDark ? "dark" : ""}`}>
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <StickyNote size={14} className="text-slate-400 shrink-0" />
              <span className="text-[12px] font-medium text-slate-700">Note added</span>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <Mail size={14} className="text-indigo-500 shrink-0" />
              <span className="text-[12px] font-medium text-slate-700">Open email</span>
            </div>
          </div>
        </Section>

        <Section eyebrow="Dependencies" eyebrowClass="text-violet-500" title="Can't be ticked off out of order">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            Mark one task as depending on others, and its completion toggle is genuinely disabled. It stays locked, not just
            discouraged, until every one of those is actually done.
          </p>
          <div className={`flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50/30 px-4 py-3 max-w-md ${isDark ? "dark" : ""}`}>
            <Lock size={14} className="text-amber-600 shrink-0" />
            <span className="text-[12px] font-medium text-slate-700">Blocked by 2 tasks still open</span>
          </div>
        </Section>

        <Section eyebrow="Watching & follow-ups" eyebrowClass="text-violet-500" title="Kept in the loop, or reminded to circle back">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            Watch a task you don't own but need visibility on. Separately, schedule a follow-up date on any task. It shows
            right on the row until you mark it done or remove it, so "chase this up next week" doesn't just live in your head.
          </p>
          <div className={`flex flex-wrap gap-2.5 ${isDark ? "dark" : ""}`}>
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <Eye size={14} className="text-violet-500 shrink-0" />
              <span className="text-[12px] font-medium text-slate-700">Watching</span>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <Bell size={14} className="text-violet-500 shrink-0" />
              <span className="text-[12px] font-medium text-slate-700">Follow-up scheduled</span>
            </div>
          </div>
        </Section>

        <Section eyebrow="Next task" eyebrowClass="text-violet-500" title="Mark it done, queue what's next">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            Finish a task and open a new one already linked back to it as a dependency in the same click, so the next step
            in a matter is queued right away instead of a separate trip to Add task.
          </p>
          <div className={`flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 max-w-md ${isDark ? "dark" : ""}`}>
            <ArrowRight size={14} className="text-emerald-600 shrink-0" />
            <span className="text-[12px] font-medium text-slate-700">Mark done &amp; add next task</span>
          </div>
        </Section>

        <Section eyebrow="One click out" eyebrowClass="text-violet-500" title="Straight into Time & Fees or your calendar">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            Turn a task straight into a time entry, with an AI-rewritten description ready to edit, not just the raw task
            name copied across. Push it to your calendar too, whenever the assignee actually has one connected.
          </p>
          <div className={`flex flex-wrap gap-2.5 ${isDark ? "dark" : ""}`}>
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <Sparkles size={14} className="text-indigo-500 shrink-0" />
              <span className="text-[12px] font-medium text-slate-700">Add to Time &amp; Fees</span>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <CalendarPlus size={14} className="text-violet-500 shrink-0" />
              <span className="text-[12px] font-medium text-slate-700">Add to calendar</span>
            </div>
          </div>
        </Section>

        <Section eyebrow="Organised view" eyebrowClass="text-violet-500" title="Sorted into Action, Follow-up, and Watching">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            Switch to organised view and every task sorts itself into what needs doing, what's waiting on a follow-up, and
            what you're only watching. Move a task into a different bucket by hand whenever the automatic grouping doesn't
            fit.
          </p>
          <div className={`flex flex-wrap gap-2.5 ${isDark ? "dark" : ""}`}>
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <LayoutGrid size={14} className="text-slate-400 shrink-0" />
              <span className="text-[12px] font-medium text-slate-700">Action</span>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <Bell size={14} className="text-slate-400 shrink-0" />
              <span className="text-[12px] font-medium text-slate-700">Follow up</span>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <Eye size={14} className="text-slate-400 shrink-0" />
              <span className="text-[12px] font-medium text-slate-700">Watching</span>
            </div>
          </div>
        </Section>

        <Section eyebrow="Templates" eyebrowClass="text-violet-500" title="A whole checklist, applied at once">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            Pick a project and a template, and every task in it gets created in one go: the standard checklist for a
            settlement, an onboarding, a deal type, without typing each line by hand.
          </p>
          <div className={`flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 max-w-md ${isDark ? "dark" : ""}`}>
            <LayoutTemplate size={14} className="text-violet-500 shrink-0" />
            <span className="text-[12px] font-medium text-slate-700">Apply template</span>
          </div>
        </Section>
      </div>
    </section>
  );
}
