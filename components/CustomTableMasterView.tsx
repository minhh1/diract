"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { supabase } from "@/lib/supabase";
import { createRecord, deleteRecord } from "@/lib/services/customTableService";
import type { CustomTable, } from "@/lib/hooks/useCustomTables";
import type { CustomTableField, CustomTableRecord } from "@/lib/hooks/useCustomTable";

export default function CustomTableMasterView({
  tableDef, fields, records, onRefresh,
}: {
  tableDef: CustomTable;
  fields: CustomTableField[];
  records: CustomTableRecord[];
  onRefresh: () => void;
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const IconComp = (LucideIcons as any)[tableDef.icon] || LucideIcons.Table2;
  const tableFields = fields.filter(f => f.show_in_table);
  const primaryField = fields.find(f => f.field_key === tableDef.primary_field_key) || fields[0];

  const filtered = useMemo(() => {
    if (!search) return records;
    return records.filter(r => {
      const primary = String(r.values[primaryField?.field_key] || '');
      return primary.toLowerCase().includes(search.toLowerCase());
    });
  }, [records, search, primaryField]);

  const handleCreate = async () => {
    setIsCreating(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: prof } = await supabase
      .from('profiles').select('active_company_id').eq('id', user?.id).single();
    const companyId = prof?.active_company_id;
    if (!companyId || !user) { setIsCreating(false); return; }

    const rec = await createRecord(tableDef.id, companyId, user.id, {}, fields);
    setIsCreating(false);
    if (rec) {
      onRefresh();
      router.push(`/dashboard/${tableDef.slug}?id=${rec.id}`);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Archive this record?')) return;
    await deleteRecord(id);
    onRefresh();
  };

  const formatValue = (value: any, field: CustomTableField): string => {
    if (value === null || value === undefined) return '—';
    if (field.field_type === 'boolean') return value ? 'Yes' : 'No';
    if (field.field_type === 'currency') return `$${Number(value).toLocaleString()}`;
    if (field.field_type === 'date') return new Date(value).toLocaleDateString('en-AU');
    return String(value);
  };

  return (
    <div className="flex flex-col h-screen bg-[#F9FAFB] font-sans antialiased text-slate-600 overflow-hidden">
      <header className="bg-white border-b border-slate-100 shrink-0">
        <div className="p-8 pb-4">
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-4">
              <div
                className="h-10 w-10 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: `${tableDef.color}20` }}
              >
                <IconComp size={20} style={{ color: tableDef.color }} />
              </div>
              <h1 className="text-3xl font-light uppercase tracking-tight text-slate-900">
                {tableDef.name}
              </h1>
            </div>
            <button
              onClick={handleCreate}
              disabled={isCreating}
              className="bg-slate-900 text-white px-6 py-2 rounded-full text-[11px] font-bold shadow-sm flex items-center gap-2 disabled:opacity-50"
            >
              <Plus size={14} /> New record
            </button>
          </div>

          <div className="relative mb-6">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
            <input
              placeholder={`Search ${tableDef.name.toLowerCase()}...`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-14 pr-8 text-sm font-medium outline-none focus:ring-8 focus:ring-black/5 transition-all"
            />
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-8">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div
              className="h-16 w-16 rounded-3xl flex items-center justify-center"
              style={{ backgroundColor: `${tableDef.color}15` }}
            >
              <IconComp size={28} style={{ color: tableDef.color }} />
            </div>
            <p className="text-slate-400 text-[11px] uppercase font-bold tracking-widest">
              No records yet
            </p>
            <button
              onClick={handleCreate}
              className="text-indigo-600 text-[11px] font-bold uppercase tracking-widest hover:underline"
            >
              Create first record
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden">
            {/* Table header */}
            <div
              className="grid border-b border-slate-100"
              style={{ gridTemplateColumns: `repeat(${tableFields.length}, 1fr) 80px` }}
            >
              {tableFields.map(f => (
                <div key={f.id} className="px-6 py-4 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                  {f.label}
                </div>
              ))}
              <div />
            </div>

            {/* Rows */}
            {filtered.map(record => {
              const isExpanded = expandedId === record.id;
              const primaryValue = record.values[primaryField?.field_key] || 'Untitled';

              return (
                <div
                  key={record.id}
                  className="border-b border-slate-50 hover:bg-indigo-50/20 transition-all cursor-pointer group"
                  onClick={() => router.push(`/dashboard/${tableDef.slug}?id=${record.id}`)}
                >
                  <div
                    className="grid"
                    style={{ gridTemplateColumns: `repeat(${tableFields.length}, 1fr) 80px` }}
                  >
                    {tableFields.map(f => (
                      <div key={f.id} className="px-6 py-5 text-[13px] font-medium text-slate-700 truncate">
                        {formatValue(record.values[f.field_key], f)}
                      </div>
                    ))}
                    <div className="px-4 py-5 flex items-center justify-end gap-1">
                      <button
                        onClick={e => handleDelete(record.id, e)}
                        className="p-1.5 rounded-full text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}