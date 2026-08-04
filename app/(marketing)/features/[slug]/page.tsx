import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import MarketingNav from "@/components/marketing/MarketingNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import { MockupThemeProvider, MockupThemeToggle } from "@/components/marketing/MockupThemeProvider";
import { ALL_FEATURES, getFeatureEntry } from "@/lib/marketing/allFeatures";
import { audienceNavLinks } from "@/lib/marketing/audiences";
import AiTimeEntriesDetail from "@/components/marketing/details/AiTimeEntriesDetail";
import TrustComplianceDetail from "@/components/marketing/details/TrustComplianceDetail";
import GenericFeatureDetail from "@/components/marketing/details/GenericFeatureDetail";

// Only "ai-time-entries" and "trust-compliance" have bespoke deep-dive
// content today (rendered by name below) -- every other feature falls back
// to GenericFeatureDetail, reusing its existing title/body/mockup.

export function generateStaticParams() {
  return Object.keys(ALL_FEATURES).map((slug) => ({ slug }));
}

export default async function FeatureDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = getFeatureEntry(slug);
  if (!entry) notFound();

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

        {slug === "ai-time-entries" ? (
          <AiTimeEntriesDetail />
        ) : slug === "trust-compliance" ? (
          <TrustComplianceDetail />
        ) : (
          <GenericFeatureDetail feature={entry.feature} />
        )}

        <MarketingFooter />
      </div>
    </MockupThemeProvider>
  );
}
