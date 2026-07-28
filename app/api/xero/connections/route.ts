// app/api/xero/connections/route.ts
// Admin-only list/disconnect for this company's connected Xero
// organisations. GET never selects access_token/refresh_token (mirrors
// app/api/teams/credentials/route.ts's rule for `credentials`).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const { data, error } = await admin
    .from("company_xero_connections")
    .select("id, tenant_id, tenant_name, last_synced_at, last_sync_error, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ connections: data });
}

export async function DELETE(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data: connection } = await admin
    .from("company_xero_connections")
    .select("access_token, xero_connection_ref_id")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!connection) return NextResponse.json({ error: "Connection not found" }, { status: 404 });

  if (connection.xero_connection_ref_id) {
    const revokeRes = await fetch(`https://api.xero.com/connections/${connection.xero_connection_ref_id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${connection.access_token}` },
    });
    if (!revokeRes.ok) {
      // Xero-side revoke failing (e.g. token already expired) shouldn't
      // block removing our own record of the connection.
      console.error("Xero connection revoke failed:", revokeRes.status, await revokeRes.text());
    }
  }

  const { error } = await admin.from("company_xero_connections").delete().eq("id", id).eq("company_id", companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
