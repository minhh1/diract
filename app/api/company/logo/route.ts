// app/api/company/logo/route.ts
// Company-admin-only logo upload/removal for the active company. Direct
// clone of app/api/profile/avatar/route.ts's pattern, scoped to a company
// instead of a user -- public `company-logos` bucket at
// {companyId}/{uuid}.{ext}, points companies.logo_url at it, removes the
// previous file on replace/clear. See supabase/companies_invoice_settings.sql
// for the bucket setup.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { randomUUID } from "crypto";

const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function requireCompanyAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) } as const;

  const admin = adminClient();
  const { data: profile } = await admin.from("profiles").select("active_company_id").eq("id", user.id).single();
  const companyId = profile?.active_company_id;
  if (!companyId) return { error: NextResponse.json({ error: "No active company" }, { status: 400 }) } as const;

  const { data: membership } = await admin
    .from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
  if (membership?.role !== "company_admin") {
    return { error: NextResponse.json({ error: "Only a company admin can change the invoice logo" }, { status: 403 }) } as const;
  }

  return { admin, companyId } as const;
}

export async function POST(req: NextRequest) {
  const ctx = await requireCompanyAdmin();
  if ("error" in ctx) return ctx.error;
  const { admin, companyId } = ctx;

  let form: FormData;
  try { form = await req.formData(); } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "A logo file is required" }, { status: 400 });

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Logo must be a PNG, JPEG, WEBP, or SVG" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Logo must be under 5MB" }, { status: 400 });

  const { data: company } = await admin.from("companies").select("logo_url").eq("id", companyId).single();

  const bytes = Buffer.from(await file.arrayBuffer());
  const storagePath = `${companyId}/${randomUUID()}.${ext}`;

  const { error: uploadErr } = await admin.storage.from("company-logos").upload(storagePath, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadErr) return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 });

  const { data: pub } = admin.storage.from("company-logos").getPublicUrl(storagePath);

  const { error: updateErr } = await admin.from("companies").update({ logo_url: pub.publicUrl }).eq("id", companyId);
  if (updateErr) {
    await admin.storage.from("company-logos").remove([storagePath]);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const previousPath = extractStoragePath(company?.logo_url);
  if (previousPath) await admin.storage.from("company-logos").remove([previousPath]);

  return NextResponse.json({ ok: true, logo_url: pub.publicUrl });
}

export async function DELETE() {
  const ctx = await requireCompanyAdmin();
  if ("error" in ctx) return ctx.error;
  const { admin, companyId } = ctx;

  const { data: company } = await admin.from("companies").select("logo_url").eq("id", companyId).single();

  const { error: updateErr } = await admin.from("companies").update({ logo_url: null }).eq("id", companyId);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  const previousPath = extractStoragePath(company?.logo_url);
  if (previousPath) await admin.storage.from("company-logos").remove([previousPath]);

  return NextResponse.json({ ok: true });
}

function extractStoragePath(logoUrl: string | null | undefined): string | null {
  if (!logoUrl) return null;
  const marker = "/company-logos/";
  const idx = logoUrl.indexOf(marker);
  return idx === -1 ? null : logoUrl.slice(idx + marker.length);
}
