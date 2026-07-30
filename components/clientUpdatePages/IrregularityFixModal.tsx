// components/clientUpdatePages/IrregularityFixModal.tsx
// One-click entry point for IrregularityFixPanel -- previously the only way
// to reach it was expanding the whole row (notes/emails/every field), which
// buries the one control staff actually reach for on this board behind an
// extra click and a wall of unrelated fields. This wraps the exact same
// panel in the same modal chrome CellHistoryPopover.tsx already uses, opened
// directly from a "Fix" button in the collapsed row -- see MatterBoard.tsx's
// fixTarget state.
"use client";

import { X } from "lucide-react";
import IrregularityFixPanel from "./IrregularityFixPanel";

export default function IrregularityFixModal({ pageId, itemId, canEdit, onClose, onResolved }: {
  pageId: string; itemId: string; canEdit: boolean; onClose: () => void; onResolved?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      {/* No overflow-hidden here -- RelationPicker's own dropdown (inside
          IrregularityFixPanel) is position:absolute and was getting clipped
          by this box's bottom edge the instant the result list extended
          past whatever height the closed-state content needed. Rounded
          corners still look right without it since neither child below
          reaches the edges (both have px-8 padding). */}
      <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-8 pt-8 pb-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fix irregularity</p>
          <button onClick={onClose} title="Close" className="p-2 text-slate-300 hover:text-slate-700"><X size={16} /></button>
        </div>
        <div className="px-8 pb-8">
          <IrregularityFixPanel pageId={pageId} itemId={itemId} canEdit={canEdit} bordered={false} onResolved={onResolved} />
        </div>
      </div>
    </div>
  );
}
