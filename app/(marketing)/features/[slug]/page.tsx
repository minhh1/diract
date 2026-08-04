import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import MarketingNav from "@/components/marketing/MarketingNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import { MockupThemeProvider, MockupThemeToggle } from "@/components/marketing/MockupThemeProvider";
import { ALL_FEATURES, getFeatureEntry } from "@/lib/marketing/allFeatures";
import { audienceNavLinks } from "@/lib/marketing/audiences";
import GenericFeatureDetail from "@/components/marketing/details/GenericFeatureDetail";
import AiTimeEntriesDetail from "@/components/marketing/details/AiTimeEntriesDetail";
import TrustComplianceDetail from "@/components/marketing/details/TrustComplianceDetail";
import GmailLabelsDetail from "@/components/marketing/details/GmailLabelsDetail";
import CustomTablesDetail from "@/components/marketing/details/CustomTablesDetail";
import AutoAddRulesDetail from "@/components/marketing/details/AutoAddRulesDetail";
import MultiCompanyDetail from "@/components/marketing/details/MultiCompanyDetail";
import RoleAccessDetail from "@/components/marketing/details/RoleAccessDetail";
import ReportingDashboardsDetail from "@/components/marketing/details/ReportingDashboardsDetail";
import TimeEntriesDetail from "@/components/marketing/details/TimeEntriesDetail";
import FeesReportsDetail from "@/components/marketing/details/FeesReportsDetail";
import PrecedentsDetail from "@/components/marketing/details/PrecedentsDetail";
import TeamsManagementDetail from "@/components/marketing/details/TeamsManagementDetail";
import ClientUpdatesDetail from "@/components/marketing/details/ClientUpdatesDetail";
import TasksDetail from "@/components/marketing/details/TasksDetail";
import LoanFacilitiesDetail from "@/components/marketing/details/LoanFacilitiesDetail";
import FinanceModelDetail from "@/components/marketing/details/FinanceModelDetail";
import LoanScheduleDetail from "@/components/marketing/details/LoanScheduleDetail";
import ResidualLandSolverDetail from "@/components/marketing/details/ResidualLandSolverDetail";
import EntityValidationDetail from "@/components/marketing/details/EntityValidationDetail";
import DisbursementsImportDetail from "@/components/marketing/details/DisbursementsImportDetail";
import AiSafetyDetail from "@/components/marketing/details/AiSafetyDetail";
import MarketplaceDetail from "@/components/marketing/details/MarketplaceDetail";

// Every slug with bespoke deep-dive content lives here -- every feature
// across every landing page now has one. Add an entry here the same way
// as more variants get built, same pattern as lib/marketing/audiences.ts's
// registry. GenericFeatureDetail is kept as a fallback for any future
// feature added without a deep-dive yet.
const RICH_DETAILS: Record<string, React.ComponentType> = {
  "custom-tables-fields": CustomTablesDetail,
  "auto-add-rules": AutoAddRulesDetail,
  "multi-company": MultiCompanyDetail,
  "role-based-access": RoleAccessDetail,
  "reporting-dashboards": ReportingDashboardsDetail,
  "shared-gmail-labels": GmailLabelsDetail,
  "ai-safety": AiSafetyDetail,
  "marketplace": MarketplaceDetail,
  "time-entries": TimeEntriesDetail,
  "ai-time-entries": AiTimeEntriesDetail,
  "trust-compliance": TrustComplianceDetail,
  "fees-reports": FeesReportsDetail,
  "disbursements-import": DisbursementsImportDetail,
  "precedents": PrecedentsDetail,
  "teams-management": TeamsManagementDetail,
  "client-updates": ClientUpdatesDetail,
  "tasks": TasksDetail,
  "loan-facilities": LoanFacilitiesDetail,
  "finance-model": FinanceModelDetail,
  "loan-schedule": LoanScheduleDetail,
  "residual-land-solver": ResidualLandSolverDetail,
  "entity-validation": EntityValidationDetail,
};

export function generateStaticParams() {
  return Object.keys(ALL_FEATURES).map((slug) => ({ slug }));
}

export default async function FeatureDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = getFeatureEntry(slug);
  if (!entry) notFound();
  const RichDetail = RICH_DETAILS[slug];

  return (
    <MockupThemeProvider>
      <div className="min-h-screen bg-white text-slate-900 antialiased select-text">
        <MarketingNav audienceLinks={audienceNavLinks()} />
        <MockupThemeToggle />

        <div className="pt-32 pb-6 px-6">
          <div className="max-w-4xl mx-auto">
            <Link href={entry.back.href} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-400 hover:text-indigo-600 transition-colors">
              <ArrowLeft size={14} /> Back to {entry.back.label}
            </Link>
          </div>
        </div>

        {RichDetail ? <RichDetail /> : <GenericFeatureDetail feature={entry.feature} />}

        <MarketingFooter />
      </div>
    </MockupThemeProvider>
  );
}
