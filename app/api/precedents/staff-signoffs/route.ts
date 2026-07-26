// app/api/precedents/staff-signoffs/route.ts
// Directory of every staff member's signoff block (see
// supabase/migrations/20260726070000_staff_signoffs.sql) -- used both by the
// Precedents settings screen's "Staff signoffs" section and by the signer
// picker (any company member can be selected as a signer, see
// precedent_settings.signers). GET lists everyone in the company, joined
// against any signoff row they've already saved (same two-query
// membership+profiles pattern app/dashboard/admin/page.tsx uses, avoiding FK
// join issues). PUT creates/updates: your own row always allowed; any row if
// you're a company admin (e.g. setting up a signoff for someone who hasn't
// done it themselves yet).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const [{ data: memberships }, { data: signoffs }] = await Promise.all([
    admin.from("company_memberships").select("user_id").eq("company_id", companyId),
    admin.from("staff_signoffs").select("*").eq("company_id", companyId),
  ]);

  const userIds = (memberships || []).map((m: any) => m.user_id);
  const { data: profiles } = userIds.length
    ? await admin.from("profiles").select("id, full_name, email").in("id", userIds)
    : { data: [] };

  const signoffByUserId = new Map((signoffs || []).map((s: any) => [s.user_id, s]));
  const staff = (memberships || []).map((m: any) => {
    const prof = (profiles || []).find((p: any) => p.id === m.user_id);
    const signoff = signoffByUserId.get(m.user_id);
    return {
      userId: m.user_id,
      accountName: prof?.full_name || prof?.email || "Unknown",
      name: signoff?.name || prof?.full_name || "",
      position: signoff?.position || "",
      companyName: signoff?.company_name || "",
      contactNumber: signoff?.contact_number || "",
      contactEmail: signoff?.contact_email || prof?.email || "",
      hasSignoff: !!signoff,
    };
  });

  return NextResponse.json({ staff });
}

export async function PUT(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user, companyId, isAdmin } = auth;

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const targetUserId = String(body?.userId || "").trim();
  if (!targetUserId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
  if (targetUserId !== user.id && !isAdmin) {
    return NextResponse.json({ error: "You can only edit your own signoff" }, { status: 403 });
  }

  const { data: membership } = await admin
    .from("company_memberships").select("user_id").eq("company_id", companyId).eq("user_id", targetUserId).maybeSingle();
  if (!membership) return NextResponse.json({ error: "That person isn't a member of this company" }, { status: 400 });

  const name = String(body?.name || "").trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const { data, error } = await admin.from("staff_signoffs").upsert({
    company_id: companyId,
    user_id: targetUserId,
    name,
    position: String(body?.position || "").trim() || null,
    company_name: String(body?.companyName || "").trim() || null,
    contact_number: String(body?.contactNumber || "").trim() || null,
    contact_email: String(body?.contactEmail || "").trim() || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "company_id,user_id" }).select("*").single();

  if (error || !data) return NextResponse.json({ error: error?.message || "Failed to save signoff" }, { status: 500 });
  return NextResponse.json({ ok: true, signoff: data });
}

export async function DELETE(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Only a company admin can remove a staff signoff" }, { status: 403 });

  const targetUserId = req.nextUrl.searchParams.get("userId");
  if (!targetUserId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const { error } = await admin.from("staff_signoffs").delete().eq("company_id", companyId).eq("user_id", targetUserId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
