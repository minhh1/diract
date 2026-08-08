// Verbatim port of lib/trust/trustBalances.ts on the web app -- pure logic,
// zero React/Next.js deps, kept byte-for-byte identical (aside from the
// type import) on purpose: this is compliance-relevant trust-account math,
// so mobile and web must always compute the exact same per-matter balance,
// never two independently-maintained implementations that could drift.
import type { CustomTableRecord } from '../dashboardWidgets/customTableTypes';

export interface MatterBalance {
  matterId: string;
  balance: number;
  lastDate: string; // '' if the matter has no dated transactions
}

export function computeTrustBalancesByMatter(records: CustomTableRecord[]): MatterBalance[] {
  const byMatter = new Map<string, { balance: number; lastDate: string }>();
  for (const r of records) {
    const matterId = String(r.values.matter || '');
    if (!matterId) continue;
    const date = String(r.values.date || '').slice(0, 10);
    const inAmt = Number(r.values.amount_in) || 0;
    const outAmt = Number(r.values.amount_out) || 0;
    const entry = byMatter.get(matterId) || { balance: 0, lastDate: '' };
    entry.balance += inAmt - outAmt;
    if (date > entry.lastDate) entry.lastDate = date;
    byMatter.set(matterId, entry);
  }
  return [...byMatter.entries()].map(([matterId, v]) => ({ matterId, balance: v.balance, lastDate: v.lastDate }));
}
