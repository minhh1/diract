"use client";

// The Finance Model's Attachments subtab -- project-wide files, plus
// (via the same AttachmentsList component, scoped differently) files
// attached to an individual budget line from Overview's Budget vs Actual
// table. Internal/authenticated only, same as Transactions/Timeline/Loans.
import AttachmentsList from "./AttachmentsList";

export default function AttachmentsSubtab({ projectId }: { projectId: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-[32px] p-6">
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">Attachments</p>
      <AttachmentsList projectId={projectId} />
    </div>
  );
}
