// app/api/virtual-computers/credentials/route.ts
// Admin-only CRUD for company_cloud_credentials. GET never returns the
// `credentials` column to the browser.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

const VALID_PROVIDERS = ["digitalocean", "aws", "gcp"];

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { data, error } = await admin
    .from("company_cloud_credentials")
    .select("id, provider, label, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ credentials: data || [] });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const provider = body?.provider;
  const label = body?.label;
  const credentials = body?.credentials;

  if (!VALID_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }
  if (!label || typeof label !== "string") {
    return NextResponse.json({ error: "label is required" }, { status: 400 });
  }
  if (!credentials || typeof credentials !== "object") {
    return NextResponse.json({ error: "credentials is required" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("company_cloud_credentials")
    .insert({ company_id: companyId, provider, label, credentials, created_by: user.id })
    .select("id, provider, label, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ credential: data });
}
