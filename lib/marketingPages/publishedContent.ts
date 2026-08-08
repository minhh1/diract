// lib/marketingPages/publishedContent.ts
// Read path for the live marketing site (app/(marketing)/page.tsx,
// .../for/[audience]/page.tsx) -- an anonymous visitor has no session, so
// this always uses the service-role client rather than RLS, same
// unauthenticated-read shape as app/api/pages/public/[slug]/route.ts.
// Returns null whenever nothing's been published yet (or the row doesn't
// exist), which every caller treats as "use the static code content."
import { createClient } from "@supabase/supabase-js";
import { MINH_HUYNH_COMPANY_ID } from "@/lib/marketingPages/ids";

export interface HeroSpotlightCopy {
  badge: string;
  headlineLine1: string;
  headlineLine2: string;
  subheadline: string;
  eyebrow: string;
  heading: string;
  primaryCtaLabel: string;
  features: { slug: string; title: string; body: string }[];
}

function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function getPublishedHeroSpotlightCopy(pageKey: string): Promise<HeroSpotlightCopy | null> {
  const admin = serviceClient();
  const { data } = await admin
    .from("marketing_page_content")
    .select("published_content")
    .eq("company_id", MINH_HUYNH_COMPANY_ID)
    .eq("page_key", pageKey)
    .maybeSingle();
  return (data?.published_content as HeroSpotlightCopy | null) ?? null;
}

// One of the 23 feature deep-dive pages (components/marketing/details/*.tsx)
// -- each is a DetailHero + an ordered stack of Section blocks (see
// components/marketing/details/Section.tsx). `key` identifies a section
// stably (not array order) so a published edit still lines up correctly if
// a component's section order ever changes in code. `body` is one string
// per paragraph in that section -- mockups, chip lists, and inline
// <Link> CTAs are never part of this shape, they stay hardcoded in the
// component.
export interface FeatureDetailSection {
  key: string;
  eyebrow: string;
  title: string;
  body: string[];
}

export interface FeatureDetailCopy {
  badgeText: string;
  headlineLine1: string;
  headlineLine2: string;
  subheadline: string;
  sections: FeatureDetailSection[];
}

export async function getPublishedFeatureDetailCopy(pageKey: string): Promise<FeatureDetailCopy | null> {
  const admin = serviceClient();
  const { data } = await admin
    .from("marketing_page_content")
    .select("published_content")
    .eq("company_id", MINH_HUYNH_COMPANY_ID)
    .eq("page_key", pageKey)
    .maybeSingle();
  return (data?.published_content as FeatureDetailCopy | null) ?? null;
}

// Overlays a published copy's title/body onto the code-defined feature list
// by slug -- icon/visual/accent/wideVisual always come from code, never from
// published_content, so a copy edit can't reference a mockup or icon that
// doesn't exist. A code feature with no matching published entry (e.g. a new
// feature added after the last publish) just keeps its code copy.
export function mergeFeatureCopy<T extends { slug: string; title: string; body: string }>(
  codeFeatures: T[],
  published: { slug: string; title: string; body: string }[] | undefined
): T[] {
  if (!published) return codeFeatures;
  const bySlug = new Map(published.map(f => [f.slug, f]));
  return codeFeatures.map(f => {
    const override = bySlug.get(f.slug);
    return override ? { ...f, title: override.title, body: override.body } : f;
  });
}
