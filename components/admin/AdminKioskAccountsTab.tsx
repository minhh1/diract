// components/admin/AdminKioskAccountsTab.tsx
// Admin UI for creating/revoking kiosk logins -- a non-human account for a
// shared device (e.g. an iPad at a work location). Unlike every other
// account in this app, a kiosk login is never self-registered: the admin
// sets its password directly here, shown once, then hands the device to
// that login. Reads/writes go through app/api/admin/kiosk-accounts/route.ts
// (a service-role route) rather than raw supabase calls -- creating an auth
// user with a chosen password needs admin.auth.admin.createUser(), which
// only works with the service-role key and can never run in the browser.
"use client";

import { useState, useEffect } from "react";
import { Tablet, Plus, X, Copy, Check, Eye, EyeOff } from "lucide-react";

interface KioskAccount {
  id: string;
  label: string;
  created_at: string;
  profiles: { email: string | null } | null;
}

interface Props {
  companyId: string;
}

function randomPassword() {
  // Not shown to the user until generated -- 16 random chars, readable
  // enough to copy off a screen once and type into a physical device.
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export default function AdminKioskAccountsTab({ companyId }: Props) {
  const [accounts, setAccounts] = useState<KioskAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(randomPassword());
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [justCreated, setJustCreated] = useState<{ email: string; password: string; label: string } | null>(null);

  useEffect(() => { load(); }, [companyId]);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/admin/kiosk-accounts");
    const data = await res.json();
    if (res.ok) setAccounts(data.accounts || []);
    setLoading(false);
  };

  const createAccount = async () => {
    if (!label.trim() || !email.trim() || password.length < 8) return;
    setCreating(true);
    setError(null);
    const res = await fetch("/api/admin/kiosk-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: label.trim(), email: email.trim(), password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not create kiosk account");
      setCreating(false);
      return;
    }
    setJustCreated({ email: email.trim(), password, label: label.trim() });
    setLabel("");
    setEmail("");
    setPassword(randomPassword());
    setCreating(false);
    load();
  };

  const revoke = async (id: string, accountLabel: string) => {
    if (!window.confirm(`Revoke "${accountLabel}"? The device will be signed out and this login will lose all access immediately.`)) return;
    setAccounts(prev => prev.filter(a => a.id !== id));
    await fetch(`/api/admin/kiosk-accounts?id=${id}`, { method: "DELETE" });
  };

  const copyPassword = (value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-[24px] px-6 py-4">
        <p className="text-[12px] text-amber-800 leading-relaxed">
          A kiosk account is for a shared device, not a person. Once signed in, it only ever sees the calendar and staff check-in panel, nothing else in the app, even if you type another page's address directly. Use it for the iPad at a work location.
        </p>
      </div>

      {justCreated && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-[24px] px-6 py-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-bold text-emerald-800">"{justCreated.label}" created</p>
            <button onClick={() => setJustCreated(null)} className="p-1 text-emerald-400 hover:text-emerald-700">
              <X size={14} />
            </button>
          </div>
          <p className="text-[11px] text-emerald-700">
            This password is shown once. Sign in on the device now, or copy it somewhere safe first.
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1 px-3 py-2 bg-white border border-emerald-200 rounded-full text-[12px] font-mono text-slate-700">{justCreated.email}</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 px-3 py-2 bg-white border border-emerald-200 rounded-full text-[12px] font-mono text-slate-700">{justCreated.password}</div>
            <button onClick={() => copyPassword(justCreated.password)} className="p-2 bg-emerald-600 text-white rounded-full hover:bg-emerald-700 transition-colors">
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-[32px] p-6">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-4">New kiosk account</p>
        <div className="space-y-3">
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Label, e.g. Front desk iPad"
            className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none focus:border-indigo-400"
          />
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Login email, e.g. frontdesk@yourcompany.com"
            type="email"
            className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none focus:border-indigo-400"
          />
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-full">
              <input
                value={password}
                onChange={e => setPassword(e.target.value)}
                type={showPassword ? "text" : "password"}
                className="flex-1 text-[13px] font-mono outline-none"
              />
              <button onClick={() => setShowPassword(s => !s)} className="text-slate-300 hover:text-slate-600">
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <button
              onClick={() => setPassword(randomPassword())}
              className="px-3 py-2.5 text-[11px] font-bold text-slate-500 hover:text-indigo-600 whitespace-nowrap"
            >
              Regenerate
            </button>
          </div>
          {error && <p className="text-[11px] text-red-500">{error}</p>}
          <button
            onClick={createAccount}
            disabled={creating || !label.trim() || !email.trim() || password.length < 8}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 text-white text-[12px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          >
            <Plus size={13} /> Create kiosk account
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-[32px] overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Kiosk accounts</p>
        </div>
        {loading ? (
          <p className="px-6 py-5 text-[11px] text-slate-400">Loading...</p>
        ) : accounts.length === 0 ? (
          <p className="px-6 py-5 text-[11px] text-slate-300 italic">No kiosk accounts yet</p>
        ) : (
          accounts.map(account => (
            <div key={account.id} className="flex items-center gap-3 px-6 py-4 border-b border-slate-50 last:border-0">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                <Tablet size={14} className="text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-slate-800 truncate">{account.label}</p>
                <p className="text-[10px] text-slate-400 truncate">{account.profiles?.email}</p>
              </div>
              <button
                onClick={() => revoke(account.id, account.label)}
                className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                title="Revoke"
              >
                <X size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
