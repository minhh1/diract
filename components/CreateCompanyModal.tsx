"use client";

// Lets an already-signed-in user open a brand new company/organisation from
// inside the app, rather than only ever being able to join one via an
// invite link or create their first one at signup. Reuses
// register_company_and_profile -- the exact same RPC app/(marketing)/login/page.tsx's
// "create new company" registration path calls -- since a second company
// for an existing user needs the identical rows (companies, profiles,
// company_memberships), just with an id that already has a session instead
// of one signUp() just minted. See supabase/migrations/20260806110000_register_company_auth_check.sql
// for why that RPC now checks auth.uid() = p_user_id: it didn't before, and
// blindly reusing it here (or from anywhere client-side) would have let any
// signed-in user pass an arbitrary p_user_id and overwrite someone else's
// profile.
import { useState } from "react";
import { X, Loader2, Building2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { isValidABN, isValidACN } from "@/lib/validation/entityValidation";
import { ensureStaffEntity } from "@/lib/services/staffEntityService";
import { clearActiveIdentityCache } from "@/lib/clearClientCaches";

interface Props {
  userId: string;
  currentFullName: string | null;
  onClose: () => void;
}

export default function CreateCompanyModal({ userId, currentFullName, onClose }: Props) {
  const [companyName, setCompanyName] = useState('');
  const [abn, setAbn] = useState('');
  const [acn, setAcn] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setError(null);
    if (!companyName.trim()) { setError('Company name is required.'); return; }
    if (abn.trim() && !isValidABN(abn.trim())) { setError('ABN is not valid.'); return; }
    if (acn.trim() && !isValidACN(acn.trim())) { setError('ACN is not valid.'); return; }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('Your session has expired -- please sign in again.'); setSaving(false); return; }

    const { data: result, error: rpcError } = await supabase.rpc('register_company_and_profile', {
      p_user_id: userId,
      p_full_name: currentFullName || user.email?.split('@')[0] || 'User',
      p_email: user.email,
      p_company_name: companyName.trim(),
      p_abn: abn.trim() || null,
      p_acn: acn.trim() || null,
    });

    if (rpcError) { setError(rpcError.message); setSaving(false); return; }
    if (result && !result.success) { setError(result.error || 'Could not create the company.'); setSaving(false); return; }

    await ensureStaffEntity(supabase, result.company_id, userId);

    // The RPC already set profiles.active_company_id to the new company --
    // this is really just "switch into what was just created", same cache
    // invalidation + hard redirect as Sidebar.tsx's own handleSwitchCompany
    // (a full reload rather than a client nav so every companyId-scoped
    // hook/query remounts against the new company instead of serving stale
    // cached data for the old one).
    const { invalidateSchemaCache, clearCompanyIdCache } = await import('@/lib/services/schemaService');
    invalidateSchemaCache();
    clearCompanyIdCache();
    clearActiveIdentityCache();
    window.location.replace('/dashboard/quick-glance');
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-6">
      <div className="bg-white w-full max-w-sm rounded-[32px] shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-slate-900 flex items-center justify-center shrink-0">
              <Building2 size={15} className="text-white" />
            </div>
            <h3 className="text-[15px] font-bold text-slate-800">Create new company</h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-300 hover:text-black"><X size={16} /></button>
        </div>

        <p className="text-[11px] text-slate-400">
          Sets up a brand new, separate workspace. You'll be its admin, and can switch back to your other companies anytime.
        </p>

        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Company name</label>
          <input value={companyName} onChange={e => setCompanyName(e.target.value)} autoFocus
            className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none" placeholder="e.g. Acme Legal Pty Ltd" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">ABN</label>
            <input value={abn} onChange={e => setAbn(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none" placeholder="Optional" />
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">ACN</label>
            <input value={acn} onChange={e => setAcn(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none" placeholder="Optional" />
          </div>
        </div>

        {error && <p className="text-[11px] text-rose-600 font-medium">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-3 bg-slate-50 text-slate-600 rounded-full text-[11px] font-bold hover:bg-slate-100 transition-all">Cancel</button>
          <button onClick={handleCreate} disabled={saving} className="flex-1 py-3 bg-slate-900 text-white rounded-full text-[11px] font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin" />} Create
          </button>
        </div>
      </div>
    </div>
  );
}
