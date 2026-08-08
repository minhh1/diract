// components/kiosk/ChooseKioskModal.tsx
// Shown the first time an admin clicks "Enter kiosk mode" on a given
// browser/device (see Sidebar.tsx) -- lets them pick which of the
// company's already-named kiosk_accounts this device should act as.
// Deliberately never lets them type a name here: a kiosk's name always
// comes from Admin > Kiosk Accounts (AdminKioskAccountsTab.tsx), where an
// admin creates it up front -- if none exist yet, this just points there
// instead of inventing one.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Tablet, Loader2, ArrowRight } from "lucide-react";

interface KioskAccount {
  id: string;
  label: string;
}

interface Props {
  onSelect: (kioskAccountId: string) => void;
  onCancel: () => void;
}

export default function ChooseKioskModal({ onSelect, onCancel }: Props) {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<KioskAccount[]>([]);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/kiosk-accounts");
      const data = await res.json().catch(() => null);
      if (res.ok) setAccounts(data?.accounts || []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-6" onClick={onCancel}>
      <div className="bg-white rounded-[32px] p-8 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Tablet size={15} />
            </div>
            <p className="text-[14px] font-bold text-slate-900">Which kiosk is this device?</p>
          </div>
          <button onClick={onCancel} className="p-1.5 text-slate-300 hover:text-slate-500"><X size={18} /></button>
        </div>
        <p className="text-[11px] text-slate-400 mt-1 mb-4">
          Remembered on this browser from now on, so staff who check in here always check out here too.
        </p>

        {loading ? (
          <div className="flex justify-center py-6"><Loader2 size={16} className="animate-spin text-slate-300" /></div>
        ) : accounts.length === 0 ? (
          <div className="text-center py-2">
            <p className="text-[12px] text-slate-500 mb-4">No kiosks set up yet -- create one first, with whatever name you'd like, then come back here.</p>
            <Link
              href="/dashboard/admin?tab=kioskAccounts"
              onClick={onCancel}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-full text-[11px] font-bold hover:bg-slate-800 transition-all"
            >
              Go to Kiosk Accounts <ArrowRight size={13} />
            </Link>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {accounts.map(a => (
              <button
                key={a.id}
                onClick={() => onSelect(a.id)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors text-left"
              >
                <Tablet size={14} className="text-indigo-500 shrink-0" />
                <span className="text-[13px] font-bold text-slate-700">{a.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
