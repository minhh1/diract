"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Mail, RefreshCw, Loader2, Search, Tag, Send,
  Inbox, Paperclip, Reply, X, Check, Settings,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────

interface GmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  fromName: string;
  date: string;
  snippet: string;
  hasAttachments: boolean;
  isRead: boolean;
  labelIds: string[];
  niksenLabels: string[];
}

interface Project {
  id: string;
  name: string;
  property: { street_address: string } | { street_address: string }[] | null;
}

type LabelFormat = 'project_name' | 'matter_number' | 'company_project';

// ── Helpers ────────────────────────────────────────────────────────

function getProjectLabel(project: Project): string {
  if (!project.property) return project.name;
  if (Array.isArray(project.property)) {
    return project.property[0]?.street_address || project.name;
  }
  return project.property.street_address || project.name;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  } catch { return dateStr; }
}

function getFirstTwoWords(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).join(' ');
}

function buildGmailLabel(
  format: LabelFormat,
  companyName: string,
  projectName: string,
  matterNumber: string
): string {
  const companyPrefix = getFirstTwoWords(companyName);
  switch (format) {
    case 'project_name':
      return `${companyPrefix}/${projectName}`;
    case 'matter_number':
      return matterNumber
        ? `${companyPrefix}/${matterNumber}`
        : `${companyPrefix}/${projectName}`;
    case 'company_project':
      return `${companyPrefix}/${projectName}`;
  }
}

// ── Label badge ────────────────────────────────────────────────────

function LabelBadge({ label }: { label: string }) {
  const isNiksen = label.toLowerCase().startsWith('niksen') ||
    label.includes('/');
  return (
    <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wide ${
      isNiksen
        ? 'bg-indigo-100 text-indigo-700'
        : 'bg-slate-100 text-slate-500'
    }`}>
      {label.replace(/_/g, ' ')}
    </span>
  );
}

// ── Label settings modal ───────────────────────────────────────────

function LabelSettingsModal({
  format,
  companyName,
  onChange,
  onClose,
}: {
  format: LabelFormat;
  companyName: string;
  onChange: (f: LabelFormat) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-6">
      <div className="bg-white rounded-[40px] p-8 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-light uppercase tracking-wide text-slate-900">
            Gmail label format
          </h3>
          <button onClick={onClose} className="p-2 text-slate-300 hover:text-black">
            <X size={18} />
          </button>
        </div>

        <p className="text-[12px] text-slate-500 mb-5 leading-relaxed">
          Choose how project labels appear in Gmail. Labels are grouped
          under <span className="font-bold text-slate-700">
            {getFirstTwoWords(companyName)}/
          </span> so they appear together in your Gmail sidebar.
        </p>

        <div className="space-y-3">
          {[
            {
              value: 'project_name' as LabelFormat,
              label: 'Project / property name',
              example: `${getFirstTwoWords(companyName)}/12 Baker Street`,
              desc: 'Uses the street address or project name',
            },
            {
              value: 'matter_number' as LabelFormat,
              label: 'Matter number',
              example: `${getFirstTwoWords(companyName)}/260575`,
              desc: 'Uses the matter number custom field if set, falls back to project name',
            },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                format === opt.value
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-slate-100 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-[13px] font-bold text-slate-800">{opt.label}</p>
                <span className="text-[10px] font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                  {opt.example}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">{opt.desc}</p>
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="w-full mt-6 py-3 bg-slate-900 text-white rounded-full text-[11px] font-bold uppercase tracking-widest"
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────

export default function GmailPage() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('niksen');
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState<GmailMessage | null>(null);
  const [emailBody, setEmailBody] = useState<string | null>(null);
  const [loadingBody, setLoadingBody] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('in:inbox');
  const [assignedMap, setAssignedMap] = useState<Record<string, string>>({});
  const [assigning, setAssigning] = useState<string | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [sending, setSending] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [labelFormat, setLabelFormat] = useState<LabelFormat>('project_name');
  const [showLabelSettings, setShowLabelSettings] = useState(false);
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [projectSearch, setProjectSearch] = useState('');
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [activityLog, setActivityLog] = useState<any[]>([]);
  const [loadingLog, setLoadingLog] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  // Filtered project results:
  const filteredProjects = projects.filter(p => {
    if (!projectSearch.trim()) return true;
    const label = getProjectLabel(p).toLowerCase();
    return label.includes(projectSearch.toLowerCase());
  });

  // Load activity log:
  const loadActivityLog = async () => {
    setLoadingLog(true);
    const { data } = await supabase
      .from('email_activity_log')
      .select('*, project:project_id(name), profiles:user_id(full_name)')
      .order('created_at', { ascending: false })
      .limit(100);
    setActivityLog(data || []);
    setLoadingLog(false);
  };

  // Sync from Gmail:
  const handleGmailSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/gmail/sync', { method: 'POST' });
      const data = await res.json();
      setLastSynced(new Date());
      if (data.synced > 0) {
        await loadAssignments();
        await loadActivityLog();
      }
    } catch (err) {
      console.error('Sync error:', err);
    } finally {
      setSyncing(false);
    }
  };

  // Auto-sync on load:
  useEffect(() => {
    if (connected) handleGmailSync();
  }, [connected]);



  useEffect(() => {
    checkConnection();
    loadProjects();
    loadAssignments();
    loadCompanyName();
    // Load saved label format preference
    const saved = localStorage.getItem('gmail_label_format') as LabelFormat;
    if (saved) setLabelFormat(saved);
  }, []);

  const checkConnection = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('user_gmail_tokens')
      .select('email')
      .eq('user_id', user.id)
      .single();
    setConnected(!!data);
    if (data?.email) setGmailEmail(data.email);
    if (data) fetchMessages('in:inbox');
    else setLoading(false);
  };

  const loadCompanyName = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: prof } = await supabase
      .from('profiles')
      .select('active_company_id')
      .eq('id', user.id)
      .single();
    if (!prof?.active_company_id) return;
    const { data: company } = await supabase
      .from('companies')
      .select('name')
      .eq('id', prof.active_company_id)
      .single();
    if (company?.name) setCompanyName(company.name);
  };

  const fetchMessages = useCallback(async (query: string) => {
    setLoading(true);
    setActiveFilter(query);
    setFetchError(null);
    try {
      const res = await fetch(
        `/api/gmail/messages?q=${encodeURIComponent(query)}`
      );
      const data = await res.json();
      if (data.error) {
        setFetchError(data.error);
        setMessages([]);
      } else {
        setMessages(data.messages || []);
      }
    } catch (err: any) {
      setFetchError(err?.message || 'Failed to load emails');
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProjects = async () => {
    const { data } = await supabase
      .from('projects')
      .select('id, name, property:property_id(street_address)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    setProjects((data as Project[]) || []);
  };

  const loadAssignments = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('project_emails')
      .select('gmail_message_id, project_id')
      .eq('user_id', user.id);
    const map: Record<string, string> = {};
    (data || []).forEach(r => { map[r.gmail_message_id] = r.project_id; });
    setAssignedMap(map);
  };

  const handleSelectMessage = async (msg: GmailMessage) => {
    setSelectedMessage(msg);
    setEmailBody(null);
    setSelectedLabelIds(msg.labelIds || []);
    setLoadingBody(true);
    try {
      const res = await fetch(`/api/gmail/messages/${msg.id}`);
      const data = await res.json();
      setEmailBody(data.body || null);
      if (data.labelIds) setSelectedLabelIds(data.labelIds);
    } catch {
      setEmailBody(null);
    } finally {
      setLoadingBody(false);
    }
  };

  const handleAssign = async (messageId: string, projectId: string) => {
    if (!selectedMessage) return;
    setAssigning(messageId);
    const project = projects.find(p => p.id === projectId);
    if (!project) { setAssigning(null); return; }

    const projectName = getProjectLabel(project);

    // Get matter number if exists
    const { data: matterField } = await supabase
      .from('company_custom_fields')
      .select('id')
      .eq('field_key', 'matter_number')
      .single();

    let matterNumber = '';
    if (matterField) {
      const { data: matterVal } = await supabase
        .from('company_custom_field_values')
        .select('value_text')
        .eq('field_id', matterField.id)
        .eq('record_id', projectId)
        .single();
      matterNumber = matterVal?.value_text || '';
    }

    const gmailLabelName = buildGmailLabel(
      labelFormat, companyName, projectName, matterNumber
    );

    try {
      await fetch('/api/gmail/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          threadId: selectedMessage.threadId,
          projectId,
          projectName: gmailLabelName,
          subject: selectedMessage.subject,
          from: selectedMessage.from,
          fromName: selectedMessage.fromName,
          date: selectedMessage.date,
          snippet: selectedMessage.snippet,
        }),
      });
      setAssignedMap(prev => ({ ...prev, [messageId]: projectId }));
      // Refresh labels
      const res = await fetch(`/api/gmail/messages/${messageId}`);
      const data = await res.json();
      if (data.labelIds) setSelectedLabelIds(data.labelIds);
    } catch (err) {
      console.error('handleAssign:', err);
    } finally {
      setAssigning(null);
    }
  };

  const handleSend = async () => {
    if (!composeTo || !composeSubject || !composeBody) return;
    setSending(true);
    try {
      await fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: composeTo,
          subject: composeSubject,
          body: composeBody,
          threadId: selectedMessage?.threadId,
        }),
      });
      setShowCompose(false);
      setComposeTo(''); setComposeSubject(''); setComposeBody('');
    } catch (err) { console.error('handleSend:', err); }
    finally { setSending(false); }
  };

  const handleReply = () => {
    if (!selectedMessage) return;
    setComposeTo(selectedMessage.from);
    setComposeSubject(
      selectedMessage.subject.startsWith('Re:')
        ? selectedMessage.subject
        : `Re: ${selectedMessage.subject}`
    );
    setShowCompose(true);
  };

  const handleLabelFormatChange = (f: LabelFormat) => {
    setLabelFormat(f);
    localStorage.setItem('gmail_label_format', f);
  };

  const filteredMessages = messages.filter(m => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      m.subject.toLowerCase().includes(q) ||
      m.fromName.toLowerCase().includes(q) ||
      m.from.toLowerCase().includes(q) ||
      m.snippet.toLowerCase().includes(q)
    );
  });

  // Display labels — filter out system Gmail labels
  const SYSTEM_LABELS = new Set([
    'INBOX', 'UNREAD', 'IMPORTANT', 'SENT', 'DRAFT',
    'SPAM', 'TRASH', 'STARRED', 'CATEGORY_PERSONAL',
    'CATEGORY_SOCIAL', 'CATEGORY_PROMOTIONS', 'CATEGORY_UPDATES',
    'CATEGORY_FORUMS',
  ]);

  const displayLabels = selectedLabelIds.filter(l => !SYSTEM_LABELS.has(l));

  // ── Not connected ─────────────────────────────────────────────────
  if (connected === false) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#F9FAFB] font-sans">
        <div className="bg-white border border-slate-200 rounded-[40px] p-12 max-w-md w-full mx-4 text-center shadow-sm">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-5">
            <Mail size={28} className="text-red-500" />
          </div>
          <h2 className="text-2xl font-light uppercase tracking-tight text-slate-900 mb-3">
            Connect Gmail
          </h2>
          <p className="text-[13px] text-slate-500 mb-8 leading-relaxed">
            Connect your Gmail account to view emails, assign them to projects,
            and sync project labels back to Gmail.
          </p>
          <button
            onClick={() => { window.location.href = '/api/gmail/auth'; }}
            className="flex items-center justify-center gap-3 w-full py-4 bg-slate-900 text-white rounded-full font-bold text-[13px] hover:bg-slate-700 transition-all"
          >
            Connect with Google
          </button>
          <p className="text-[10px] text-slate-400 mt-4">
            We only request access to read, label, and send emails.
          </p>
        </div>
      </div>
    );
  }

  if (connected === null) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="animate-spin text-slate-300" size={24} />
      </div>
    );
  }

  const FILTERS = [
    { label: 'Inbox',    q: 'in:inbox' },
    { label: 'Unread',   q: 'is:unread in:inbox' },
    { label: 'Sent',     q: 'in:sent' },
    { label: 'Starred',  q: 'is:starred' },
    { label: 'niksen/*', q: 'label:niksen' },
  ];

  return (
    <div className="flex flex-col h-screen bg-[#F9FAFB] font-sans antialiased overflow-hidden">

      {/* ── Header ── */}
      <header className="bg-white border-b border-slate-100 shrink-0 px-8 pt-8 pb-4">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-2xl bg-red-50 flex items-center justify-center">
              <Mail size={20} className="text-red-500" />
            </div>
            <div>
              <h1 className="text-2xl font-light uppercase tracking-tight text-slate-900">
                Gmail
              </h1>
              {gmailEmail && (
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                  {gmailEmail}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowLabelSettings(true)}
              className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-full hover:bg-slate-100 transition-all text-slate-500"
              title="Label settings"
            >
              <Settings size={16} />
            </button>
            <button
              onClick={() => fetchMessages(activeFilter)}
              disabled={loading}
              className="p-2 bg-slate-50 border border-slate-200 rounded-full hover:bg-slate-100 transition-all text-slate-500 disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => setShowCompose(true)}
              className="flex items-center gap-2 px-5 py-2 bg-slate-900 text-white rounded-full text-[11px] font-bold"
            >
              <Send size={13} /> Compose
            </button>
          </div>
        </div>

        <div className="relative mb-4">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"
            size={16}
          />
          <input
            placeholder="Search emails..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && search) fetchMessages(search); }}
            className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 pl-11 pr-4 text-sm font-medium outline-none focus:ring-4 focus:ring-black/5"
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f.q}
              onClick={() => fetchMessages(f.q)}
              className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all ${
                activeFilter === f.q
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      {/* ── Main ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Left: Email list OR Activity log ── */}
        {showActivityLog ? (
          <div className="flex-1 overflow-y-auto bg-[#F9FAFB] p-8">
            <div className="max-w-3xl mx-auto space-y-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">
                {activityLog.length} events
              </p>

              {loadingLog ? (
                <div className="flex justify-center py-20">
                  <Loader2 className="animate-spin text-slate-300" size={20} />
                </div>
              ) : activityLog.length === 0 ? (
                <p className="text-center text-slate-300 text-[11px] font-bold uppercase tracking-widest py-20">
                  No activity yet
                </p>
              ) : (
                activityLog.map(log => {
                  const actionLabels: Record<string, { label: string; color: string }> = {
                    label_applied: { label: 'Label applied',  color: 'bg-indigo-100 text-indigo-700' },
                    label_removed: { label: 'Label removed',  color: 'bg-slate-100 text-slate-600' },
                    gmail_sync:    { label: 'Gmail synced',   color: 'bg-emerald-100 text-emerald-700' },
                    assigned:      { label: 'Assigned',       color: 'bg-blue-100 text-blue-700' },
                    unassigned:    { label: 'Unassigned',     color: 'bg-amber-100 text-amber-700' },
                  };
                  const actionInfo = actionLabels[log.action] ||
                    { label: log.action, color: 'bg-slate-100 text-slate-600' };

                  return (
                    <div
                      key={log.id}
                      className="flex items-start gap-4 p-5 bg-white border border-slate-100 rounded-2xl"
                    >
                      <div className="shrink-0 mt-0.5">
                        <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase ${actionInfo.color}`}>
                          {actionInfo.label}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        {log.details?.subject && (
                          <p className="text-[13px] font-medium text-slate-800 truncate">
                            {log.details.subject}
                          </p>
                        )}
                        {log.project?.name && (
                          <p className="text-[11px] text-indigo-600 font-bold mt-0.5">
                            → {log.project.name}
                          </p>
                        )}
                        {log.action === 'gmail_sync' && log.details?.synced !== undefined && (
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {log.details.synced} email{log.details.synced !== 1 ? 's' : ''} synced
                            {log.details.labels?.length > 0 && (
                              <span className="text-slate-400">
                                {' '}from {log.details.labels.length} label
                                {log.details.labels.length !== 1 ? 's' : ''}
                              </span>
                            )}
                          </p>
                        )}
                        {log.details?.from && (
                          <p className="text-[10px] text-slate-400 mt-1">
                            From: {log.details.from}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[10px] text-slate-400">
                          {new Date(log.created_at).toLocaleDateString('en-AU', {
                            day: 'numeric', month: 'short',
                          })}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {new Date(log.created_at).toLocaleTimeString('en-AU', {
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </p>
                        {log.profiles?.full_name && (
                          <p className="text-[9px] text-slate-300 mt-1">
                            {log.profiles.full_name}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Email list */}
            <div className={`flex flex-col bg-white border-r border-slate-100 overflow-hidden ${
              selectedMessage ? 'w-80 shrink-0' : 'flex-1'
            }`}>
              {loading ? (
                <div className="flex items-center justify-center flex-1">
                  <Loader2 className="animate-spin text-slate-300" size={24} />
                </div>
              ) : fetchError ? (
                <div className="flex flex-col items-center justify-center flex-1 gap-3 p-8">
                  <p className="text-[11px] text-red-400 font-bold uppercase tracking-widest text-center">
                    {fetchError}
                  </p>
                  <button
                    onClick={() => fetchMessages('in:inbox')}
                    className="text-[10px] text-indigo-600 font-bold hover:underline"
                  >
                    Try again
                  </button>
                </div>
              ) : filteredMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 gap-3">
                  <Inbox size={32} className="text-slate-200" />
                  <p className="text-[11px] text-slate-300 font-bold uppercase tracking-widest">
                    No emails
                  </p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
                  {filteredMessages.map(msg => {
                    const assignedProject = projects.find(p => p.id === assignedMap[msg.id]);
                    const isSelected = selectedMessage?.id === msg.id;
                    return (
                      <button
                        key={msg.id}
                        onClick={() => handleSelectMessage(msg)}
                        className={`w-full text-left px-5 py-4 transition-all hover:bg-indigo-50/30 ${
                          isSelected
                            ? 'bg-indigo-50 border-l-2 border-indigo-500'
                            : 'border-l-2 border-transparent'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className={`text-[13px] truncate ${
                            msg.isRead ? 'text-slate-600 font-medium' : 'font-bold text-slate-900'
                          }`}>
                            {msg.fromName || msg.from}
                          </p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {msg.hasAttachments && (
                              <Paperclip size={11} className="text-slate-400" />
                            )}
                            <p className="text-[10px] text-slate-400">
                              {formatDate(msg.date)}
                            </p>
                          </div>
                        </div>
                        <p className={`text-[12px] truncate mb-1 ${
                          msg.isRead ? 'text-slate-500' : 'font-medium text-slate-800'
                        }`}>
                          {msg.subject}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">{msg.snippet}</p>
                        {assignedProject && (
                          <div className="flex items-center gap-1 mt-2">
                            <Tag size={10} className="text-indigo-500 shrink-0" />
                            <span className="text-[10px] font-bold text-indigo-600 truncate">
                              {getProjectLabel(assignedProject)}
                            </span>
                          </div>
                        )}
                        {msg.niksenLabels && msg.niksenLabels.length > 0 && (
                          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                            {msg.niksenLabels.map(label => (
                              <span
                                key={label}
                                className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-[9px] font-bold"
                              >
                                {label}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Email detail pane */}
            {selectedMessage && (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-white">

                {/* Detail header */}
                <div className="p-6 border-b border-slate-100 shrink-0">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <h2 className="text-xl font-light text-slate-900 flex-1 min-w-0 leading-snug">
                      {selectedMessage.subject}
                    </h2>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={handleReply}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-[10px] font-bold text-slate-600 hover:bg-slate-100 transition-all"
                      >
                        <Reply size={12} /> Reply
                      </button>
                      <button
                        onClick={() => {
                          setSelectedMessage(null);
                          setEmailBody(null);
                          setSelectedLabelIds([]);
                        }}
                        className="p-1.5 text-slate-300 hover:text-slate-700 transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Sender + date */}
                  <div className="flex items-center gap-3 text-[12px] text-slate-500 mb-3">
                    <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-[11px] font-bold text-indigo-600 uppercase shrink-0">
                      {selectedMessage.fromName?.charAt(0) || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-slate-700">
                        {selectedMessage.fromName}
                      </span>
                      <span className="text-slate-400 ml-1.5">
                        {'<'}{selectedMessage.from}{'>'}
                      </span>
                    </div>
                    <span className="text-slate-400 shrink-0 text-[11px]">
                      {new Date(selectedMessage.date).toLocaleString('en-AU', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </div>

                  {/* Gmail labels */}
                  {displayLabels.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap mb-3">
                      {displayLabels.map(label => (
                        <LabelBadge key={label} label={label} />
                      ))}
                    </div>
                  )}

                  {/* Project assignment — typeahead search */}
                  <div className="flex items-center gap-3">
                    <Tag size={14} className="text-slate-400 shrink-0" />
                    <div className="relative flex-1">
                      {assignedMap[selectedMessage.id] ? (
                        <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-200 rounded-full">
                          <span className="text-[12px] font-bold text-indigo-700 flex-1 truncate">
                            {getProjectLabel(
                              projects.find(p => p.id === assignedMap[selectedMessage.id])!
                            )}
                          </span>
                          <button
                            onClick={() => setAssignedMap(prev => {
                              const next = { ...prev };
                              delete next[selectedMessage.id];
                              return next;
                            })}
                            className="text-indigo-300 hover:text-indigo-700 transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-full px-4 py-2">
                            <Search size={12} className="text-slate-400 shrink-0" />
                            <input
                              value={projectSearch}
                              onChange={e => {
                                setProjectSearch(e.target.value);
                                setShowProjectDropdown(true);
                              }}
                              onFocus={() => setShowProjectDropdown(true)}
                              placeholder="Search projects..."
                              className="flex-1 bg-transparent text-[12px] font-medium outline-none placeholder:text-slate-300"
                            />
                            {projectSearch && (
                              <button
                                onClick={() => {
                                  setProjectSearch('');
                                  setShowProjectDropdown(false);
                                }}
                                className="text-slate-300 hover:text-slate-600 transition-colors"
                              >
                                <X size={12} />
                              </button>
                            )}
                          </div>

                          {/* Dropdown */}
                          {showProjectDropdown && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-20 max-h-56 overflow-y-auto">
                              {filteredProjects.length === 0 ? (
                                <p className="px-4 py-3 text-[11px] text-slate-300 italic">
                                  No projects found
                                </p>
                              ) : (
                                filteredProjects.map(p => (
                                  <button
                                    key={p.id}
                                    onClick={() => {
                                      handleAssign(selectedMessage.id, p.id);
                                      setProjectSearch('');
                                      setShowProjectDropdown(false);
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-indigo-50 text-left transition-colors border-b border-slate-50 last:border-0"
                                  >
                                    <div className="h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center text-[9px] font-bold text-indigo-600 shrink-0">
                                      {getProjectLabel(p).charAt(0).toUpperCase()}
                                    </div>
                                    <span className="text-[12px] font-medium text-slate-700 truncate">
                                      {getProjectLabel(p)}
                                    </span>
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {assigning === selectedMessage.id && (
                      <Loader2 size={14} className="animate-spin text-slate-400 shrink-0" />
                    )}
                    {assignedMap[selectedMessage.id] && assigning !== selectedMessage.id && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Check size={13} className="text-emerald-500" />
                        <span className="text-[10px] font-bold text-emerald-600">
                          Labelled in Gmail
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Label format hint */}
                  <div className="mt-2 flex items-center gap-2">
                    <p className="text-[10px] text-slate-400">
                      Label format:
                      <span className="font-bold text-slate-600 ml-1">
                        {labelFormat === 'project_name' && `${getFirstTwoWords(companyName)}/project name`}
                        {labelFormat === 'matter_number' && `${getFirstTwoWords(companyName)}/matter number`}
                      </span>
                    </p>
                    <button
                      onClick={() => setShowLabelSettings(true)}
                      className="text-[10px] text-indigo-600 font-bold hover:underline"
                    >
                      Change
                    </button>
                  </div>
                </div>

                {/* Email body */}
                <div className="flex-1 overflow-y-auto">
                  {loadingBody ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="animate-spin text-slate-300" size={20} />
                    </div>
                  ) : emailBody ? (
                    <iframe
                      srcDoc={emailBody}
                      className="w-full h-full border-0"
                      sandbox="allow-same-origin"
                      title="Email content"
                    />
                  ) : (
                    <div className="p-8">
                      <p className="text-[13px] text-slate-600 leading-relaxed">
                        {selectedMessage.snippet}
                      </p>
                      <p className="text-[10px] text-slate-300 mt-4 italic">
                        Full email body could not be loaded — showing preview
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Close project dropdown on outside click */}
      {showProjectDropdown && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setShowProjectDropdown(false)}
        />
      )}

      {/* ── Compose modal ── */}
      {showCompose && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-6 pointer-events-none">
          <div className="bg-white border border-slate-200 rounded-[32px] shadow-2xl w-full max-w-lg pointer-events-auto flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <p className="text-[13px] font-bold text-slate-800">New message</p>
              <button
                onClick={() => setShowCompose(false)}
                className="p-1.5 text-slate-300 hover:text-black transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <input
                value={composeTo}
                onChange={e => setComposeTo(e.target.value)}
                placeholder="To"
                type="email"
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-[13px] font-medium outline-none focus:ring-2 focus:ring-indigo-100"
              />
              <input
                value={composeSubject}
                onChange={e => setComposeSubject(e.target.value)}
                placeholder="Subject"
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-[13px] font-medium outline-none focus:ring-2 focus:ring-indigo-100"
              />
              <textarea
                value={composeBody}
                onChange={e => setComposeBody(e.target.value)}
                placeholder="Write your message..."
                rows={8}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-[13px] font-medium outline-none focus:ring-2 focus:ring-indigo-100 resize-none"
              />
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={() => setShowCompose(false)}
                  className="px-4 py-2 text-[11px] font-bold text-slate-400 hover:text-slate-700 transition-colors"
                >
                  Discard
                </button>
                <button
                  onClick={handleSend}
                  disabled={
                    sending ||
                    !composeTo.trim() ||
                    !composeSubject.trim() ||
                    !composeBody.trim()
                  }
                  className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-full text-[11px] font-bold disabled:opacity-40 hover:bg-black transition-all"
                >
                  {sending
                    ? <Loader2 size={12} className="animate-spin" />
                    : <Send size={12} />
                  }
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Label settings modal ── */}
      {showLabelSettings && (
        <LabelSettingsModal
          format={labelFormat}
          companyName={companyName}
          onChange={handleLabelFormatChange}
          onClose={() => setShowLabelSettings(false)}
        />
      )}

    </div>
  );
}