// components/kiosk/EnterKioskDeviceModal.tsx
// Shown once per browser/device, the first time an admin clicks "Enter
// kiosk mode" (see Sidebar.tsx) -- names this physical device and silently
// creates a real kiosk_accounts login for it. The admin never sees or
// needs its password; they stay signed in as themselves the whole time
// (see lib/hooks/useKioskView.ts) -- this just gives a company with
// several kiosks (front desk, warehouse, ...) a distinct, consistent
// identity per device for staff_checkins.checked_in_by, instead of every
// admin-previewed device collapsing into "the admin" and letting someone
// get checked out from a kiosk they never physically walked up to. The
// created id is remembered in this browser's localStorage
// (kioskDeviceStorageKey) so this prompt only ever happens once per
// device per company.
"use client";

import { useState } from "react";
import { X, Tablet, Loader2 } from "lucide-react";

interface Props {
  onCreated: (kioskAccountId: string) => void;
  onCancel: () => void;
}

export function kioskDeviceStorageKey(companyId: string): string {
  return `diract-kiosk-device:${companyId}`;
}

function randomKioskSecret(length: number): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export default function EnterKioskDeviceModal({ onCreated, onCancel }: Props) {
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    const trimmed = label.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    setError(null);
    const email = `kiosk-${randomKioskSecret(10).toLowerCase()}@kiosk.internal`;
    const password = randomKioskSecret(20);
    const res = await fetch("/api/admin/kiosk-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: trimmed, email, password }),
    });
    const data = await res.json().catch(() => null);
    setCreating(false);
    if (!res.ok || !data?.account?.id) { setError(data?.error || "Could not set up this kiosk"); return; }
    onCreated(data.account.id as string);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-6" onClick={onCancel}>
      <div className="bg-white rounded-[32px] p-8 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Tablet size={15} />
            </div>
            <p className="text-[14px] font-bold text-slate-900">Name this kiosk</p>
          </div>
          <button onClick={onCancel} className="p-1.5 text-slate-300 hover:text-slate-500"><X size={18} /></button>
        </div>
        <p className="text-[11px] text-slate-400 mt-1 mb-4">
          This only appears once per device -- it&apos;s remembered on this browser from now on, so staff who check in here always check out here too, even if you set up several kiosks.
        </p>
        <input
          autoFocus
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") create(); }}
          placeholder="e.g. Front desk"
          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-[14px] text-slate-900 focus:outline-none focus:border-indigo-500 transition-all"
        />
        {error && <p className="mt-2 text-[12px] text-red-500">{error}</p>}
        <button
          onClick={create}
          disabled={creating || !label.trim()}
          className="mt-4 w-full flex items-center justify-center gap-2 px-5 py-3 bg-slate-900 text-white rounded-2xl text-[12px] font-bold hover:bg-slate-800 transition-all disabled:opacity-40 disabled:cursor-default"
        >
          {creating ? <Loader2 size={14} className="animate-spin" /> : "Enter kiosk mode"}
        </button>
      </div>
    </div>
  );
}
