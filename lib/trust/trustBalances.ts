// Per-matter trust ledger balance aggregation -- shared by
// components/dashboard/TrustAgedBalancesWidget.tsx (dormant balances list)
// and components/dashboard/quickGlance/LawFirmQuickGlance.tsx (Quick
// Glance's Trust Balance/Dormant Trust/Matters with Trust stat cards), so
// both read the exact same running-balance-per-matter logic off a Trust
// Transactions table's records rather than two implementations drifting.
import type { CustomTableRecord } from "@/lib/hooks/useCustomTable";

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
