"use client";

// The rich deep-dive page for "AI doesn't retain your data" -- every claim
// here is backed by real, enforced behavior, not just Privacy Policy
// language: app/api/ai/conversations/sweep/route.ts is a real cron route
// that deletes conversation threads, and their messages with them, after
// 90 days. The provider-side "doesn't train on your data" claim is the
// app's real Privacy Policy language (app/(marketing)/privacy/page.tsx)
// about its contract with Anthropic/Together AI -- presented here as
// exactly that, a policy commitment, not something re-verified in code.
import { Lock, Clock, FileText } from "lucide-react";
import Link from "next/link";
import { useMockupTheme } from "@/components/marketing/MockupThemeProvider";
import { MOCKUPS } from "@/components/marketing/mockups";
import { DetailHero, Section } from "./Section";

const AiSafetyMockup = MOCKUPS.aiSafety;

export default function AiSafetyDetail() {
  const isDark = useMockupTheme();
  return (
    <section className="px-6 pb-28">
      <div className="max-w-4xl mx-auto">
        <DetailHero
          badgeIcon={Lock}
          badgeText="AI safety controls"
          badgeClass="bg-indigo-50 border-indigo-100 text-indigo-600"
          headlineLines={["AI reads and works on your data.", "It doesn't get to keep it."]}
          accentClass="text-indigo-600"
          subheadline="Your chat history doesn't sit around forever, and nothing you send is used to train a model. That's enforced in the code that runs and the contracts behind it, not just promised in a policy document."
        />

        <Section eyebrow="Retention" title="Kept for 90 days, then deleted automatically">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            Conversations you have with the assistant are kept so you can find an old answer again, the same as any
            chat app's history. A daily sweep deletes anything older than 90 days on its own. There's no manual
            cleanup step and no indefinite archive quietly growing in the background.
          </p>
          <div className={isDark ? "dark" : ""}><AiSafetyMockup /></div>
        </Section>

        <Section eyebrow="Providers" title="What actually happens to a request">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            Each request goes to whichever AI provider is configured for that feature (currently Anthropic and Together AI,
            or a self-hosted Ollama instance a company runs itself). Per our Privacy Policy, third-party providers act as
            sub-processors under contract terms that prohibit using your data to train their own models, and don't retain it
            beyond what's needed to return that one response.
          </p>
          <div className={`flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 max-w-md mb-6 ${isDark ? "dark" : ""}`}>
            <Clock size={14} className="text-indigo-500 shrink-0" />
            <span className="text-[12px] font-medium text-slate-700">Auto-deleted after 90 days, never used to train a model</span>
          </div>
          <Link href="/privacy" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-indigo-600">
            <FileText size={14} /> Read the full Privacy Policy
          </Link>
        </Section>
      </div>
    </section>
  );
}
