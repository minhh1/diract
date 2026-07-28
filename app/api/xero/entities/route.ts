// app/api/xero/entities/route.ts
// Admin-only: list this company's entities with their linked Xero
// organisation (if any), and link/unlink one to a connection. Separate
// from the generic custom-table field system -- xero_connection_id is a
// plain entities column (see the migration), not a company_custom_field.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const { data, error } = await admin
    .from("entities")
    .select("id, name, entity_type, xero_connection_id")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ entities: data });
}

export async function PATCH(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const entityId = body?.entity_id;
  if (!entityId) return NextResponse.json({ error: "entity_id is required" }, { status: 400 });
  // null is a valid value (unlink)
  const xeroConnectionId = body?.xero_connection_id ?? null;

  if (xeroConnectionId) {
    const { data: connection } = await admin
      .from("company_xero_connections")
      .select("id")
      .eq("id", xeroConnectionId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!connection) return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  const { error } = await admin
    .from("entities")
    .update({ xero_connection_id: xeroConnectionId })
    .eq("id", entityId)
    .eq("company_id", companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
