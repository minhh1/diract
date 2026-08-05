"use client";

// First screen a brand-new, templateless company sees -- QuickGlanceDashboard
// renders this instead of the widget canvas when companyType is null and
// there are no custom tables yet (previously: a broken redirect to
// /dashboard/properties, which is hidden by default for exactly this kind
// of company -- see supabase/migrations/20260805070000_hide_system_tables_for_templateless_companies.sql
// -- so a brand-new signup's very first screen was a dead-end "Properties
// has been deleted" trash message).
//
// The AI assistant embedded here (components/ai/AiChatThread.tsx, shared
// with app/(app)/dashboard/ai/page.tsx) is admin-gated because its tools run
// with admin-equivalent rights (see lib/ai/tableBuilderTools.ts) -- a
// non-admin landing on a still-empty company sees a simpler "ask an admin"
// message instead.
import { Sparkles, LayoutTemplate, ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useCompany } from "@/components/CompanyContext";
import AiChatThread from "@/components/ai/AiChatThread";

interface Props {
  // Fires when the assistant successfully creates a table/field/dashboard
  // -- QuickGlanceDashboard passes its own useCustomTables().refetch here so
  // firstTableHref below goes from null to a real link once something
  // exists. Deliberately does NOT navigate away on its own -- the assistant
  // can build several tables/dashboards across one conversation, and
  // yanking the user away the instant the first one exists would cut a
  // multi-step build short.
  onBuildProgress?: () => void;
  // Non-null once at least one table exists -- shown as a "you're set up,
  // move on when ready" link rather than an automatic redirect.
  firstTableHref?: string | null;
}

export default function WelcomeOnboarding({ onBuildProgress, firstTableHref }: Props) {
  const { companyName, isAdmin } = useCompany();

  return (
    <div className="flex flex-col h-screen bg-[#F9FAFB] font-sans antialiased text-slate-600 overflow-y-auto">
      <div className="flex-1 flex flex-col items-center px-6 py-16">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-10">
            <div className="mx-auto w-14 h-14 rounded-3xl bg-indigo-600 flex items-center justify-center mb-6 shadow-lg shadow-indigo-200">
              <Sparkles size={26} className="text-white" />
            </div>
            <h1 className="text-3xl font-light tracking-tight text-slate-900 mb-2">
              Welcome{companyName ? ` to ${companyName}` : ""}
            </h1>
            <p className="text-[13px] text-slate-400 max-w-md mx-auto">
              Your workspace is empty for now -- tell us what your business does and we&apos;ll set up the tables, fields, and dashboards for it.
            </p>
          </div>

          {firstTableHref && (
            <Link
              href={firstTableHref}
              className="mb-4 flex items-center justify-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-2xl text-[12px] font-bold hover:bg-emerald-100 transition-colors"
            >
              <CheckCircle2 size={14} />
              Your workspace has data now -- go take a look
              <ArrowRight size={13} />
            </Link>
          )}

          {isAdmin ? (
            <div className="bg-white border border-slate-100 rounded-[28px] shadow-sm p-6">
              <AiChatThread
                compact
                initialAssistantMessage={'Tell us what you do, and we\'ll help set your database up -- e.g. "I run a plumbing company with 10 employees, I want to track jobs, invoices, and payroll."'}
                placeholder="Tell us what you do..."
                onBuildProgress={onBuildProgress}
              />
            </div>
          ) : (
            <div className="bg-white border border-slate-100 rounded-[28px] shadow-sm p-8 text-center">
              <p className="text-[13px] text-slate-400">
                This workspace hasn&apos;t been set up yet -- ask a company admin to describe your business to the AI assistant, or install a ready-made template.
              </p>
            </div>
          )}

          {isAdmin && (
            <Link
              href="/dashboard/marketplace"
              className="mt-5 flex items-center justify-center gap-2 text-[12px] font-bold text-slate-400 hover:text-indigo-600 transition-colors"
            >
              <LayoutTemplate size={13} />
              Or start from a ready-made template
              <ArrowRight size={13} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
