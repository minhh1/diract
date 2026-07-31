// lib/xero/financeModelData.ts
// Shared data-loading for the Finance Model tab/public page -- used by both
// app/api/xero/finance-model/route.ts (authenticated) and
// app/api/finance-model-pages/public/[pageId]/route.ts (unauthenticated,
// access-code gated) so the two don't drift out of sync on what "actual
// spent" means. Both call this with a service-role/admin client after
// their own, different auth checks.
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

export interface FinanceModelData {
  connected: boolean;
  tenantName?: string | null;
  transactions?: any[];
  budgetLines: any[];
  properties: any[];
  error?: string;
  needsReconnect?: boolean;
}

export async function loadFinanceModelData(admin: any, entityId: string): Promise<FinanceModelData | null> {
  const { data: entity } = await admin
    .from("entities")
    .select("id, xero_connection_id, connection:company_xero_connections(id, tenant_name)")
    .eq("id", entityId)
    .maybeSingle();
  if (!entity) return null;

  // Independent of Xero connection status -- both only need entityId, so
  // one round trip covers both instead of two sequential ones.
  const [{ data: budgetLineRows }, { data: propertyRows }] = await Promise.all([
    admin
      .from("finance_model_budget_lines")
      .select("id, category, label, budgeted_amount, xero_account_code, display_order")
      .eq("entity_id", entityId)
      .order("display_order"),
    admin
      .from("properties")
      .select("id, street_address, state, purchase_price")
      .eq("holding_entity_id", entityId)
      .is("deleted_at", null),
  ]);
  const properties = propertyRows || [];

  if (!entity.xero_connection_id) {
    return {
      connected: false,
      budgetLines: (budgetLineRows || []).map((line: any) => ({ ...line, actual: null })),
      properties,
    };
  }

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
    return {
      connected: false,
      budgetLines: [],
      properties,
      error: `Xero API error (${res.status}): ${text || res.statusText}`,
      needsReconnect: res.status === 403,
    };
  }
  const json = await res.json();
  const transactions = (json.BankTransactions || []).map((t: any) => ({
    id: t.BankTransactionID,
    date: parseXeroDate(t.Date),
    type: t.Type === "RECEIVE" ? "income" : t.Type === "SPEND" ? "expense" : "other",
    contact: t.Contact?.Name || null,
    reference: t.Reference || t.LineItems?.[0]?.Description || null,
    total: typeof t.Total === "number" ? t.Total : Number(t.Total) || 0,
    // First line item's account code -- a bank transaction usually has one
    // line, but if it's split across several accounts this only reflects
    // the first, same simplification as `reference` above falling back to
    // LineItems[0]'s description.
    accountCode: t.LineItems?.[0]?.AccountCode || null,
  }));

  // A budget line's account code is only ever coded to one direction of
  // money movement in practice (you wouldn't code both an expense and
  // income to a "Stamp Duty" account) -- so this sums matching
  // transactions' magnitude directly, not net income-minus-expense, giving
  // a positive "actual spent"/"actual received" comparable to the line's
  // positive budgeted_amount either way.
  const budgetLines = (budgetLineRows || []).map((line: any) => ({
    ...line,
    actual: line.xero_account_code
      ? transactions
          .filter((t: any) => t.accountCode === line.xero_account_code)
          .reduce((sum: number, t: any) => sum + t.total, 0)
      : null,
  }));

  return {
    connected: true,
    tenantName: (entity as any).connection?.tenant_name ?? null,
    transactions,
    budgetLines,
    properties,
  };
}
