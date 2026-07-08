// components/dashboard/tabs/ChecklistTab.tsx
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Check, Trash2, Loader2, ListChecks } from "lucide-react";

interface ChecklistItem {
  id: string;
  title: string;
  is_done: boolean;
  due_date: string | null;
  assigned_to: string | null;
  created_at: string;
}

export default function ChecklistTab({ recordId, companyId }: { recordId: string; companyId: string }) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [showInput, setShowInput] = useState(false);

  useEffect(() => { loadItems(); }, [recordId]);

  const loadItems = async () => {
    // Use company_table_records + company_table_values if checklist table exists
    // Otherwise use a simple project_checklist_items table
    const { data } = await supabase
      .from('project_checklist_items')
      .select('*')
      .eq('project_id', recordId)
      .is('deleted_at', null)
      .order('created_at');
    setItems(data || []);
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    setAdding(true);
    const { data } = await supabase
      .from('project_checklist_items')
      .insert({ project_id: recordId, company_id: companyId, title: newTitle.trim() })
      .select()
      .single();
    if (data) setItems(prev => [...prev, data]);
    setNewTitle('');
    setAdding(false);
    setShowInput(false);
  };

  const handleToggle = async (item: ChecklistItem) => {
    await supabase
      .from('project_checklist_items')
      .update({ is_done: !item.is_done })
      .eq('id', item.id);
    setItems(prev => prev.map(i =>
      i.id === item.id ? { ...i, is_done: !i.is_done } : i
    ));
  };

  const handleDelete = async (id: string) => {
    await supabase
      .from('project_checklist_items')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const done = items.filter(i => i.is_done).length;
  const total = items.length;

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="animate-spin text-slate-300" size={20} />
    </div>
  );

  return (
    <div>
      {/* Progress bar */}
      {total > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              Progress
            </p>
            <p className="text-[11px] font-bold text-slate-600">
              {done} / {total}
            </p>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Items */}
      <div className="space-y-2 mb-4">
        {items.length === 0 && !showInput ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <ListChecks size={32} className="text-slate-200" />
            <p className="text-[11px] text-slate-300 font-bold uppercase tracking-widest">
              No checklist items
            </p>
          </div>
        ) : (
          items.map(item => (
            <div
              key={item.id}
              className="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-2xl group hover:border-slate-200 transition-all"
            >
              <button
                onClick={() => handleToggle(item)}
                className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                  item.is_done
                    ? 'bg-emerald-500 border-emerald-500'
                    : 'border-slate-300 hover:border-emerald-400'
                }`}
              >
                {item.is_done && <Check size={11} className="text-white" />}
              </button>
              <span className={`flex-1 text-[13px] font-medium ${
                item.is_done ? 'line-through text-slate-400' : 'text-slate-700'
              }`}>
                {item.title}
              </span>
              {item.due_date && (
                <span className="text-[10px] text-slate-400 shrink-0">
                  {new Date(item.due_date).toLocaleDateString('en-AU')}
                </span>
              )}
              <button
                onClick={() => handleDelete(item.id)}
                className="p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add item */}
      {showInput ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleAdd();
              if (e.key === 'Escape') { setShowInput(false); setNewTitle(''); }
            }}
            placeholder="Task title..."
            className="flex-1 bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-[13px] font-medium outline-none focus:ring-2 focus:ring-indigo-100"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newTitle.trim()}
            className="px-4 py-2.5 bg-slate-900 text-white rounded-full text-[11px] font-bold disabled:opacity-40"
          >
            {adding ? '...' : 'Add'}
          </button>
          <button
            onClick={() => { setShowInput(false); setNewTitle(''); }}
            className="px-4 py-2.5 bg-slate-50 text-slate-500 rounded-full text-[11px] font-bold"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowInput(true)}
          className="flex items-center gap-2 px-4 py-2.5 text-[11px] font-bold text-slate-400 hover:text-indigo-600 transition-colors"
        >
          <Plus size={14} /> Add item
        </button>
      )}
    </div>
  );
}