// app/api/virtual-computers/[id]/product-key/route.ts
// Admin-only -- records the Windows product key activated inside a VM (see
// supabase/virtual_computers_product_key.sql). Deliberately admin-only
// rather than the assigned-member-or-admin level resolution/route.ts uses:
// this is company-owned license inventory, not a personal preference.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadVm } from "../../_lib";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const vm = await loadVm(admin, companyId, id);
  if (!vm) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const raw = body?.productKey;
  if (raw !== null && typeof raw !== "string") {
    return NextResponse.json({ error: "productKey must be a string or null" }, { status: 400 });
  }
  const productKey = typeof raw === "string" ? raw.trim() || null : null;

  await admin
    .from("virtual_computers")
    .update({ windows_product_key: productKey, updated_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ ok: true });
}
