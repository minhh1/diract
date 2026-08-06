import { notFound } from "next/navigation";
import MarketingNav from "@/components/marketing/MarketingNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import Hero from "@/components/marketing/Hero";
import FeatureSpotlight from "@/components/marketing/FeatureSpotlight";
import { AUDIENCES, getAudience, audienceNavLinks } from "@/lib/marketing/audiences";
import { MockupThemeProvider, MockupThemeToggle } from "@/components/marketing/MockupThemeProvider";

export function generateStaticParams() {
  return Object.keys(AUDIENCES).map((audience) => ({ audience }));
}

export default async function AudienceLandingPage({ params }: { params: Promise<{ audience: string }> }) {
  const { audience } = await params;
  const content = getAudience(audience);
  if (!content) notFound();

  return (
    <MockupThemeProvider>
    <div className="min-h-screen bg-stone-50 text-slate-900 antialiased select-text">
      <MarketingNav audienceLinks={audienceNavLinks()} />
      <MockupThemeToggle />

      <Hero
        badge={content.badge}
        headlineLines={content.headlineLines}
        subheadline={content.subheadline}
        primaryCta={{ href: content.primaryCtaHref ?? "/login", label: content.primaryCtaLabel }}
        visual={content.heroVisual}
      />

      <FeatureSpotlight
        eyebrow={content.eyebrow}
        heading={content.heading}
        features={content.features}
      />

      <MarketingFooter />
    </div>
    </MockupThemeProvider>
  );
}
