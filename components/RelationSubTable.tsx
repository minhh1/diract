"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";
import type { RelationDef } from "@/lib/relationDefinitions";

export default function RelationSubTable({ relation, parentId }: { relation: RelationDef; parentId: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<any[] | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      // Bill tables carry two FK relationships worth embedding directly in
      // the query: property_credential_id (links to property_credentials
      // for account number / access note / payor) and provider_entity_id
      // (links to entities for the service provider's name). Both are
      // optional on the base select() — Supabase returns null for either
      // relationship if the table being queried doesn't have that column,
      // so this is safe to use for non-bill relations too (valuations,
      // officeholders, owned properties) without special-casing per table.
      let query = supabase
        .from(relation.childTable)
        .select(`
          *,
          credential:property_credential_id ( account_number, access_note, nominated_payor ),
          provider_entity:provider_entity_id ( name )
        `)
        .eq(relation.foreignKey, parentId)
        .limit(20);

      if (relation.orderBy) {
        query = query.order(relation.orderBy.column, { ascending: relation.orderBy.ascending ?? true });
      }

      const { data, error } = await query;

      if (error) {
        // Tables without property_credential_id/provider_entity_id columns
        // (e.g. entity_officeholders, owned properties) will reject the
        // embedded select with an error rather than silently returning
        // null for those relationships, since PostgREST validates that
        // the referenced columns actually exist. Fall back to a plain
        // select() for those rather than failing the whole sub-table.
        const { data: fallbackData } = await supabase
          .from(relation.childTable)
          .select('*')
          .eq(relation.foreignKey, parentId)
          .limit(20);
        if (active) setRows(fallbackData || []);
        return;
      }

      if (active) setRows(data || []);
    })();
    return () => { active = false; };
  }, [relation, parentId]);

  if (rows === null) {
    return (
      <div className="flex items-center gap-2 text-slate-400 text-[11px] py-4">
        <Loader2 size={12} className="animate-spin" /> Loading {relation.label.toLowerCase()}...
      </div>
    );
  }

  if (rows.length === 0) {
    return <p className="text-[11px] text-slate-300 italic py-2">No {relation.label.toLowerCase()} on record</p>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100">
      <table className="w-full text-left">
        <thead className="bg-slate-50">
          <tr>
            {relation.columns.map(c => (
              <th key={c.id} className="px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-slate-400 border-b border-slate-100">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const href = relation.linkTo?.(row);
            return (
              <tr
                key={row.id ?? i}
                className={`border-b border-slate-50 last:border-0 ${href ? 'hover:bg-indigo-50/30 cursor-pointer' : ''}`}
                onClick={href ? () => router.push(href) : undefined}
              >
                {relation.columns.map(c => (
                  <td key={c.id} className="px-4 py-2.5 text-[12px] font-medium text-slate-700">
                    {formatCell(resolveCellValue(row, c.id))}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Resolves a column id against a row, handling both plain columns
// (e.g. "amount") and dotted paths into an embedded relation
// (e.g. "credential.account_number", "provider_entity_name" — the
// latter being a special case since the embedded alias is
// "provider_entity" but the column id doesn't repeat that prefix).
function resolveCellValue(row: any, path: string) {
  if (path === 'provider_entity_name') return row.provider_entity?.name ?? null;

  const value = path.split('.').reduce((obj: any, key: string) => obj?.[key], row);
  return typeof value === 'object' ? null : value;
}

function formatCell(value: any) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString();
  if (value === 'half_yearly') return 'Half yearly';
  if (typeof value === 'string' && ['monthly', 'quarterly', 'annually'].includes(value)) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
  return String(value);
}