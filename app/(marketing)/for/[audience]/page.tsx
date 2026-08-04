import { notFound } from "next/navigation";
import MarketingNav from "@/components/marketing/MarketingNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import Hero from "@/components/marketing/Hero";
import FeatureSpotlight from "@/components/marketing/FeatureSpotlight";
import { AUDIENCES, getAudience } from "@/lib/marketing/audiences";

export function generateStaticParams() {
  return Object.keys(AUDIENCES).map((audience) => ({ audience }));
}

export default async function AudienceLandingPage({ params }: { params: Promise<{ audience: string }> }) {
  const { audience } = await params;
  const content = getAudience(audience);
  if (!content) notFound();

  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased select-text">
      <MarketingNav />

      <Hero
        badge={content.badge}
        headlineLines={content.headlineLines}
        subheadline={content.subheadline}
        primaryCta={{ href: "/login", label: content.primaryCtaLabel }}
      />

      <FeatureSpotlight
        eyebrow={content.eyebrow}
        heading={content.heading}
        features={content.features}
      />

      <MarketingFooter />
    </div>
  );
}
