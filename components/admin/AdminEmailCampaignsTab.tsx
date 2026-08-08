// components/admin/AdminEmailCampaignsTab.tsx
// Admin-only campaign/marketing email: compose against a table + email
// field (same table_id/table_name + field_id/native_field_key duality as
// AdminCalendarTab's date sources), preview the post-suppression recipient
// count live, send. Every send is subject to email_unsubscribes and gets a
// server-inserted unsubscribe footer -- see
// app/api/email-campaigns/[id]/send/route.ts, not anything this component
// controls. v1 keeps the composer to plain-text paragraphs, not a
// block-based editor -- that's its own large sub-project.
"use client";

import { useCallback, useEffect, useState } from "react";
import { Send, Plus, X, Mail, Loader2, Users } from "lucide-react";

interface Props {
  companyId: string;
}

interface EmailField { field_id: string | null; native_field_key: string | null; label: string }
interface EmailFieldTable { table_id: string | null; table_name: string | null; label: string; fields: EmailField[] }
interface Campaign {
  id: string; name: string; subject: string; body_text: string;
  status: "draft" | "sending" | "sent" | "failed";
  recipient_count: number | null; sent_count: number; created_at: string;
}

export default function AdminEmailCampaignsTab({ companyId }: Props) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [tables, setTables] = useState<EmailFieldTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [selectedTableKey, setSelectedTableKey] = useState("");
  const [selectedFieldKey, setSelectedFieldKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ count: number; sample: string[] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [campaignsRes, fieldsRes] = await Promise.all([
      fetch("/api/email-campaigns").then((r) => r.json()),
      fetch("/api/email-campaigns/fields").then((r) => r.json()),
    ]);
    setCampaigns(campaignsRes.campaigns || []);
    setTables(fieldsRes.tables || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const tableKey = (t: { table_id: string | null; table_name: string | null }) => t.table_id || t.table_name || "";
  const fieldKey = (f: EmailField) => f.field_id || f.native_field_key || "";
  const selectedTable = tables.find((t) => tableKey(t) === selectedTableKey);

  const createCampaign = async () => {
    const field = selectedTable?.fields.find((f) => fieldKey(f) === selectedFieldKey);
    if (!selectedTable || !field || !name.trim() || !subject.trim() || !bodyText.trim()) return;
    setCreating(true);
    setError(null);
    const res = await fetch("/api/email-campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(), subject: subject.trim(), body_text: bodyText.trim(),
        table_id: selectedTable.table_id, table_name: selectedTable.table_name,
        email_field_id: field.field_id, native_field_key: field.native_field_key,
      }),
    });
    const json = await res.json().catch(() => null);
    setCreating(false);
    if (!res.ok) { setError(json?.error || "Could not create campaign"); return; }
    setCampaigns((prev) => [json.campaign, ...prev]);
    setShowNew(false); setName(""); setSubject(""); setBodyText(""); setSelectedTableKey(""); setSelectedFieldKey(""); setPreview(null);
  };

  const loadPreview = async (campaignId: string) => {
    const res = await fetch(`/api/email-campaigns/${campaignId}/recipients`);
    const json = await res.json().catch(() => null);
    if (res.ok) setPreview(json);
  };

  const sendCampaign = async (id: string) => {
    if (!window.confirm("Send this campaign now? This can't be undone.")) return;
    setSendingId(id);
    const res = await fetch(`/api/email-campaigns/${id}/send`, { method: "POST" });
    const json = await res.json().catch(() => null);
    setSendingId(null);
    if (!res.ok) { setError(json?.error || "Send failed"); return; }
    load();
  };

  const deleteCampaign = async (id: string) => {
    if (!window.confirm("Delete this draft campaign?")) return;
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
    await fetch(`/api/email-campaigns/${id}`, { method: "DELETE" });
  };

  if (loading) return <p className="text-[11px] text-slate-400">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-[24px] px-6 py-4">
        <p className="text-[12px] text-amber-800 leading-relaxed">
          Every campaign email includes an unsubscribe link automatically, and skips anyone who's already unsubscribed. This is for marketing/bulk email, not task or account notifications, those keep sending regardless.
        </p>
      </div>

      {!showNew ? (
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 text-white text-[12px] font-bold rounded-full hover:bg-indigo-700 transition-colors"
        >
          <Plus size={13} /> New campaign
        </button>
      ) : (
        <div className="bg-white border border-slate-200 rounded-[32px] p-6 space-y-3">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">New campaign</p>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign name (internal)"
            className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none focus:border-indigo-400" />
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject line"
            className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none focus:border-indigo-400" />
          <textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} placeholder="Message body (plain text, paragraphs separated by a blank line)" rows={6}
            className="w-full px-4 py-3 border border-slate-200 rounded-2xl text-[13px] outline-none focus:border-indigo-400 resize-none" />
          <div className="flex flex-wrap items-center gap-2">
            <select value={selectedTableKey} onChange={(e) => { setSelectedTableKey(e.target.value); setSelectedFieldKey(""); }}
              className="px-3 py-2 border border-slate-200 rounded-full text-[11px] outline-none focus:border-indigo-400">
              <option value="">Send to (table)...</option>
              {tables.map((t) => <option key={tableKey(t)} value={tableKey(t)}>{t.label}</option>)}
            </select>
            <select value={selectedFieldKey} onChange={(e) => setSelectedFieldKey(e.target.value)} disabled={!selectedTable}
              className="px-3 py-2 border border-slate-200 rounded-full text-[11px] outline-none focus:border-indigo-400 disabled:opacity-40">
              <option value="">Email field...</option>
              {selectedTable?.fields.map((f) => <option key={fieldKey(f)} value={fieldKey(f)}>{f.label}</option>)}
            </select>
          </div>
          {error && <p className="text-[11px] text-red-500">{error}</p>}
          <div className="flex items-center gap-2 pt-1">
            <button onClick={createCampaign} disabled={creating || !name.trim() || !subject.trim() || !bodyText.trim() || !selectedFieldKey}
              className="px-5 py-2.5 bg-indigo-600 text-white text-[12px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors">
              {creating ? "Saving..." : "Save as draft"}
            </button>
            <button onClick={() => setShowNew(false)} className="px-4 py-2.5 text-[12px] font-bold text-slate-400 hover:text-slate-600">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-[32px] overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Campaigns</p>
        </div>
        {campaigns.length === 0 ? (
          <p className="px-6 py-5 text-[11px] text-slate-300 italic">No campaigns yet</p>
        ) : (
          campaigns.map((c) => (
            <div key={c.id} className="px-6 py-4 border-b border-slate-50 last:border-0 space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                  <Mail size={14} className="text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-slate-800 truncate">{c.name}</p>
                  <p className="text-[10px] text-slate-400 truncate">{c.subject}</p>
                </div>
                <span className={`text-[9px] font-bold uppercase px-2 py-1 rounded-full shrink-0 ${
                  c.status === "sent" ? "bg-emerald-50 text-emerald-600"
                  : c.status === "sending" ? "bg-amber-50 text-amber-600"
                  : c.status === "failed" ? "bg-red-50 text-red-600"
                  : "bg-slate-100 text-slate-500"
                }`}>{c.status}</span>
              </div>
              {c.status === "draft" && (
                <div className="flex items-center gap-2 pl-11">
                  <button onClick={() => loadPreview(c.id)} className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-indigo-600">
                    <Users size={11} /> Preview recipients
                  </button>
                  {preview && (
                    <span className="text-[10px] text-slate-400">{preview.count} recipient{preview.count !== 1 ? "s" : ""}{preview.sample.length ? ` (e.g. ${preview.sample[0]})` : ""}</span>
                  )}
                  <button onClick={() => sendCampaign(c.id)} disabled={sendingId === c.id}
                    className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-[10px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors ml-auto">
                    {sendingId === c.id ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />} Send
                  </button>
                  <button onClick={() => deleteCampaign(c.id)} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors">
                    <X size={13} />
                  </button>
                </div>
              )}
              {c.status === "sent" && (
                <p className="pl-11 text-[10px] text-slate-400">Sent to {c.sent_count} recipient{c.sent_count !== 1 ? "s" : ""}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
