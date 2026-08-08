"use client";

// The rich deep-dive page for "Shared Gmail labels" -- every claim here is
// grounded in the real source: lib/gmail/createProjectLabel.ts (label
// naming/creation), app/api/gmail/assign/route.ts (the real synchronous
// teammate fan-out), supabase/functions/gmail-label-sync-cron +
// gmail-label-sync-processor (the 15-minute reconciliation pass), and
// supabase/functions/gmail-addon/index.ts (the real Gmail Add-on backend).
import { Mail, Check, RefreshCw, Puzzle } from "lucide-react";
import { useMockupTheme } from "@/components/marketing/MockupThemeProvider";
import { DetailHero, Section } from "./Section";
import type { FeatureDetailCopy } from "@/lib/marketingPages/publishedContent";

const SYNCED_NAMES = ["Sarah Lee", "Jono Ferreira", "Priya Shah"];
const ADDON_ACTIONS = [
  "Create a new record from this email",
  "Search and link to an existing record",
  "Assign the open email to a record",
  "Remove a label / unassign",
  "Create and manage tasks",
  "Add a record straight into any custom table",
];

export const DEFAULT_CONTENT: FeatureDetailCopy = {
  badgeText: "Shared Gmail labels",
  headlineLine1: "A label in your inbox,",
  headlineLine2: "not a note in a database.",
  subheadline: "When an email gets assigned to a record, it's a real Gmail label applied through the Gmail API. It shows up the same way in every teammate's own Gmail, not just inside Diract.",
  sections: [
    {
      key: "setup",
      eyebrow: "Setup",
      title: "One label per record, created automatically",
      body: [
        `Creating a project creates its Gmail label at the same time, nested under a parent label you control (defaults to "Shared Emails"), built from whatever fields you choose (matter number, name, year). A short code stays on the end so the link survives if the record is later renamed.`,
      ],
    },
    {
      key: "assigning",
      eyebrow: "Assigning",
      title: "Assign once, it's already in their inbox",
      body: ["Assigning an email labels it in your own Gmail immediately, then does the same for every other connected teammate in that same request, before the page even finishes loading, not on some later sync."],
    },
    {
      key: "reliability",
      eyebrow: "Reliability",
      title: "Self-healing, every 15 minutes",
      body: ["The instant fan-out handles the normal case. A background pass every 15 minutes reconciles the rest: a teammate who joined after the label existed, a rename that needs to propagate, or a sync that failed the first time."],
    },
    {
      key: "addon",
      eyebrow: "Gmail Add-on",
      title: "Without ever leaving your inbox",
      body: ["The real Diract Add-on for Gmail runs right in the sidebar of the email you're reading:"],
    },
  ],
};

export default function GmailLabelsDetail({ content }: { content?: FeatureDetailCopy } = {}) {
  const isDark = useMockupTheme();
  const copy = content ?? DEFAULT_CONTENT;
  return (
    <section className="px-6 pb-28">
      <div className="max-w-4xl mx-auto">
        <DetailHero
          badgeIcon={Mail}
          badgeText={copy.badgeText}
          badgeClass="bg-sky-50 border-sky-100 text-sky-700"
          headlineLines={[copy.headlineLine1, copy.headlineLine2]}
          accentClass="text-sky-600"
          subheadline={copy.subheadline}
        />

        <Section eyebrow={copy.sections[0].eyebrow} eyebrowClass="text-sky-500" title={copy.sections[0].title}>
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            {copy.sections[0].body[0]}
          </p>
          <div className={`max-w-md px-4 py-3 bg-slate-50 rounded-xl text-[12px] font-mono text-slate-600 ${isDark ? "dark" : ""}`}>
            Shared Emails/2024/0212 -- 88 Riverside Ave <span className="text-slate-400">[AB3F1]</span>
          </div>
        </Section>

        <Section eyebrow={copy.sections[1].eyebrow} eyebrowClass="text-sky-500" title={copy.sections[1].title}>
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            {copy.sections[1].body[0]}
          </p>
          <div className={`space-y-2 max-w-sm ${isDark ? "dark" : ""}`}>
            {SYNCED_NAMES.map((name) => (
              <div key={name} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5">
                <span className="text-[12px] font-medium text-slate-700">{name}</span>
                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600"><Check size={12} /> Synced</span>
              </div>
            ))}
          </div>
        </Section>

        <Section eyebrow={copy.sections[2].eyebrow} eyebrowClass="text-sky-500" title={copy.sections[2].title}>
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            {copy.sections[2].body[0]}
          </p>
          <div className="flex items-center gap-2 text-[12px] font-medium text-slate-500">
            <RefreshCw size={14} className="text-sky-500" /> Reconciliation runs automatically, nothing to trigger by hand.
          </div>
        </Section>

        <Section eyebrow={copy.sections[3].eyebrow} eyebrowClass="text-sky-500" title={copy.sections[3].title}>
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            {copy.sections[3].body[0]}
          </p>
          <div className="grid sm:grid-cols-2 gap-2.5 max-w-lg">
            {ADDON_ACTIONS.map((action) => (
              <div key={action} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5">
                <Puzzle size={13} className="text-sky-500 shrink-0" />
                <span className="text-[12px] font-medium text-slate-700">{action}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </section>
  );
}
