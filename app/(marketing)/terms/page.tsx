// app/(marketing)/terms/page.tsx
//
// Written generically for a multi-tenant product -- no customer firm is
// named anywhere in here, only "Diract" / "the Company". A specific
// customer's own name only ever appears inside their own account (company
// records, precedent library, letterhead), never in the product's own
// Terms.
//
// IMPORTANT: this is a substantive first draft, not a substitute for review
// by a qualified lawyer in each jurisdiction this product actually operates
// in before it's relied on as the company's real, binding Terms of Service.
//
// Content lives in lib/marketing/legalContent.ts's TERMS_CONTENT (not
// inline JSX) so it can be edited from Admin -> Landing pages (see
// lib/marketingPages/publishedContent.ts's LegalPageCopy) and overridden
// once published -- same TERMS_CONTENT is also the seed source (scripts/
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
import { TERMS_CONTENT } from "@/lib/marketing/legalContent";

export const metadata = { title: "Terms of Service | Diract" };

const LAST_UPDATED = "5 August 2026";

export default async function TermsPage() {
  const h = await headers();
  const defaultJurisdiction = jurisdictionForCountry(h.get("x-vercel-ip-country"));
  const published = await getPublishedLegalCopy("terms");

  return (
    <LegalPageShell title="Terms of Service" lastUpdated={LAST_UPDATED}>
      <RenderLegalSections copy={published ?? TERMS_CONTENT} defaultJurisdiction={defaultJurisdiction} />
    </LegalPageShell>
  );
}
