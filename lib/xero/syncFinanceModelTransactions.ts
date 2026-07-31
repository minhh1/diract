// lib/xero/syncFinanceModelTransactions.ts
// The explicit "Sync from Xero" action for the Transactions subtab --
// unlike the old entity-scoped Finance Model, this is never called
// automatically on page load. Xero is one optional way to populate the
// Transactions custom table alongside manual entry; a future accounting-
// software integration would plug in the same way (write rows into the
// same table), it just wouldn't live in this file.
import { xeroApiFetch } from "@/lib/xero/client";
import { resolveProjectXeroConnection, BUDGET_LINES_SLUG, TRANSACTIONS_SLUG } from "@/lib/financeModel/data";
import { getCustomTable, listCustomTableRows, createCustomTableRow } from "@/lib/customTableAdmin";

function parseXeroDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/\/Date\((-?\d+)/);
  if (match) return new Date(Number(match[1])).toISOString().slice(0, 10);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export interface SyncResult {
  imported: number;
  skipped: number;
  connected: boolean;
  error?: string;
  needsReconnect?: boolean;
}

export async function syncFinanceModelTransactions(admin: any, companyId: string, projectId: string): Promise<SyncResult> {
  const xero = await resolveProjectXeroConnection(admin, projectId);
  if (!xero) return { imported: 0, skipped: 0, connected: false, error: "This project isn't linked to a Xero organisation." };

  const res = await xeroApiFetch(xero.connectionId, admin, `/BankTransactions?order=Date DESC&where=${encodeURIComponent('Status=="AUTHORISED"')}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      imported: 0, skipped: 0, connected: false,
      error: `Xero API error (${res.status}): ${text || res.statusText}`,
      needsReconnect: res.status === 401 || res.status === 403,
    };
  }
  const json = await res.json();
  const xeroTransactions = (json.BankTransactions || []).map((t: any) => ({
    id: t.BankTransactionID as string,
    date: parseXeroDate(t.Date),
    type: t.Type === "RECEIVE" ? "Income" : t.Type === "SPEND" ? "Expense" : null,
    contact: t.Contact?.Name || null,
    reference: t.Reference || t.LineItems?.[0]?.Description || null,
    amount: typeof t.Total === "number" ? t.Total : Number(t.Total) || 0,
    accountCode: t.LineItems?.[0]?.AccountCode || null,
  }));

  const [budgetTable, txTable] = await Promise.all([
    getCustomTable(admin, companyId, BUDGET_LINES_SLUG),
    getCustomTable(admin, companyId, TRANSACTIONS_SLUG),
  ]);
  if (!budgetTable || !txTable) return { imported: 0, skipped: 0, connected: true, error: "Finance Model tables are not provisioned for this company." };

  const [budgetRows, existingTx] = await Promise.all([
    listCustomTableRows(admin, budgetTable, "project", projectId),
    listCustomTableRows(admin, txTable, "project", projectId),
  ]);
  const budgetLineByAccountCode = new Map<string, string>();
  for (const line of budgetRows) if (line.xero_account_code) budgetLineByAccountCode.set(line.xero_account_code, line.id);
  const alreadyImported = new Set(existingTx.map((t: any) => t.xero_transaction_id).filter(Boolean));

  let imported = 0;
  let skipped = 0;
  for (const tx of xeroTransactions) {
    if (alreadyImported.has(tx.id)) { skipped++; continue; }
    await createCustomTableRow(admin, txTable, null, {
      project: projectId,
      date: tx.date,
      type: tx.type,
      contact: tx.contact,
      reference: tx.reference,
      amount: tx.amount,
      budget_line: tx.accountCode ? budgetLineByAccountCode.get(tx.accountCode) || null : null,
      source: "Xero",
      xero_transaction_id: tx.id,
    });
    imported++;
  }

  return { imported, skipped, connected: true };
}
