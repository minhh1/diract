"use client";

// The rich deep-dive page for the "Auto time entries" feature, covering
// exactly what was asked for: where it lives in the real dashboard, what
// Brief vs Detailed descriptions actually look like, how an admin
// reassigns a timekeeper, and -- honestly -- how the app actually
// attributes an email to a matter and a person. Every claim here is
// grounded in the real source:
// components/dashboard/AutoTimeRecordingButtonWidget.tsx (access point),
// components/dashboard/AutoTimeRecordingPanel.tsx (admin reassignment
// select), and lib/ai/emailTimekeeperAttribution.ts + the Gmail-label →
// project mapping in supabase/functions/gmail-push/index.ts (matching).
import { Sparkles, ListChecks, ChevronDown } from "lucide-react";
import { useMockupTheme } from "@/components/marketing/MockupThemeProvider";
import { MockAutoTimeEntries } from "@/components/marketing/mockups";
import { DetailHero, Section } from "./Section";

export default function AiTimeEntriesDetail() {
  const isDark = useMockupTheme();
  return (
    <section className="px-6 pb-28">
      <div className="max-w-4xl mx-auto">
        <DetailHero
          badgeIcon={Sparkles}
          badgeText="Auto time entries"
          badgeClass="bg-indigo-50 border-indigo-100 text-indigo-600"
          headlineLines={["Time entries drafted for you,", "not invented for you."]}
          accentClass="text-indigo-600"
          subheadline="Every draft is built from work you actually did, whether a task you completed or an email you sent, attributed to a specific matter and person by real signals, never guessed. Nothing gets submitted until you review and approve it."
        />

        <Section eyebrow="Where to find it" title="One click from your Time Entry dashboard">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            "Auto Time Recording" sits as a button right on the Time Entry dashboard, next to "My Tasks," the same dashboard
            you already open to log time. No separate tool, no extra tab.
          </p>
          <div className={`flex gap-3 max-w-sm ${isDark ? "dark" : ""}`}>
            <div className="flex-1 h-14 flex items-center justify-center gap-2 px-4 py-3 bg-white border-2 border-indigo-300 rounded-2xl text-[12px] font-bold text-indigo-600 shadow-sm">
              <Sparkles size={16} /> Auto Time Recording
            </div>
            <div className="flex-1 h-14 flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-2xl text-[12px] font-bold text-slate-700">
              <ListChecks size={16} /> My Tasks
            </div>
          </div>
        </Section>

        <Section eyebrow="See it in action" title="Watch the descriptions redraft themselves">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            This is the real drawer, cycling through Brief, Standard, and Detailed on its own so you can see the difference at a
            glance. Click anywhere in it to take over and switch levels yourself.
          </p>
          <div className={isDark ? "dark" : ""}>
            <MockAutoTimeEntries />
          </div>
        </Section>

        <Section eyebrow="Descriptions" title="Brief or Detailed: your call, per entry or for all of them">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            Same underlying work, three ways to describe it (Brief, Standard, Detailed). Switch any single entry, or set every
            draft to the same level in one click. Here's the same matter at each end of that range:
          </p>
          <div className={`grid sm:grid-cols-2 gap-4 ${isDark ? "dark" : ""}`}>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Brief</p>
              <p className="text-[12px] font-medium text-slate-700 leading-relaxed">Trust deed review for the Smith Family Trust.</p>
            </div>
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4">
              <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mb-2">Detailed</p>
              <p className="text-[12px] font-medium text-slate-700 leading-relaxed">
                Reviewed and finalised Deed of Variation for the Smith Family Trust; identified required amendments to the
                vesting clause, drafted covering correspondence to the trustee, and confirmed execution requirements with counsel.
              </p>
            </div>
          </div>
        </Section>

        <Section eyebrow="Admin controls" title="Reassign the timekeeper on any entry">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            Admins reviewing "Everyone's day" can reassign any draft to a different staff member from a dropdown, including
            entries the matching couldn't confidently attribute to anyone, flagged so they don't get missed.
          </p>
          <div className="space-y-2.5 max-w-sm">
            <div className="flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white p-3">
              <span className="text-[11px] text-slate-500 flex-1">Deed of Variation, Smith Family Trust</span>
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border border-slate-200 bg-white text-slate-600">
                Sarah Lee <ChevronDown size={11} />
              </span>
            </div>
            <div className="flex items-center gap-2.5 rounded-2xl border border-amber-200 bg-amber-50/30 p-3">
              <span className="text-[11px] text-slate-500 flex-1">Section 32 disclosure, 88 Riverside Ave</span>
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border border-amber-300 bg-white text-amber-700">
                Assign timekeeper… <ChevronDown size={11} />
              </span>
            </div>
          </div>
        </Section>

        <Section eyebrow="How it works" title="How an email gets matched to a matter and a person">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            Two separate, deterministic steps. Nothing here is a guess, and an email that doesn't confidently match just stays
            unassigned for a human to sort (see the admin control above).
          </p>
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-[12px] font-bold text-slate-800 mb-1.5">Which matter</p>
              <p className="text-[13px] text-slate-500 leading-relaxed">
                Determined by the Gmail label already on the email. Whichever matter that label is linked to is the matter the
                email (and the time entry drafted from it) belongs to.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-[12px] font-bold text-slate-800 mb-1.5">Which person</p>
              <p className="text-[13px] text-slate-500 leading-relaxed">
                Checked in order, stopping at the first match: the sender's address against a staff profile; failing that, a name
                addressed in the email's own greeting ("Hi Sarah") against staff first names; failing that, who most recently sent
                a message earlier in the same email thread. No match at any step means no guess: it's left for an admin to assign.
              </p>
            </div>
          </div>
        </Section>
      </div>
    </section>
  );
}
