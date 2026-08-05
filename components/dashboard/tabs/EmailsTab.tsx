// components/dashboard/tabs/EmailsTab.tsx
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Mail, X, Loader2 } from "lucide-react";
import { useProgressBarWhile } from "@/components/TopProgressBar";

export default function EmailsTab({ recordId }: { recordId: string }) {
  const [emails, setEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedEmail, setSelectedEmail] = useState<any | null>(null);
  const [detailBody, setDetailBody] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useProgressBarWhile(loading);

  useEffect(() => {
    supabase
      .from('project_emails')
      .select('*, project_email_content(body_html)')
      .eq('project_id', recordId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        // One row per staff member's own mailbox copy of the same real
        // email (see migration 20260804050000_project_email_content_dedup.sql)
        // -- without this a matter's real correspondence shows up
        // repeated once per connected staff member who received a copy.
        const seen = new Set<string>();
        const deduped = (data || []).filter((e: any) => {
          const key = e.content_id || e.id;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setEmails(deduped);
        setLoading(false);
      });
  }, [recordId]);

  const openEmail = async (email: any) => {
    setSelectedEmail(email);
    setDetailBody(null);

    // Central Email captured the full body at ingestion time -- render it
    // directly, no Gmail token/API call needed (works for any viewer,
    // not just whoever's mailbox originally received it).
    const storedBody = email.project_email_content?.body_html;
    if (storedBody) {
      setDetailBody(storedBody);
      return;
    }

    // Otherwise fall back to the live Gmail fetch (works only for the
    // viewer's own connected mailbox, same as app/dashboard/gmail/page.tsx).
    if (!email.gmail_message_id) return;
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/gmail/messages/${email.gmail_message_id}`);
      const data = await res.json();
      setDetailBody(data.body || null);
    } catch (err) {
      console.error('[EmailsTab] Failed to load email body:', err);
      setDetailBody(null);
    } finally {
      setDetailLoading(false);
    }
  };

  if (loading) return null;

  if (emails.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Mail size={32} className="text-slate-200" />
      <p className="text-[11px] text-slate-300 font-bold uppercase tracking-widest">
        No emails assigned
      </p>
      <p className="text-[11px] text-slate-400 text-center max-w-xs">
        Assign emails to this project from the Gmail view
      </p>
    </div>
  );

  return (
    <div className="space-y-2">
      {emails.map(email => (
        <button
          key={email.id}
          onClick={() => openEmail(email)}
          className="w-full flex items-start gap-4 p-4 bg-white border border-slate-100 rounded-2xl hover:border-slate-200 transition-all text-left"
        >
          <div className="h-9 w-9 rounded-full bg-red-50 flex items-center justify-center text-[11px] font-bold text-red-500 uppercase shrink-0">
            {email.from_name?.charAt(0) || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-[13px] font-bold text-slate-800 truncate">
                {email.subject || '(no subject)'}
              </p>
              <p className="text-[10px] text-slate-400 shrink-0">
                {email.date ? new Date(email.date).toLocaleDateString('en-AU') : ''}
              </p>
            </div>
            <p className="text-[11px] text-slate-500 truncate">
              {email.from_name} &lt;{email.from_address}&gt;
            </p>
            {email.snippet && (
              <p className="text-[11px] text-slate-400 truncate mt-1">{email.snippet}</p>
            )}
          </div>
        </button>
      ))}

      {selectedEmail && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-slate-900/70 backdrop-blur-sm p-6">
          <div className="bg-white rounded-[24px] flex-1 flex flex-col overflow-hidden max-w-3xl w-full mx-auto">
            <div className="p-6 border-b border-slate-100 shrink-0">
              <div className="flex items-start justify-between gap-4 mb-3">
                <h2 className="text-xl font-light text-slate-900 flex-1 min-w-0 leading-snug">
                  {selectedEmail.subject || '(no subject)'}
                </h2>
                <button
                  onClick={() => setSelectedEmail(null)}
                  className="p-1.5 text-slate-300 hover:text-slate-700 transition-colors shrink-0"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex items-center gap-3 text-[12px] text-slate-500">
                <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-[11px] font-bold text-indigo-600 uppercase shrink-0">
                  {selectedEmail.from_name?.charAt(0) || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-slate-700">{selectedEmail.from_name}</span>
                  <span className="text-slate-400 ml-1.5">&lt;{selectedEmail.from_address}&gt;</span>
                </div>
                {selectedEmail.date && (
                  <span className="text-slate-400 shrink-0 text-[11px]">
                    {new Date(selectedEmail.date).toLocaleString('en-AU', {
                      day: 'numeric', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {detailLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="animate-spin text-slate-300" size={20} />
                </div>
              ) : detailBody ? (
                <iframe
                  srcDoc={detailBody}
                  className="w-full h-full border-0"
                  sandbox="allow-same-origin"
                  title="Email content"
                />
              ) : (
                <div className="p-8">
                  <p className="text-[13px] text-slate-600 leading-relaxed">{selectedEmail.snippet}</p>
                  <p className="text-[10px] text-slate-300 mt-4 italic">
                    Full email body could not be loaded, showing preview
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
