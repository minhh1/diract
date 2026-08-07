"use client";

// The conversation list -- New chat button + past conversations with
// hover-reveal pin/rename/delete -- shared by app/(app)/dashboard/ai/page.tsx
// (the full page) and AiAssistantWidget.tsx (the expanded Quick Glance
// widget, since it now fills the canvas the same way the full page fills
// the viewport). Purely presentational: all state/handlers come from
// lib/hooks/useAiConversationNav.ts, so both callers share one copy of the
// mid-turn-remount and stale-open fixes instead of risking a third
// divergent copy of this same list.
import { Plus, Trash2, MessageSquare, Pin, Pencil, Check, X } from "lucide-react";
import type { AiConversationSummary } from "@/lib/hooks/useAiConversations";

interface Props {
  conversations: AiConversationSummary[];
  activeId: string | null;
  renamingId: string | null;
  renameValue: string;
  onRenameValueChange: (value: string) => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onStartRename: (id: string, currentTitle: string, e: React.MouseEvent) => void;
  onConfirmRename: (id: string) => void;
  onCancelRename: () => void;
  onTogglePin: (id: string) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
}

export default function AiConversationSidebar({
  conversations, activeId, renamingId, renameValue, onRenameValueChange,
  onNew, onSelect, onStartRename, onConfirmRename, onCancelRename, onTogglePin, onDelete,
}: Props) {
  return (
    <div className="w-64 shrink-0 border-r border-slate-200/70 flex flex-col">
      <div className="p-4">
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 border border-slate-200 text-slate-600 text-[13px] font-medium rounded-full hover:bg-white hover:border-slate-300 active:scale-[0.98] transition-all"
        >
          <Plus size={14} /> New chat
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5">
        {conversations.map((c) => (
          <div
            key={c.id}
            onClick={() => renamingId !== c.id && onSelect(c.id)}
            className={`group flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
              activeId === c.id ? "bg-white shadow-sm text-slate-800" : "hover:bg-white/70 text-slate-500"
            }`}
          >
            <MessageSquare size={13} className="shrink-0 opacity-50" />
            {renamingId === c.id ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => onRenameValueChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.key === "Enter" && onConfirmRename(c.id)}
                className="flex-1 min-w-0 px-2 py-1 text-[13px] border border-slate-300 rounded-lg outline-none focus:border-slate-400"
              />
            ) : (
              <p className="text-[13px] truncate flex-1">{c.title}</p>
            )}
            {renamingId === c.id ? (
              <>
                <button onClick={(e) => { e.stopPropagation(); onConfirmRename(c.id); }} className="p-1 text-emerald-500 hover:text-emerald-700 shrink-0">
                  <Check size={12} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); onCancelRename(); }} className="p-1 text-slate-300 hover:text-slate-500 shrink-0">
                  <X size={12} />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); onTogglePin(c.id); }}
                  title={c.pinned ? "Unpin" : "Pin"}
                  className={`p-1 shrink-0 transition-all ${
                    c.pinned ? "text-slate-500" : "text-slate-300 opacity-0 group-hover:opacity-100 hover:text-slate-500"
                  }`}
                >
                  <Pin size={12} fill={c.pinned ? "currentColor" : "none"} />
                </button>
                <button
                  onClick={(e) => onStartRename(c.id, c.title, e)}
                  className="p-1 text-slate-300 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                >
                  <Pencil size={12} />
                </button>
                <button
                  onClick={(e) => onDelete(c.id, e)}
                  className="p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                >
                  <Trash2 size={12} />
                </button>
              </>
            )}
          </div>
        ))}
        {conversations.length === 0 && <p className="text-[12px] text-slate-300 text-center py-8">No conversations yet</p>}
      </div>
    </div>
  );
}
