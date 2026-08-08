// app/api/admin/kiosk-accounts/route.ts
// Admin-only creation/listing/revocation of kiosk logins -- a non-human
// account for a shared device (e.g. an iPad at a work location) that an
// admin sets a password for directly, rather than the normal self-signup
// (email confirmation) flow every other account goes through. See
// supabase/migrations/20260808200000_kiosk_role.sql onward for the RLS
// side of the lockdown; this route is the only way such an account gets
// created or revoked.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Only a company admin can view kiosk accounts" }, { status: 403 });

  // kiosk_accounts has two FKs into profiles (user_id, created_by) --
  // `!user_id` disambiguates which one PostgREST should embed here.
  const { data, error } = await admin
    .from("kiosk_accounts")
    .select("id, label, created_at, profiles:profiles!user_id(email)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ accounts: data });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Only a company admin can create a kiosk account" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!label) return NextResponse.json({ error: "Label is required" }, { status: 400 });
  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });

  // auth.users insert fires the existing handle_new_user() trigger, which
  // inserts a bare profiles row (role 'operator', active_company_id NULL)
  // before this handler gets a chance to run -- confirmed live via
  // pg_proc. The update below overwrites that row rather than inserting a
  // fresh one.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: label },
  });
  if (createErr || !created.user) {
    return NextResponse.json({ error: createErr?.message ?? "Could not create login" }, { status: 400 });
  }
  const kioskUserId = created.user.id;

  const { error: profileErr } = await admin.from("profiles").update({
    role: "kiosk", active_company_id: companyId, full_name: label, is_active: true, is_admin: false,
  }).eq("id", kioskUserId);

  const { error: membershipErr } = await admin.from("company_memberships")
    .insert({ user_id: kioskUserId, company_id: companyId, role: "kiosk" });

  const { data: kioskAccount, error: kioskErr } = await admin.from("kiosk_accounts")
    .insert({ company_id: companyId, user_id: kioskUserId, label, created_by: user.id })
    .select("id, label, created_at")
    .single();

  const firstError = profileErr ?? membershipErr ?? kioskErr;
  if (firstError) {
    // Best-effort cleanup so a partial failure doesn't leave a dangling,
    // unrevocable auth user behind with no kiosk_accounts row to manage it.
    await admin.auth.admin.deleteUser(kioskUserId).catch(() => {});
    return NextResponse.json({ error: firstError.message }, { status: 500 });
  }

  return NextResponse.json({ account: { ...kioskAccount, email } });
}

export async function DELETE(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Only a company admin can revoke a kiosk account" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data: account } = await admin.from("kiosk_accounts")
    .select("user_id").eq("id", id).eq("company_id", companyId).maybeSingle();
  if (!account) return NextResponse.json({ error: "Kiosk account not found" }, { status: 404 });

  await admin.from("company_memberships").delete().eq("user_id", account.user_id).eq("company_id", companyId);
  await admin.from("kiosk_accounts").delete().eq("id", id);

  // active_company_id() only treats a session as kiosk-locked while a
  // matching company_memberships row exists (just deleted above) -- so
  // without also clearing profiles.active_company_id here, this login
  // would fall through to the function's normal branch and inherit full,
  // untethered member-level access to the company instead of being denied.
  await admin.from("profiles").update({ active_company_id: null, is_active: false }).eq("id", account.user_id);

  return NextResponse.json({ ok: true });
}
