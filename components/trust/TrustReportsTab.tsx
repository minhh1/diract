"use client";

// Trust Account page's "Reports" tab -- reuses the existing report
// components directly (imported, not routed through the generic
// dashboard-widget system the old "Trust Account" dashboard used) so their
// logic isn't duplicated. trust_reconciliation's old three-way check is
// superseded by the Bank Reconciliation tab, not carried over here.
import type { CustomTableRecord } from "@/lib/hooks/useCustomTable";
import TrustCashBookWidget from "../dashboard/TrustCashBookWidget";
import TrustAgedBalancesWidget from "../dashboard/TrustAgedBalancesWidget";

export default function TrustReportsTab({ records }: { records: CustomTableRecord[] }) {
  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <TrustCashBookWidget records={records} />
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <TrustAgedBalancesWidget records={records} dormantDays={365} />
      </div>
    </div>
  );
}
