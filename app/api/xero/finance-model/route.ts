// app/api/xero/finance-model/route.ts
// Actual income/expenses for an entity's linked Xero organisation -- backs
// the "Finance Model" record tab (components/dashboard/tabs/FinanceModelTab.tsx).
// Reads bank transactions rather than invoices/bills: a bank transaction is
// money that has actually moved, which is what "actual spent" (as opposed
// to invoiced/accrued) means for a property development finance model.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { xeroApiFetch } from "@/lib/xero/client";

// Xero's JSON API renders dates as .NET's `/Date(epochMillis+tzOffset)/`
// wire format, not ISO -- this parses that (falling back to a plain ISO
// string, in case a future API version stops doing this) into an ISO date.
function parseXeroDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/\/Date\((-?\d+)/);
  if (match) return new Date(Number(match[1])).toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const entityId = req.nextUrl.searchParams.get("entityId");
  if (!entityId) return NextResponse.json({ error: "entityId is required" }, { status: 400 });

  const { data: entity } = await admin
    .from("entities")
    .select("id, name, xero_connection_id, connection:company_xero_connections(id, tenant_name)")
    .eq("id", entityId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!entity) return NextResponse.json({ error: "Entity not found" }, { status: 404 });
  if (!entity.xero_connection_id) return NextResponse.json({ connected: false });

  try {
    const res = await xeroApiFetch(
      entity.xero_connection_id,
      admin,
      `/BankTransactions?order=Date DESC&where=${encodeURIComponent('Status=="AUTHORISED"')}`
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // 403/insufficient_scope means this connection was authorized before
      // XERO_SCOPES was widened to include accounting.banktransactions.read
      // -- the fix is reconnecting (Admin -> Xero -> disconnect, then
      // Connect an organisation again), not a bug here.
      return NextResponse.json(
        { error: `Xero API error (${res.status}): ${text || res.statusText}`, needsReconnect: res.status === 403 },
        { status: 502 }
      );
    }
    const json = await res.json();
    const transactions = (json.BankTransactions || []).map((t: any) => ({
      id: t.BankTransactionID,
      date: parseXeroDate(t.Date),
      type: t.Type === "RECEIVE" ? "income" : t.Type === "SPEND" ? "expense" : "other",
      contact: t.Contact?.Name || null,
      reference: t.Reference || t.LineItems?.[0]?.Description || null,
      total: typeof t.Total === "number" ? t.Total : Number(t.Total) || 0,
    }));

    return NextResponse.json({
      connected: true,
      tenantName: (entity as any).connection?.tenant_name ?? null,
      transactions,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to fetch Xero data" }, { status: 502 });
  }
}
