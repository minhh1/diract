// app/(marketing)/privacy/page.tsx
//
// Written generically for a multi-tenant product -- no customer firm is
// named anywhere in here, only "Diract" / "the Company".
//
// IMPORTANT: this is a substantive first draft, not a substitute for review
// by a qualified lawyer (and, for the EU/UK section in particular, a
// privacy specialist) before it's relied on as the company's real, binding
// Privacy Policy.
//
// Content lives in lib/marketing/legalContent.ts's PRIVACY_CONTENT (not
// inline JSX) so it can be edited from Admin -> Landing pages (see
// lib/marketingPages/publishedContent.ts's LegalPageCopy) and overridden
// once published -- same PRIVACY_CONTENT is also the seed source (scripts/
// createMinhHuynhCompany.ts). That file isn't inline here specifically so
// the seed script can import it without dragging in this page's
// next/headers import. Rendered via the shared
// components/legal/RenderLegalSections.tsx so a published edit produces
// the exact same Section/SubSection/list/JurisdictionTabs structure a
// hand-written page would.
import { headers } from "next/headers";
import LegalPageShell from "@/components/legal/LegalPageShell";
import RenderLegalSections from "@/components/legal/RenderLegalSections";
import { jurisdictionForCountry } from "@/lib/legalJurisdiction";
import { getPublishedLegalCopy } from "@/lib/marketingPages/publishedContent";
import { PRIVACY_CONTENT } from "@/lib/marketing/legalContent";

export const metadata = { title: "Privacy Policy | Diract" };

const LAST_UPDATED = "5 August 2026";

export default async function PrivacyPage() {
  const h = await headers();
  const defaultJurisdiction = jurisdictionForCountry(h.get("x-vercel-ip-country"));
  const published = await getPublishedLegalCopy("privacy");

  return (
    <LegalPageShell title="Privacy Policy" lastUpdated={LAST_UPDATED}>
      <RenderLegalSections copy={published ?? PRIVACY_CONTENT} defaultJurisdiction={defaultJurisdiction} />
    </LegalPageShell>
  );
}
