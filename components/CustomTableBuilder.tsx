"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Trash2, Loader2, Check, X, Settings } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { useCustomTables } from "@/lib/hooks/useCustomTables";

const ICON_OPTIONS = [
  'Table2', 'FileText', 'Briefcase', 'Users', 'Home',
  'Car', 'Truck', 'Package', 'ShoppingCart', 'CreditCard',
  'BarChart2', 'PieChart', 'Calendar', 'Clock', 'Globe',
  'Map', 'Layers', 'Database', 'Server', 'Cloud',
];

const COLOR_OPTIONS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6',
];

export default function CustomTableBuilder() {
  const { tables, loading, refetch } = useCustomTables();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('Table2');
  const [newColor, setNewColor] = useState('#6366f1');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [limit, setLimit] = useState<number | null>(null);

  useEffect(() => {
    supabase
      .from('companies')
      .select('max_custom_tables')
      .eq('id', '00000000-0000-0000-0000-000000000000') // placeholder, resolved by RLS
      .single()
      .then(({ data }) => { if (data) setLimit(data.max_custom_tables); });
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');

    const slug = newName.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');

    const { data: { user } } = await supabase.auth.getUser();
    const { data: prof } = await supabase
      .from('profiles').select('active_company_id').eq('id', user?.id).single();

    const { error: err } = await supabase.from('company_tables').insert({
      company_id: prof?.active_company_id,
      name: newName.trim(),
      slug,
      icon: newIcon,
      color: newColor,
      display_order: tables.length,
    });

    setSaving(false);

    if (err) {
      setError(err.message.includes('limit') ? err.message : `Could not create table: ${err.message}`);
      return;
    }

    setCreating(false);
    setNewName('');
    refetch();
  };

  const handleDelete = async (tableId: string, tableName: string) => {
    if (!window.confirm(`Delete "${tableName}"? All records in this table will be permanently deleted.`)) return;
    await supabase.from('company_tables').delete().eq('id', tableId);
    refetch();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-bold text-slate-800">Custom tables</p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {tables.length} table{tables.length !== 1 ? 's' : ''} created
            {limit && ` · ${limit - tables.length} remaining`}
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-full text-[11px] font-bold hover:bg-indigo-700 transition-all"
        >
          <Plus size={13} /> New table
        </button>
      </div>

      {/* Existing tables */}
      <div className="space-y-2">
        {tables.map(table => {
          const Icon = (LucideIcons as any)[table.icon] || LucideIcons.Table2;
          return (
            <div key={table.id} className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-2xl">
              <div
                className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${table.color}20` }}
              >
                <Icon size={16} style={{ color: table.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-slate-800">{table.name}</p>
                <p className="text-[10px] text-slate-400">/dashboard/{table.slug}</p>
              </div>
              <button
                onClick={() => handleDelete(table.id, table.name)}
                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
        {tables.length === 0 && !loading && (
          <p className="text-center text-[11px] text-slate-300 italic py-6">
            No custom tables yet — create one to get started
          </p>
        )}
      </div>

      {/* Create modal */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-6">
          <div className="bg-white rounded-[40px] p-8 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-light uppercase tracking-wide text-slate-900">New table</h3>
              <button onClick={() => setCreating(false)} className="p-2 text-slate-300 hover:text-black">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                  Table name
                </label>
                <input
                  autoFocus
                  value={newName}
                  onChange={e => { setNewName(e.target.value); setError(''); }}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
                  placeholder="e.g. Leases, Clients, Invoices"
                  className="w-full bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-100"
                />
              </div>

              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-2">
                  Icon
                </label>
                <div className="grid grid-cols-10 gap-1.5">
                  {ICON_OPTIONS.map(iconName => {
                    const Icon = (LucideIcons as any)[iconName];
                    return (
                      <button
                        key={iconName}
                        onClick={() => setNewIcon(iconName)}
                        className={`p-2 rounded-xl transition-all ${
                          newIcon === iconName
                            ? 'bg-indigo-100 text-indigo-600'
                            : 'hover:bg-slate-100 text-slate-400'
                        }`}
                      >
                        <Icon size={16} />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-2">
                  Colour
                </label>
                <div className="flex gap-2">
                  {COLOR_OPTIONS.map(color => (
                    <button
                      key={color}
                      onClick={() => setNewColor(color)}
                      className={`w-8 h-8 rounded-full transition-all ${
                        newColor === color ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl">
                {(() => {
                  const Icon = (LucideIcons as any)[newIcon] || LucideIcons.Table2;
                  return (
                    <>
                      <div
                        className="h-8 w-8 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: `${newColor}20` }}
                      >
                        <Icon size={16} style={{ color: newColor }} />
                      </div>
                      <span className="text-[13px] font-bold text-slate-700">
                        {newName || 'Table name'}
                      </span>
                    </>
                  );
                })()}
              </div>

              {error && (
                <p className="text-[11px] text-red-500 font-medium">{error}</p>
              )}

              <button
                onClick={handleCreate}
                disabled={saving || !newName.trim()}
                className="w-full py-3.5 bg-slate-900 text-white rounded-full text-[11px] font-bold uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : 'Create table'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}