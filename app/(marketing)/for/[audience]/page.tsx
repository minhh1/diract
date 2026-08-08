import { notFound } from "next/navigation";
import MarketingNav from "@/components/marketing/MarketingNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import Hero from "@/components/marketing/Hero";
import FeatureSpotlight from "@/components/marketing/FeatureSpotlight";
import { AUDIENCES, getAudience, audienceNavLinks } from "@/lib/marketing/audiences";
import { MockupThemeProvider, MockupThemeToggle } from "@/components/marketing/MockupThemeProvider";
import { getPublishedHeroSpotlightCopy, mergeFeatureCopy } from "@/lib/marketingPages/publishedContent";

export function generateStaticParams() {
  return Object.keys(AUDIENCES).map((audience) => ({ audience }));
}

// Copy fields (badge/headline/subheadline/eyebrow/heading/CTA label, each
// feature's title/body) can be overridden from Admin -> Landing pages once
// published for page_key `for/${audience}` -- see
// lib/marketingPages/publishedContent.ts. Falls back to the static
// AUDIENCES entry below whenever nothing's been published yet. Layout,
// hrefs, and mockup/icon choices always come from code.
export default async function AudienceLandingPage({ params }: { params: Promise<{ audience: string }> }) {
  const { audience } = await params;
  const content = getAudience(audience);
  if (!content) notFound();

  const published = await getPublishedHeroSpotlightCopy(`for/${audience}`);
  const badge = published?.badge ?? content.badge;
  const headlineLines: [string, string] = published
    ? [published.headlineLine1, published.headlineLine2]
    : content.headlineLines;
  const subheadline = published?.subheadline ?? content.subheadline;
  const eyebrow = published?.eyebrow ?? content.eyebrow;
  const heading = published?.heading ?? content.heading;
  const primaryCtaLabel = published?.primaryCtaLabel ?? content.primaryCtaLabel;
  const features = mergeFeatureCopy(content.features, published?.features);

  return (
    <MockupThemeProvider>
    <div className="min-h-screen bg-stone-50 text-slate-900 antialiased select-text">
      <MarketingNav audienceLinks={audienceNavLinks()} />
      <MockupThemeToggle />

      <Hero
        badge={badge}
        headlineLines={headlineLines}
        subheadline={subheadline}
        primaryCta={{ href: content.primaryCtaHref ?? "/login", label: primaryCtaLabel }}
        visual={content.heroVisual}
      />

      <FeatureSpotlight
        eyebrow={eyebrow}
        heading={heading}
        features={features}
      />

      <MarketingFooter />
    </div>
    </MockupThemeProvider>
  );
}
