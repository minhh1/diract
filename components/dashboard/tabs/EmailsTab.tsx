// components/dashboard/tabs/EmailsTab.tsx
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Mail } from "lucide-react";
import { useProgressBarWhile } from "@/components/TopProgressBar";

export default function EmailsTab({ recordId }: { recordId: string }) {
  const [emails, setEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useProgressBarWhile(loading);

  useEffect(() => {
    supabase
      .from('project_emails')
      .select('*')
      .eq('project_id', recordId)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setEmails(data || []); setLoading(false); });
  }, [recordId]);

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
        <div
          key={email.id}
          className="flex items-start gap-4 p-4 bg-white border border-slate-100 rounded-2xl hover:border-slate-200 transition-all"
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
        </div>
      ))}
    </div>
  );
}