// app/api/virtual-computers/pricing/route.ts
// Feeds the cost-comparison table in the admin "create virtual computer" form.
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { PRICING, PROVIDER_LABELS } from "@/lib/vmProviders/pricing";
import { PROVISIONABLE_PROVIDERS } from "@/lib/vmProviders/registry";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  if (!auth.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  return NextResponse.json({
    pricing: PRICING,
    providerLabels: PROVIDER_LABELS,
    provisionableProviders: PROVISIONABLE_PROVIDERS,
  });
}
