// lib/xero/syncFinanceModelTransactions.ts
// The explicit "Sync from Xero" action for the Transactions subtab --
// unlike the old entity-scoped Finance Model, this is never called
// automatically on page load. Xero is one optional way to populate the
// Transactions custom table alongside manual entry; a future accounting-
// software integration would plug in the same way (write rows into the
// same table), it just wouldn't live in this file.
import { xeroApiFetch } from "@/lib/xero/client";
import { resolveProjectXeroConnection, BUDGET_LINES_SLUG, TRANSACTIONS_SLUG } from "@/lib/financeModel/data";
import { getCustomTable, listCustomTableRows, createCustomTableRow, updateCustomTableRow } from "@/lib/customTableAdmin";

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
  // Already-imported rows whose Description/budget line this run filled in
  // (see backfill below), and how many still need it -- a non-zero
  // `backfillRemaining` means "run the sync again to continue".
  backfilled: number;
  backfillRemaining: number;
  error?: string;
  needsReconnect?: boolean;
}

// Xero allows 60 API calls per minute per tenant. Each enrichment is one
// call, so a run is capped below that ceiling rather than firing hundreds
// back-to-back and collecting 429s. New imports spend this budget first;
// whatever's left goes to backfilling older rows, so a large backlog
// drains over several runs instead of failing as one long request.
const MAX_DETAIL_FETCHES = 45;

interface TransactionDetail {
  description: string | null;
  accountCode: string | null;
}

// Xero's LIST BankTransactions endpoint always returns LineItems as an
// empty array regardless of what's actually on the transaction (verified
// against this company's own org: 138/138 list rows came back with
// `LineItems: []`, while GET /BankTransactions/{id} on the same rows
// returns the real line items). Description and AccountCode therefore
// require a per-transaction fetch. Returns null on any failure so one bad
// transaction never fails the whole sync; `rateLimited` stops the caller
// from burning the rest of the budget once Xero starts refusing.
async function fetchTransactionDetail(
  admin: any, connectionId: string, transactionId: string
): Promise<{ detail: TransactionDetail | null; rateLimited: boolean }> {
  try {
    const res = await xeroApiFetch(connectionId, admin, `/BankTransactions/${transactionId}`);
    if (res.status === 429) return { detail: null, rateLimited: true };
    if (!res.ok) return { detail: null, rateLimited: false };
    const json = await res.json();
    const lineItems = json.BankTransactions?.[0]?.LineItems || [];
    // A split transaction has several line items; join their descriptions
    // rather than silently showing only the first one's.
    const descriptions = lineItems.map((li: any) => li?.Description).filter(Boolean);
    return {
      detail: {
        description: descriptions.length ? descriptions.join(" / ") : null,
        accountCode: lineItems[0]?.AccountCode || null,
      },
      rateLimited: false,
    };
  } catch {
    return { detail: null, rateLimited: false };
  }
}

export async function syncFinanceModelTransactions(admin: any, companyId: string, projectId: string): Promise<SyncResult> {
  const xero = await resolveProjectXeroConnection(admin, projectId);
  if (!xero) return { imported: 0, skipped: 0, backfilled: 0, backfillRemaining: 0, connected: false, error: "This project isn't linked to a Xero organisation." };

  // xeroApiFetch/refreshAccessToken throw plain Errors on a broken
  // connection (missing row, or a refresh_token that no longer belongs to
  // the currently-configured Xero app -- confirmed possible this session,
  // rotating XERO_CLIENT_ID/SECRET invalidates every previously-issued
  // refresh_token) -- caught here so this function always resolves to a
  // SyncResult as its signature promises, never rejects, since an
  // unhandled rejection surfaces to the API route as a bodyless 500 that
  // breaks the client's res.json() parse.
  let res: Response;
  try {
    res = await xeroApiFetch(xero.connectionId, admin, `/BankTransactions?order=Date DESC&where=${encodeURIComponent('Status=="AUTHORISED"')}`);
  } catch (err) {
    return {
      imported: 0, skipped: 0, backfilled: 0, backfillRemaining: 0, connected: false,
      error: err instanceof Error ? err.message : "Failed to reach Xero",
      needsReconnect: true,
    };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      imported: 0, skipped: 0, backfilled: 0, backfillRemaining: 0, connected: false,
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
    contactId: t.Contact?.ContactID || null,
    // Reference is a genuine top-level Xero field, but Xero OMITS the key
    // entirely when the transaction has none -- which is the norm for
    // bank-feed transactions (0 of this company's 138 carry one). A blank
    // Reference column is therefore usually real missing data at the
    // source, not a sync bug; Description below is where the bank
    // narration actually lives.
    reference: t.Reference || null,
    description: null as string | null,
    amount: typeof t.Total === "number" ? t.Total : Number(t.Total) || 0,
    accountCode: null as string | null,
  }));

  const [budgetTable, txTable] = await Promise.all([
    getCustomTable(admin, companyId, BUDGET_LINES_SLUG),
    getCustomTable(admin, companyId, TRANSACTIONS_SLUG),
  ]);
  if (!budgetTable || !txTable) return { imported: 0, skipped: 0, backfilled: 0, backfillRemaining: 0, connected: true, error: "Finance Model tables are not provisioned for this company." };

  const [budgetRows, existingTx] = await Promise.all([
    listCustomTableRows(admin, budgetTable, "project", projectId),
    listCustomTableRows(admin, txTable, "project", projectId),
  ]);
  const budgetLineByAccountCode = new Map<string, string>();
  for (const line of budgetRows) if (line.xero_account_code) budgetLineByAccountCode.set(line.xero_account_code, line.id);
  const alreadyImported = new Set(existingTx.map((t: any) => t.xero_transaction_id).filter(Boolean));

  const newTransactions = xeroTransactions.filter((tx: any) => !alreadyImported.has(tx.id));

  let budget = MAX_DETAIL_FETCHES;
  let rateLimited = false;

  // 1. Enrich the rows about to be imported (they'd otherwise land blank).
  for (const tx of newTransactions) {
    if (budget <= 0 || rateLimited) break;
    budget--;
    const { detail, rateLimited: limited } = await fetchTransactionDetail(admin, xero.connectionId, tx.id);
    if (limited) { rateLimited = true; break; }
    if (detail) {
      tx.description = detail.description;
      tx.accountCode = detail.accountCode;
    }
  }

  let imported = 0;
  const skipped = xeroTransactions.length - newTransactions.length;
  for (const tx of newTransactions) {
    await createCustomTableRow(admin, txTable, null, {
      project: projectId,
      date: tx.date,
      type: tx.type,
      contact: tx.contact,
      contact_id: tx.contactId,
      reference: tx.reference,
      description: tx.description,
      amount: tx.amount,
      budget_line: tx.accountCode ? budgetLineByAccountCode.get(tx.accountCode) || null : null,
      source: "Xero",
      xero_transaction_id: tx.id,
    });
    imported++;
  }

  // 2. Backfill rows imported BEFORE the detail-fetch step existed. They
  //    kept a NULL Description (and an unlinked budget line) forever,
  //    because a re-sync skips anything already imported -- so without
  //    this pass there is no path by which they ever get filled in.
  //    Restricted to rows that came from Xero and still have no
  //    description, so it's a no-op once the backlog is drained and never
  //    touches a description someone typed by hand.
  const needsBackfill = existingTx.filter((row: any) =>
    row.xero_transaction_id && !(row.description && String(row.description).trim())
  );

  let backfilled = 0;
  let attempted = 0;
  for (const row of needsBackfill) {
    if (budget <= 0 || rateLimited) break;
    budget--;
    attempted++;
    const { detail, rateLimited: limited } = await fetchTransactionDetail(admin, xero.connectionId, row.xero_transaction_id);
    if (limited) { rateLimited = true; break; }
    if (!detail?.description && !detail?.accountCode) continue;

    const updates: Record<string, any> = {};
    if (detail.description) updates.description = detail.description;
    // Only fill an EMPTY budget line -- a manual classification (or one
    // applied by a rule) outranks Xero's account code.
    if (detail.accountCode && !row.budget_line) {
      const budgetLineId = budgetLineByAccountCode.get(detail.accountCode);
      if (budgetLineId) updates.budget_line = budgetLineId;
    }
    if (!Object.keys(updates).length) continue;

    await updateCustomTableRow(admin, txTable, row.id, updates);
    backfilled++;
  }

  return {
    imported, skipped, backfilled,
    // Rows this run never got to, NOT rows that came back still blank --
    // some transactions genuinely have no line-item Description in Xero,
    // and counting those as "remaining" would tell the user to keep
    // clicking Sync forever on something no amount of syncing can fill.
    backfillRemaining: Math.max(0, needsBackfill.length - attempted),
    connected: true,
  };
}
