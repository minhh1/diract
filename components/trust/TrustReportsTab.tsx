"use client";

// Trust Account page's "Reports" tab -- reuses the existing report
// components directly (imported, not routed through the generic
// dashboard-widget system the old "Trust Account" dashboard used) so their
// logic isn't duplicated. trust_reconciliation's old three-way check is
// superseded by the Bank Reconciliation tab, not carried over here.
import type { CustomTableRecord } from "@/lib/hooks/useCustomTable";
import TrustReceiptsCashBookWidget from "../dashboard/TrustReceiptsCashBookWidget";
import TrustPaymentsCashBookWidget from "../dashboard/TrustPaymentsCashBookWidget";
import TrustJournalTransfersWidget from "../dashboard/TrustJournalTransfersWidget";
import TrustAgedBalancesWidget from "../dashboard/TrustAgedBalancesWidget";
import TrustLiveBalancesWidget from "../dashboard/TrustLiveBalancesWidget";
import TrustTrialBalanceWidget from "../dashboard/TrustTrialBalanceWidget";
import TrustOverdrawnWidget from "../dashboard/TrustOverdrawnWidget";

export default function TrustReportsTab({ records, trustAccountName }: { records: CustomTableRecord[]; trustAccountName?: string }) {
  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <TrustReceiptsCashBookWidget records={records} trustAccountName={trustAccountName} />
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <TrustPaymentsCashBookWidget records={records} trustAccountName={trustAccountName} />
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <TrustJournalTransfersWidget records={records} trustAccountName={trustAccountName} />
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <TrustTrialBalanceWidget records={records} trustAccountName={trustAccountName} />
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <TrustOverdrawnWidget records={records} trustAccountName={trustAccountName} />
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <TrustAgedBalancesWidget records={records} dormantDays={365} trustAccountName={trustAccountName} />
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <TrustLiveBalancesWidget records={records} trustAccountName={trustAccountName} />
      </div>
    </div>
  );
}
