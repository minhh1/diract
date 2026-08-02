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
import { installPrecedentLibrary } from "@/lib/precedents/installLibrary";
import { PRECEDENT_LIBRARY } from "@/lib/precedents/library";

export async function POST() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user, companyId, isAdmin } = auth;

  if (!isAdmin) {
    return NextResponse.json({ error: "Only a company admin can install the precedent library" }, { status: 403 });
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

  const { data: existing } = await admin
    .from("precedents")
    .select("library_key")
    .eq("company_id", companyId)
    .not("library_key", "is", null)
    .is("deleted_at", null);
  const alreadyInstalled = new Set((existing || []).map(r => r.library_key));

  return NextResponse.json({
    total: PRECEDENT_LIBRARY.length,
    installed: alreadyInstalled.size,
    available: PRECEDENT_LIBRARY.filter(s => !alreadyInstalled.has(s.key)).length,
  });
}
