// components/gmail/ArchiveSettingsManager.tsx
// Admin UI to nominate archive Gmail account(s) for closed-matter archiving.
"use client";

import { useState } from "react";
import { X, Archive, AlertTriangle } from "lucide-react";
import EmailPicker from "./EmailPicker";

interface Props {
  archiveEmails: string[];
  archiveLabel: string;
  archiveLabelPlaceholder: string;
  autoArchiveOnClose: boolean;
  connectedEmails: string[]; // all Gmail emails connected by company members
  onChange: (next: { archiveEmails?: string[]; archiveLabel?: string; autoArchiveOnClose?: boolean }) => void;
}

export default function ArchiveSettingsManager({
  archiveEmails, archiveLabel, archiveLabelPlaceholder, autoArchiveOnClose, connectedEmails, onChange,
}: Props) {
  const [labelDraft, setLabelDraft] = useState(archiveLabel);

  const handleAdd = (email: string) => {
    if (archiveEmails.includes(email)) return;
    onChange({ archiveEmails: [...archiveEmails, email] });
  };

  const handleRemove = (email: string) => {
    if (!window.confirm(`Remove "${email}" as an archive account? Projects already archived to it are unaffected.`)) return;
    onChange({ archiveEmails: archiveEmails.filter(e => e !== email) });
  };

  const available = connectedEmails.filter(e => !archiveEmails.includes(e));

  return (
    <div className="space-y-4 pt-6 border-t border-slate-100">
      <div>
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">
          Closed-matter archiving
        </p>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          When a project is archived, its emails are copied to every account nominated below,
          verified as delivered, then deleted (moved to Trash) from every other member's mailbox.
        </p>
      </div>

      {/* Archive accounts */}
      <div className="space-y-2">
        {archiveEmails.length === 0 && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-2xl">
            <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700">
              No archive account nominated yet — archiving is disabled until you add at least one.
            </p>
          </div>
        )}
        {archiveEmails.map(email => (
          <div key={email} className="flex items-center gap-3 px-4 py-3 bg-purple-50 border border-purple-100 rounded-2xl">
            <Archive size={14} className="text-purple-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold text-purple-800 truncate">{email}</p>
              <p className="text-[10px] text-purple-400">Archive account</p>
            </div>
            <button
              onClick={() => handleRemove(email)}
              className="p-1 text-purple-300 hover:text-red-500 transition-colors"
              title="Remove as archive account"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      <EmailPicker
        label="Connected Gmail accounts"
        options={available}
        onSelect={handleAdd}
        placeholder="Search connected accounts..."
        accent="purple"
        emptyText={
          connectedEmails.length === 0
            ? "No Gmail accounts connected by company members yet."
            : "All connected accounts are already nominated."
        }
      />

      {/* Archive label name */}
      <div>
        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
          Archive label name
        </label>
        <input
          value={labelDraft}
          onChange={e => setLabelDraft(e.target.value)}
          onBlur={() => { if (labelDraft !== archiveLabel) onChange({ archiveLabel: labelDraft }); }}
          placeholder={archiveLabelPlaceholder}
          className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-[13px] font-medium outline-none focus:ring-4 focus:ring-purple-100"
        />
        <p className="text-[10px] text-slate-400 mt-1.5">
          Archived projects appear under this as their own top-level label, e.g. &ldquo;{labelDraft || archiveLabelPlaceholder}/Project name&rdquo;.
        </p>
      </div>

      {/* Auto-archive toggle */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl">
        <div className="pr-4">
          <p className="text-[12px] font-bold text-slate-700">Archive automatically when a matter closes</p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            When off, archiving only happens when an admin manually archives a project.
          </p>
        </div>
        <button
          onClick={() => onChange({ autoArchiveOnClose: !autoArchiveOnClose })}
          disabled={archiveEmails.length === 0}
          className={`shrink-0 w-11 h-6 rounded-full transition-colors relative disabled:opacity-40 disabled:cursor-not-allowed ${
            autoArchiveOnClose ? "bg-purple-600" : "bg-slate-300"
          }`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
            autoArchiveOnClose ? "translate-x-5" : ""
          }`} />
        </button>
      </div>
    </div>
  );
}
