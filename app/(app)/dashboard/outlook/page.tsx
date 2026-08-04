// app/dashboard/outlook/page.tsx
// Phase 2 of Outlook parity for Shared Labels: bare-bones inbox + assign
// UI, just enough to trigger app/api/outlook/assign (the origination point
// for the async label-sync engine) and watch it propagate to a second
// connected account. Not a visual port of the Gmail client
// (EmailList/EmailDetail/compose/label-settings modal) — that's later,
// separate UI work once this backend is proven out.
"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Mail, CheckCircle2, RefreshCw, Tag, X } from "lucide-react";

interface OutlookMessage {
  id: string;
  subject: string;
  fromName: string;
  from: string;
  date: string;
  snippet: string;
  isRead: boolean;
  diractLabels: string[];
  diractProjectIds: string[];
}

interface Project {
  id: string;
  name: string;
}

export default function OutlookPage() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [outlookEmail, setOutlookEmail] = useState<string | null>(null);

  const [messages, setMessages] = useState<OutlookMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<OutlookMessage | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");

  useEffect(() => {
    checkConnection();
    loadProjects();
  }, []);

  useEffect(() => {
    if (connected) fetchMessages();
  }, [connected]);

  const checkConnection = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setConnected(false); return; }
    const { data } = await supabase
      .from('user_outlook_tokens')
      .select('email')
      .eq('user_id', user.id)
      .single();
    setConnected(!!data);
    if (data?.email) setOutlookEmail(data.email);
  };

  const loadProjects = async () => {
    const { data } = await supabase
      .from('projects')
      .select('id, name')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    setProjects(data || []);
  };

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/outlook/messages');
      const data = await res.json();
      if (data.error) { setFetchError(data.error); setMessages([]); }
      else setMessages(data.messages || []);
    } catch (err: any) {
      setFetchError(err?.message || 'Failed to load emails');
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleAssign = async (projectId: string) => {
    if (!selected) return;
    setAssigning(true);
    try {
      const res = await fetch('/api/outlook/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: selected.id,
          projectId,
          subject: selected.subject,
          from: selected.from,
          fromName: selected.fromName,
          date: selected.date,
          snippet: selected.snippet,
        }),
      });
      const data = await res.json();
      if (!res.ok) { alert(`Assign failed: ${data.error}`); return; }
      await fetchMessages();
      setSelected(null);
    } catch (err: any) {
      alert(`Assign failed: ${err.message}`);
    } finally {
      setAssigning(false);
    }
  };

  const handleRemoveLabel = async (messageId: string) => {
    try {
      const res = await fetch('/api/outlook/remove-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId }),
      });
      const data = await res.json();
      if (!res.ok) { alert(`Remove failed: ${data.error}`); return; }
      await fetchMessages();
      setSelected(null);
    } catch (err: any) {
      alert(`Remove failed: ${err.message}`);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect your Outlook account? You can reconnect at any time.')) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('user_outlook_tokens').delete().eq('user_id', user.id);
    setConnected(false);
    setOutlookEmail(null);
    setMessages([]);
  };

  const filteredProjects = projects.filter(p =>
    !projectSearch.trim() || p.name.toLowerCase().includes(projectSearch.toLowerCase().trim())
  );

  if (connected === null) return null;

  if (connected === false) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#F9FAFB] font-sans">
        <div className="bg-white border border-slate-200 rounded-[40px] p-12 max-w-md w-full mx-4 text-center shadow-sm">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-5">
            <Mail size={28} className="text-blue-500" />
          </div>
          <h2 className="text-2xl font-light uppercase tracking-tight text-slate-900 mb-3">
            Connect Outlook
          </h2>
          <p className="text-[13px] text-slate-500 mb-8 leading-relaxed">
            Connect your Outlook account to assign emails to projects and
            share labels across your team.
          </p>
          <button
            onClick={() => { window.location.href = '/api/outlook/auth'; }}
            className="flex items-center justify-center gap-3 w-full py-4 bg-slate-900 text-white rounded-full font-bold text-[13px] hover:bg-slate-700 transition-all"
          >
            Connect with Microsoft
          </button>
          <p className="text-[10px] text-slate-400 mt-4">
            We only request access to read and label your mail.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#F9FAFB] font-sans antialiased overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-2 text-[13px] text-slate-600">
          <CheckCircle2 size={14} className="text-emerald-500" />
          {outlookEmail}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchMessages} className="p-2 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={handleDisconnect} className="text-[11px] text-slate-400 hover:text-red-500">
            Disconnect
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="w-full max-w-md border-r border-slate-200 overflow-y-auto bg-white">
          {fetchError && <div className="p-4 text-[12px] text-red-500">{fetchError}</div>}
          {!loading && !fetchError && messages.length === 0 && (
            <div className="p-4 text-[12px] text-slate-400">No messages</div>
          )}
          {messages.map(msg => (
            <button
              key={msg.id}
              onClick={() => setSelected(msg)}
              className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 ${selected?.id === msg.id ? 'bg-indigo-50' : ''}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-bold text-slate-700 truncate">{msg.fromName || msg.from}</p>
                {msg.diractLabels.length > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-indigo-500 shrink-0 ml-2">
                    <Tag size={10} /> {msg.diractLabels[0]}
                  </span>
                )}
              </div>
              <p className="text-[12px] text-slate-600 truncate">{msg.subject}</p>
              <p className="text-[11px] text-slate-400 truncate">{msg.snippet}</p>
            </button>
          ))}
        </div>

        {selected && (
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-[15px] font-bold text-slate-800">{selected.subject}</h2>
                <p className="text-[12px] text-slate-500">{selected.fromName} &lt;{selected.from}&gt;</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-1 text-slate-400 hover:text-slate-700">
                <X size={16} />
              </button>
            </div>

            {selected.diractLabels.length > 0 ? (
              <div className="mb-4 flex items-center gap-3">
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-full text-[11px] font-bold">
                  <Tag size={11} /> {selected.diractLabels[0]}
                </span>
                <button
                  onClick={() => handleRemoveLabel(selected.id)}
                  className="text-[11px] text-slate-400 hover:text-red-500"
                >
                  Remove label
                </button>
              </div>
            ) : (
              <div className="mb-4 space-y-2">
                <input
                  value={projectSearch}
                  onChange={e => setProjectSearch(e.target.value)}
                  placeholder="Search projects…"
                  className="w-full px-3 py-2 border border-slate-200 rounded-2xl text-[12px] focus:outline-none focus:border-indigo-400"
                />
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {filteredProjects.map(p => (
                    <button
                      key={p.id}
                      disabled={assigning}
                      onClick={() => handleAssign(p.id)}
                      className="w-full text-left px-3 py-2 rounded-xl text-[12px] text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
