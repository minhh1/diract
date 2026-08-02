// app/api/precedents/library/install/route.ts
// Admin-triggered install / top-up of the seeded precedent library for the
// current company. The Law Firm marketplace template calls the same
// underlying helper on install (see app/api/templates/[slug]/install/
// route.ts), so this route exists for two cases: a firm that installed the
// template before the library existed, and topping up after the library
// grows.
//
// The actual work lives in lib/precedents/installLibrary.ts so both entry
// points share one implementation.
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { installPrecedentLibrary, hasLawFirmTemplate, getPrecedentLibraryStatus } from "@/lib/precedents/installLibrary";

export async function POST() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user, companyId, isAdmin } = auth;

  if (!isAdmin) {
    return NextResponse.json({ error: "Only a company admin can install the precedent library" }, { status: 403 });
  }
  // The seeded library is Australian-law-firm-specific content -- see
  // supabase/template_law_firm_seed.sql -- not a generic feature every
  // tenant should be able to self-serve into their company.
  if (!(await hasLawFirmTemplate(admin, companyId))) {
    return NextResponse.json({ error: "The precedent library is only available to companies on the Law Firm template" }, { status: 403 });
  }

  const { result, error } = await installPrecedentLibrary(admin, companyId, user.id);
  if (error) return NextResponse.json({ error }, { status: 500 });

  return NextResponse.json({ ok: true, ...result });
}

// Lets the Settings screen show what an install would do before doing it.
export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  if (!(await hasLawFirmTemplate(admin, companyId))) {
    return NextResponse.json({ error: "The precedent library is only available to companies on the Law Firm template" }, { status: 403 });
  }

  return NextResponse.json(await getPrecedentLibraryStatus(admin, companyId));
}
