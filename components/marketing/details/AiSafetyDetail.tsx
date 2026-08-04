"use client";

// The rich deep-dive page for "AI safety controls" -- every claim here is
// backed by real, enforced code, not just Privacy Policy language:
// ai_chat_settings.ai_enabled (checked in app/api/ai/chat/route.ts,
// lib/botEngine/handleMessage.ts for Teams/WhatsApp, and
// app/api/disbursements/parse-invoice/route.ts before any AI provider is
// ever called) and app/api/ai/conversations/sweep/route.ts (a real cron
// route that deletes conversation threads, and their messages with them,
// after 90 days). The provider-side "doesn't train on your data" claim is
// the app's real Privacy Policy language (app/(marketing)/privacy/page.tsx)
// about its contract with Anthropic/Together AI -- presented here as
// exactly that, a policy commitment, not something re-verified in code.
import { Lock, Power, Clock, FileText } from "lucide-react";
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
          subheadline="A company-wide switch that actually blocks every AI call, and a chat history that doesn't sit around forever — enforced in the code that runs, not just promised in a policy document."
        />

        <Section eyebrow="Controls" title="A real switch, and a real expiry date">
          <div className={isDark ? "dark" : ""}><AiSafetyMockup /></div>
        </Section>

        <Section eyebrow="Kill switch" title="Off means off, before it reaches a model">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            One company-wide toggle, checked before the chat assistant, the Teams/WhatsApp bot, or disbursement invoice
            reading ever calls an AI provider. Turn it on and every one of those simply refuses to run — not disabled in the
            interface while still quietly working underneath.
          </p>
          <div className={`flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 max-w-md ${isDark ? "dark" : ""}`}>
            <Power size={14} className="text-indigo-500 shrink-0" />
            <span className="text-[12px] font-medium text-slate-700">Blocks chat, Teams, WhatsApp, and invoice reading</span>
          </div>
        </Section>

        <Section eyebrow="Retention" title="Your chat history, kept for 90 days — not forever">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            Conversations you have with the assistant are kept so you can find an old answer again — same as any chat app's
            history. A daily sweep deletes anything older than 90 days automatically; there's no manual cleanup step and no
            indefinite archive quietly growing in the background.
          </p>
          <div className={`flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 max-w-md ${isDark ? "dark" : ""}`}>
            <Clock size={14} className="text-indigo-500 shrink-0" />
            <span className="text-[12px] font-medium text-slate-700">Auto-deleted after 90 days</span>
          </div>
        </Section>

        <Section eyebrow="Providers" title="What actually happens to a request">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            Each request goes to whichever AI provider is configured for that feature (currently Anthropic and Together AI,
            or a self-hosted Ollama instance a company runs itself). Per our Privacy Policy, third-party providers act as
            sub-processors under contract terms that prohibit using your data to train their own models, and don't retain it
            beyond what's needed to return that one response.
          </p>
          <Link href="/privacy" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-indigo-600">
            <FileText size={14} /> Read the full Privacy Policy
          </Link>
        </Section>
      </div>
    </section>
  );
}
