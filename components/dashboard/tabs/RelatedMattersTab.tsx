// components/dashboard/tabs/RelatedMattersTab.tsx
// Entities-only tab (see RecordDashboard.tsx) -- every Matter this entity is
// linked to, found by scanning EVERY entity-type company_custom_fields row
// on projects (Client, Debtor, Other Side, ...; these are per-company
// configurable, never a single fixed field), not just one hardcoded field.
// Read-only: unlike SubProjectsTab, there's no sensible "create" action here
// -- a matter gets linked to an entity by editing that field on the matter
// itself, not from the entity's own page.
//
// Also pulls in matters linked via a trust <-> trustee relationship
// (entity_relationships, relationship_type 'Trustee') -- a matter's entity
// field is conventionally set to the TRUSTEE (see
// lib/clientUpdatePageDetail.ts's matching entity_relationships query,
// which looks up the trust FROM a matter-linked trustee id the same
// direction), so viewing the TRUST's own page previously found nothing even
// when its trustee plainly had matters. Checked both directions (this
// entity's trustee(s), and the trust it's a trustee of) since either side
// could in principle be the one a matter is directly linked to.
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Briefcase, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useProgressBarWhile } from "@/components/TopProgressBar";

interface RelatedMatter {
  id: string;
  name: string;
  status: string | null;
  roles: string[];
}

export default function RelatedMattersTab({ recordId }: { recordId: string }) {
  const [matters, setMatters] = useState<RelatedMatter[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useProgressBarWhile(loading);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: linkFields } = await supabase
        .from('company_custom_fields')
        .select('id, label')
        .eq('table_name', 'projects')
        .eq('field_type', 'entity')
        .is('deleted_at', null);
      const fieldIds = (linkFields || []).map(f => f.id);
      if (!fieldIds.length) { if (!cancelled) { setMatters([]); setLoading(false); } return; }

      // This entity's trustee(s) (viewing a trust) and/or the trust it's a
      // trustee of (viewing a trustee) -- see this file's header comment.
      const [{ data: asTrust }, { data: asTrustee }] = await Promise.all([
        supabase.from('entity_relationships').select('child_entity_id')
          .eq('parent_entity_id', recordId).eq('relationship_type', 'Trustee')
          .or('is_current.is.null,is_current.eq.true'),
        supabase.from('entity_relationships').select('parent_entity_id')
          .eq('child_entity_id', recordId).eq('relationship_type', 'Trustee')
          .or('is_current.is.null,is_current.eq.true'),
      ]);
      const relatedEntityIds = new Set<string>([
        ...(asTrust || []).map(r => r.child_entity_id),
        ...(asTrustee || []).map(r => r.parent_entity_id),
      ]);
      const searchIds = [recordId, ...relatedEntityIds];

      const { data: values } = await supabase
        .from('company_custom_field_values')
        .select('record_id, field_id, value_record_id')
        .in('field_id', fieldIds)
        .in('value_record_id', searchIds);
      const projectIds = [...new Set((values || []).map(v => v.record_id))];
      if (!projectIds.length) { if (!cancelled) { setMatters([]); setLoading(false); } return; }

      const labelByFieldId = new Map((linkFields || []).map(f => [f.id, f.label]));
      const rolesByProject = new Map<string, string[]>();
      for (const v of values || []) {
        const label = labelByFieldId.get(v.field_id);
        if (!label) continue;
        // Flag a match found via the trust/trustee relationship rather than
        // a direct link to this exact entity, so it's clear why this
        // matter shows up even though it isn't literally naming this record.
        const roleLabel = v.value_record_id === recordId ? label : `${label} (via trustee)`;
        if (!rolesByProject.has(v.record_id)) rolesByProject.set(v.record_id, []);
        rolesByProject.get(v.record_id)!.push(roleLabel);
      }

      const { data: projects } = await supabase
        .from('projects')
        .select('id, name, status')
        .in('id', projectIds)
        .is('deleted_at', null)
        .order('name');
      if (cancelled) return;
      setMatters((projects || []).map(p => ({ ...p, roles: rolesByProject.get(p.id) || [] })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [recordId]);

  if (loading) return null;

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4">
        {matters.length} matter{matters.length !== 1 ? 's' : ''}
      </p>

      {matters.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Briefcase size={32} className="text-slate-200" />
          <p className="text-[11px] text-slate-300 font-bold uppercase tracking-widest">
            Not linked to any matters yet
          </p>
        </div>
      ) : (
        matters.map(m => (
          <button
            key={m.id}
            onClick={() => router.push(`/dashboard/projects?id=${m.id}`)}
            className="w-full flex items-center gap-4 p-4 bg-white border border-slate-100 rounded-2xl hover:border-indigo-200 hover:bg-indigo-50/20 transition-all text-left group"
          >
            <div className="h-9 w-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
              <Briefcase size={16} className="text-indigo-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold text-slate-800 truncate">{m.name}</p>
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                {m.status && (
                  <p className="text-[10px] text-slate-400 font-medium uppercase">{m.status}</p>
                )}
                {m.roles.map(role => (
                  <span key={role} className="px-2 py-0.5 rounded-full bg-slate-50 text-slate-500 text-[9px] font-bold uppercase tracking-wide">
                    {role}
                  </span>
                ))}
              </div>
            </div>
            <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-400 transition-colors shrink-0" />
          </button>
        ))
      )}
    </div>
  );
}
