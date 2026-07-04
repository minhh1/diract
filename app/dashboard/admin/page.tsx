"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { CheckCircle2, XCircle, Clock, Loader2, ArrowLeft, Building2 } from "lucide-react";

interface Company {
  id: string;
  name: string;
  abn: string | null;
  acn: string | null;
  status: 'pending' | 'active' | 'suspended';
  created_at: string;
  admin_notes: string | null;
  approved_at: string | null;
  members?: { full_name: string; email: string; role: string }[];
}

const STATUS_STYLES = {
  pending: 'bg-amber-50 text-amber-600 border-amber-100',
  active: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  suspended: 'bg-red-50 text-red-500 border-red-100',
};

export default function AdminPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    checkAdminAndLoad();
  }, []);

  const checkAdminAndLoad = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/'); return; }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_admin) { setUnauthorized(true); setLoading(false); return; }

    const { data } = await supabase
      .from('companies')
      .select(`
        *,
        members:profiles(full_name, email, role)
      `)
      .order('created_at', { ascending: false });

    setCompanies(data || []);
    setLoading(false);
  };

  const handleUpdateStatus = async (company: Company, status: 'active' | 'suspended' | 'pending') => {
    setSaving(company.id);
    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from('companies').update({
      status,
      admin_notes: notes[company.id] ?? company.admin_notes,
      approved_at: status === 'active' ? new Date().toISOString() : null,
      approved_by: status === 'active' ? user?.id : null,
    }).eq('id', company.id);

    setCompanies(prev => prev.map(c =>
      c.id === company.id ? { ...c, status, admin_notes: notes[company.id] ?? c.admin_notes } : c
    ));
    setSaving(null);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 className="animate-spin text-slate-300" size={24} />
    </div>
  );

  if (unauthorized) return (
    <div className="flex items-center justify-center h-screen">
      <p className="text-slate-400 font-bold text-[11px] uppercase tracking-widest">Not authorized</p>
    </div>
  );

  const counts = {
    pending: companies.filter(c => c.status === 'pending').length,
    active: companies.filter(c => c.status === 'active').length,
    suspended: companies.filter(c => c.status === 'suspended').length,
  };

  return (
    <div className="flex flex-col h-screen bg-[#F9FAFB] font-sans antialiased text-slate-600">
      <header className="bg-white border-b border-slate-100 p-8 shrink-0 flex items-center gap-6">
        <button onClick={() => router.back()} className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-3xl font-light uppercase tracking-tight text-slate-900">Company Admin</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
            {counts.pending} pending · {counts.active} active · {counts.suspended} suspended
          </p>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-8 space-y-4">
        {/* Pending first, then active, then suspended */}
        {['pending', 'active', 'suspended'].map(statusGroup => {
          const group = companies.filter(c => c.status === statusGroup);
          if (group.length === 0) return null;
          return (
            <div key={statusGroup}>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-2">
                {statusGroup} ({group.length})
              </p>
              <div className="space-y-3">
                {group.map(company => {
                  const isExpanded = expandedId === company.id;
                  const isSaving = saving === company.id;

                  return (
                    <div key={company.id} className="bg-white border border-slate-200 rounded-[32px] overflow-hidden shadow-sm">
                      <div className="flex items-center gap-5 p-6">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : company.id)}
                          className="flex items-center gap-4 flex-1 text-left"
                        >
                          <div className="p-3 bg-slate-50 rounded-2xl">
                            <Building2 size={18} className="text-slate-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[15px] font-bold text-slate-900 truncate">{company.name}</p>
                            <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                              {company.abn ? `ABN: ${company.abn}` : 'No ABN'} ·{' '}
                              {company.acn ? `ACN: ${company.acn}` : 'No ACN'} ·{' '}
                              {new Date(company.created_at).toLocaleDateString('en-AU')}
                            </p>
                          </div>
                        </button>

                        <span className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase border ${STATUS_STYLES[company.status]}`}>
                          {company.status}
                        </span>

                        <div className="flex gap-2 shrink-0">
                          {company.status !== 'active' && (
                            <button
                              onClick={() => handleUpdateStatus(company, 'active')}
                              disabled={isSaving}
                              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-bold hover:bg-emerald-100 transition-all disabled:opacity-50"
                            >
                              {isSaving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                              Approve
                            </button>
                          )}
                          {company.status !== 'suspended' && (
                            <button
                              onClick={() => handleUpdateStatus(company, 'suspended')}
                              disabled={isSaving}
                              className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-500 rounded-full text-[10px] font-bold hover:bg-red-100 transition-all disabled:opacity-50"
                            >
                              <XCircle size={12} /> Suspend
                            </button>
                          )}
                          {company.status !== 'pending' && (
                            <button
                              onClick={() => handleUpdateStatus(company, 'pending')}
                              disabled={isSaving}
                              className="flex items-center gap-1.5 px-4 py-2 bg-amber-50 text-amber-600 rounded-full text-[10px] font-bold hover:bg-amber-100 transition-all disabled:opacity-50"
                            >
                              <Clock size={12} /> Set pending
                            </button>
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-slate-100 p-6 bg-slate-50/50 space-y-4">
                          {/* Members */}
                          {company.members && company.members.length > 0 && (
                            <div>
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Members</p>
                              <div className="space-y-1">
                                {company.members.map((m, i) => (
                                  <div key={i} className="flex items-center gap-3 text-[12px]">
                                    <span className="font-bold text-slate-700">{m.full_name || '—'}</span>
                                    <span className="text-slate-400">{m.email}</span>
                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[9px] font-bold uppercase">{m.role}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Admin notes */}
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Admin notes</p>
                            <textarea
                              value={notes[company.id] ?? (company.admin_notes || '')}
                              onChange={e => setNotes(prev => ({ ...prev, [company.id]: e.target.value }))}
                              placeholder="Internal notes about this company..."
                              rows={2}
                              className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 resize-none"
                            />
                            <button
                              onClick={async () => {
                                setSaving(company.id);
                                await supabase.from('companies').update({ admin_notes: notes[company.id] }).eq('id', company.id);
                                setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, admin_notes: notes[company.id] } : c));
                                setSaving(null);
                              }}
                              disabled={isSaving}
                              className="mt-2 px-4 py-2 bg-slate-900 text-white rounded-full text-[10px] font-bold disabled:opacity-50"
                            >
                              {isSaving ? <Loader2 size={12} className="animate-spin inline" /> : 'Save notes'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}