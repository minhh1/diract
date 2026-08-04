"use client";

// Quick Glance -- the landing page for companies whose type has a widget
// set built for it (see the redirects into /dashboard/quick-glance: proxy.ts,
// app/auth/callback/route.ts, app/(marketing)/login/page.tsx, and
// Sidebar.tsx's company-switch handler). Widget set is entirely determined
// by companies.company_type (same field/values InvoiceTemplateSettingsTab.tsx
// already gates its law-firm-only invoice template on) -- a company that
// isn't one of these two known types has nothing to show here, so this
// bounces it straight on to Properties instead of landing on a blank page.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { useCompany } from "@/components/CompanyContext";

const LawFirmQuickGlance = dynamic(() => import("./quickGlance/LawFirmQuickGlance"));
const PropertyDeveloperQuickGlance = dynamic(() => import("./quickGlance/PropertyDeveloperQuickGlance"));
const SetupChecklist = dynamic(() => import("./quickGlance/SetupChecklist"));

const KNOWN_TYPES = ['Law Firm', 'Property Developer'];

export default function QuickGlanceDashboard() {
  const { companyType, loading } = useCompany();
  const router = useRouter();
  const isKnownType = !!companyType && KNOWN_TYPES.includes(companyType);

  useEffect(() => {
    if (!loading && !isKnownType) router.replace('/dashboard/properties');
  }, [loading, isKnownType, router]);

  if (loading || !isKnownType) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-[#F9FAFB]">
        <Loader2 size={20} className="animate-spin text-slate-300" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#F9FAFB] font-sans antialiased text-slate-600 overflow-hidden">
      <header className="bg-white border-b border-slate-100 shrink-0">
        <div className="pt-16 md:pt-8 px-8 pb-6">
          <h1 className="text-3xl font-light uppercase tracking-tight text-slate-900">
            Quick Glance
          </h1>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto p-8">
        <SetupChecklist />
        {companyType === 'Law Firm' ? <LawFirmQuickGlance /> : <PropertyDeveloperQuickGlance />}
      </main>
    </div>
  );
}
