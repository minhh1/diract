// app/dashboard/admin/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  Loader2, ArrowLeft, Building2, Users, Settings,
  Shield, Trash2, CheckCircle2, XCircle, Plus, X,
  Copy, Link, Clock, ChevronDown, ChevronUp
} from "lucide-react";

interface Member {
  id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
  is_admin: boolean;
}

interface Company {
  id: string;
  name: string;
  abn: string | null;
  acn: string | null;
  status: string;
  created_at: string;
}

interface Token {
  id: string;
  token: string;
  note: string | null;
  created_at: string;
  expires_at: string | null;
  used_at: string | null;
}

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [company, setCompany] = useState<Company | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [activeTab, setActiveTab] = useState<'members' | 'company' | 'invites'>('members');
  const [saving, setSaving] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Company edit
  const [companyName, setCompanyName] = useState('');
  const [companyAbn, setCompanyAbn] = useState('');
  const [companyAcn, setCompanyAcn] = useState('');
  const [savingCompany, setSavingCompany] = useState(false);

  // Token generation
  const [newTokenNote, setNewTokenNote] = useState('');
  const [generatingToken, setGeneratingToken] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/login'); return; }

    const { data: isAdmin } = await supabase.rpc('is_current_user_admin');
    if (!isAdmin) { setUnauthorized(true); setLoading(false); return; }

    const { data: profile } = await supabase
      .from('profiles')
      .select('active_company_id')
      .eq('id', user.id)
      .single();

    if (!profile?.active_company_id) {
      setUnauthorized(true);
      setLoading(false);
      return;
    }

    const [{ data: comp }, { data: memberData }, { data: tokenData }] = await Promise.all([
      supabase.from('companies').select('*').eq('id', profile.active_company_id).single(),
      supabase.from('profiles').select('id, full_name, email, role, is_active, is_admin').eq('active_company_id', profile.active_company_id),
      supabase.from('registration_tokens').select('*').eq('created_by', user.id).order('created_at', { ascending: false }),
    ]);

    if (comp) {
      setCompany(comp);
      setCompanyName(comp.name);
      setCompanyAbn(comp.abn || '');
      setCompanyAcn(comp.acn || '');
    }
    setMembers(memberData || []);
    setTokens(tokenData || []);
    setLoading(false);
  };

  const handleToggleAdmin = async (member: Member) => {
    setSaving(member.id);
    await supabase.from('profiles').update({ is_admin: !member.is_admin }).eq('id', member.id);
    setMembers(prev => prev.map(m => m.id === member.id ? { ...m, is_admin: !m.is_admin } : m));
    setSaving(null);
  };

  const handleToggleActive = async (member: Member) => {
    setSaving(member.id);
    await supabase.from('profiles').update({ is_active: !member.is_active }).eq('id', member.id);
    setMembers(prev => prev.map(m => m.id === member.id ? { ...m, is_active: !m.is_active } : m));
    setSaving(null);
  };

  const handleRemoveMember = async (member: Member) => {
    if (!window.confirm(`Remove ${member.full_name || member.email} from this company?`)) return;
    setSaving(member.id);
    await supabase.from('company_memberships').delete()
      .eq('user_id', member.id).eq('company_id', company!.id);
    setMembers(prev => prev.filter(m => m.id !== member.id));
    setSaving(null);
  };

  const handleSaveCompany = async () => {
    if (!company) return;
    setSavingCompany(true);
    await supabase.from('companies').update({
      name: companyName,
      abn: companyAbn || null,
      acn: companyAcn || null,
    }).eq('id', company.id);
    setCompany(prev => prev ? { ...prev, name: companyName } : prev);
    setSavingCompany(false);
  };

  const handleGenerateToken = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setGeneratingToken(true);
    const { data } = await supabase
      .from('registration_tokens')
      .insert({
        created_by: user.id,
        note: newTokenNote.trim() || null,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();
    setNewTokenNote('');
    setGeneratingToken(false);
    if (data) setTokens(prev => [data, ...prev]);
  };

  const handleRevokeToken = async (tokenId: string) => {
    await supabase.from('registration_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', tokenId);
    setTokens(prev => prev.map(t =>
      t.id === tokenId ? { ...t, used_at: new Date().toISOString() } : t
    ));
  };

  const getRegistrationLink = (token: string) =>
    `${window.location.origin}/login?token=${token}`;

  const handleCopy = (token: string) => {
    navigator.clipboard.writeText(getRegistrationLink(token));
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 className="animate-spin text-slate-300" size={24} />
    </div>
  );

  if (unauthorized) return (
    <div className="flex flex-col items-center justify-center h-screen gap-3">
      <Shield size={32} className="text-slate-200" />
      <p className="text-slate-400 font-bold text-[11px] uppercase tracking-widest">
        Admin access required
      </p>
      <button onClick={() => router.back()} className="text-[11px] text-indigo-600 font-bold hover:underline">
        Go back
      </button>
    </div>
  );

  const tabs = [
    { id: 'members', label: 'Members', icon: Users },
    { id: 'invites', label: 'Invite links', icon: Link },
    { id: 'company', label: 'Company', icon: Settings },
  ];

  return (
    <div className="flex flex-col h-screen bg-[#F9FAFB] font-sans antialiased text-slate-600">
      <header className="bg-white border-b border-slate-100 p-8 shrink-0">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase hover:text-black mb-6 transition-all tracking-widest"
        >
          <ArrowLeft size={14} /> Back
        </button>

        <div className="flex items-center gap-4 mb-6">
          <div className="h-12 w-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
            {company?.name?.substring(0, 1).toUpperCase()}
          </div>
          <div>
            <h1 className="text-3xl font-light uppercase tracking-tight text-slate-900">
              {company?.name}
            </h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
              Company administration · {members.length} member{members.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div className="flex gap-1 bg-slate-100 p-1 rounded-full w-fit border border-slate-200">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-5 py-2 rounded-full text-[11px] font-medium transition-all ${
                activeTab === tab.id ? 'bg-white text-black shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <tab.icon size={13} /> {tab.label}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-3xl mx-auto space-y-4">

          {/* ── Members ── */}
          {activeTab === 'members' && (
            members.length === 0 ? (
              <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest py-20">
                No members yet
              </p>
            ) : (
              members.map(member => {
                const isSaving = saving === member.id;
                return (
                  <div
                    key={member.id}
                    className={`bg-white border border-slate-200 rounded-[28px] p-5 flex items-center gap-4 transition-opacity ${!member.is_active ? 'opacity-50' : ''}`}
                  >
                    <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-[11px] font-bold text-indigo-600 uppercase shrink-0">
                      {member.full_name?.substring(0, 2) || '??'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-slate-800 truncate">
                        {member.full_name || '—'}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">{member.email}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[9px] font-bold uppercase">
                          {member.role?.replace('_', ' ')}
                        </span>
                        {member.is_admin && (
                          <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full text-[9px] font-bold uppercase">
                            Admin
                          </span>
                        )}
                        {!member.is_active && (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-400 rounded-full text-[9px] font-bold uppercase">
                            Inactive
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isSaving ? (
                        <Loader2 size={16} className="animate-spin text-slate-300" />
                      ) : (
                        <>
                          <button
                            onClick={() => handleToggleAdmin(member)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold transition-all ${
                              member.is_admin
                                ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                                : 'bg-slate-50 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600'
                            }`}
                          >
                            <Shield size={11} />
                            {member.is_admin ? 'Admin' : 'Make admin'}
                          </button>
                          <button
                            onClick={() => handleToggleActive(member)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold transition-all ${
                              member.is_active
                                ? 'bg-slate-50 text-slate-500 hover:bg-amber-50 hover:text-amber-600'
                                : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                            }`}
                          >
                            {member.is_active ? <XCircle size={11} /> : <CheckCircle2 size={11} />}
                            {member.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            onClick={() => handleRemoveMember(member)}
                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )
          )}

          {/* ── Invite links ── */}
          {activeTab === 'invites' && (
            <>
              {/* Generate new token */}
              <div className="bg-white border border-slate-200 rounded-[32px] p-6">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">
                  Generate invitation link
                </p>
                <p className="text-[12px] text-slate-500 mb-4">
                  Share this link with a new team member. Each link can only be used once and expires in 7 days.
                </p>
                <div className="flex gap-3">
                  <input
                    value={newTokenNote}
                    onChange={e => setNewTokenNote(e.target.value)}
                    placeholder="Note e.g. 'For John Smith onboarding'"
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-full px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
                    onKeyDown={e => { if (e.key === 'Enter') handleGenerateToken(); }}
                  />
                  <button
                    onClick={handleGenerateToken}
                    disabled={generatingToken}
                    className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-full text-[11px] font-bold disabled:opacity-50 shrink-0"
                  >
                    {generatingToken ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                    Generate
                  </button>
                </div>
              </div>

              {/* Token list */}
              {tokens.length === 0 ? (
                <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest py-10">
                  No invitation links generated yet
                </p>
              ) : (
                tokens.map(token => {
                  const isUsed = !!token.used_at;
                  const isExpired = token.expires_at
                    ? new Date(token.expires_at) < new Date()
                    : false;
                  const isActive = !isUsed && !isExpired;
                  const link = getRegistrationLink(token.token);

                  return (
                    <div
                      key={token.id}
                      className={`bg-white border rounded-[28px] p-5 flex items-start gap-4 ${
                        isActive ? 'border-emerald-100' : 'border-slate-100 opacity-60'
                      }`}
                    >
                      <div className={`p-2.5 rounded-2xl shrink-0 ${isActive ? 'bg-emerald-50' : 'bg-slate-50'}`}>
                        <Link size={16} className={isActive ? 'text-emerald-600' : 'text-slate-400'} />
                      </div>

                      <div className="flex-1 min-w-0">
                        {token.note && (
                          <p className="text-[13px] font-bold text-slate-700 mb-1">{token.note}</p>
                        )}
                        <p className="text-[10px] font-mono text-slate-400 truncate">{link}</p>
                        <div className="flex items-center gap-3 mt-2">
                          {isUsed ? (
                            <span className="flex items-center gap-1 text-[9px] font-bold uppercase text-slate-400">
                              <CheckCircle2 size={10} /> Used
                            </span>
                          ) : isExpired ? (
                            <span className="flex items-center gap-1 text-[9px] font-bold uppercase text-red-400">
                              <Clock size={10} /> Expired
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[9px] font-bold uppercase text-emerald-600">
                              <CheckCircle2 size={10} />
                              Expires {token.expires_at
                                ? new Date(token.expires_at).toLocaleDateString('en-AU')
                                : 'never'}
                            </span>
                          )}
                          <span className="text-[9px] text-slate-300">
                            Created {new Date(token.created_at).toLocaleDateString('en-AU')}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isActive && (
                          <button
                            onClick={() => handleCopy(token.token)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold transition-all ${
                              copied === token.token
                                ? 'bg-emerald-50 text-emerald-600'
                                : 'bg-slate-50 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'
                            }`}
                          >
                            {copied === token.token ? <CheckCircle2 size={11} /> : <Copy size={11} />}
                            {copied === token.token ? 'Copied!' : 'Copy link'}
                          </button>
                        )}
                        {isActive && (
                          <button
                            onClick={() => handleRevokeToken(token.id)}
                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                            title="Revoke this link"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}

          {/* ── Company settings ── */}
          {activeTab === 'company' && (
            <div className="bg-white border border-slate-200 rounded-[40px] p-8 space-y-5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Company details
              </p>

              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                  Company name
                </label>
                <input
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                    ABN
                  </label>
                  <input
                    value={companyAbn}
                    onChange={e => setCompanyAbn(e.target.value)}
                    placeholder="Optional"
                    className="w-full bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-100"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                    ACN
                  </label>
                  <input
                    value={companyAcn}
                    onChange={e => setCompanyAcn(e.target.value)}
                    placeholder="Optional"
                    className="w-full bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-100"
                  />
                </div>
              </div>

              <button
                onClick={handleSaveCompany}
                disabled={savingCompany}
                className="w-full py-3.5 bg-slate-900 text-white rounded-full text-[11px] font-bold uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingCompany ? <Loader2 size={14} className="animate-spin" /> : 'Save changes'}
              </button>

              <div className="pt-4 border-t border-slate-100">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                  Company ID
                </p>
                <p className="text-[11px] font-mono text-slate-400 select-all">{company?.id}</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}