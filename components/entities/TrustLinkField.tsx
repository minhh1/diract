// components/entities/TrustLinkField.tsx
// "Which trust is this entity trustee for" -- entity_relationships
// (parent_entity_id=trust, child_entity_id=this entity, relationship_type=
// 'Trustee', is_current). Same read/write shape as
// app/api/client-update-pages/[id]/items/[itemId]/trust/route.ts (the
// Client Update Page row-expand's own Trust editor), reused here as a
// direct-Supabase-client version for RecordDashboard.tsx, which has no
// page/item context to route through -- writes go straight onto
// entity_relationships (same table either surface touches), so a link
// made here shows up there too, and vice versa.
"use client";

import { useState, useEffect, useCallback } from "react";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import RelationPicker, { invalidateEntityRelationCache } from "@/components/dashboard/RelationPicker";
import type { PillSize } from "@/lib/dashboardWidgets/pillSize";

export default function TrustLinkField({ entityId, canEdit, size = "sm" }: {
  entityId: string; canEdit: boolean; size?: PillSize;
}) {
  const [loading, setLoading] = useState(true);
  const [trustId, setTrustId] = useState<string | null>(null);
  const [trustName, setTrustName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("entity_relationships")
      .select("parent_entity_id, trust:parent_entity_id(name)")
      .eq("child_entity_id", entityId).eq("relationship_type", "Trustee")
      .or("is_current.is.null,is_current.eq.true")
      .maybeSingle();
    setTrustId((data as any)?.parent_entity_id ?? null);
    setTrustName((data as any)?.trust?.name ?? null);
    setLoading(false);
  }, [entityId]);

  useEffect(() => { load(); }, [load]);

  const setTrust = async (id: string | null, name: string | null) => {
    setSaving(true);
    const { data: existing } = await supabase.from("entity_relationships")
      .select("id").eq("child_entity_id", entityId).eq("relationship_type", "Trustee").maybeSingle();
    if (!id) {
      if (existing) await supabase.from("entity_relationships").delete().eq("id", existing.id);
    } else if (existing) {
      await supabase.from("entity_relationships").update({ parent_entity_id: id, is_current: true }).eq("id", existing.id);
    } else {
      await supabase.from("entity_relationships").insert({ parent_entity_id: id, child_entity_id: entityId, relationship_type: "Trustee", is_current: true });
    }
    setTrustId(id); setTrustName(name);
    // The trust link changes whether this entity's picks-elsewhere show
    // "(as trustee for ...)" -- see RelationPicker's fetchAllSystemTableOptions,
    // which batches this same relationship per candidate and caches it.
    invalidateEntityRelationCache();
    setSaving(false);
  };

  if (loading) return null;

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
        <ShieldCheck size={11} className="text-indigo-400" /> Trust
      </p>
      {canEdit ? (
        <div className="max-w-xs">
          <RelationPicker linkedSystemTable="entities" value={trustId} initialLabel={trustName ?? undefined} allowCreateEntity
            onSelect={(id, label) => setTrust(id, label)} placeholder="No Trust linked" size={size} disabled={saving} />
        </div>
      ) : (
        <p className="text-[11px] text-slate-600">{trustName || <span className="text-slate-300 italic">No Trust linked</span>}</p>
      )}
    </div>
  );
}
