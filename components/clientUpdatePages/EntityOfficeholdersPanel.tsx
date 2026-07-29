// components/clientUpdatePages/EntityOfficeholdersPanel.tsx
// Directors/Secretaries + (for a Corporate Trustee) its Trust link, shown
// inline in an expanded entities-based Client Update Page row -- the
// equivalent of NotesPanel/EmailsPanel for a matter, but for entity-native
// data (entity_officeholders/entity_relationships) rather than page-owned
// data. Talks to app/api/client-update-pages/[id]/items/[itemId]/officeholders
// and .../trust directly rather than going through onSaveValue/values --
// this isn't a "field" edit, it's adding/removing related records, same
// distinction NotesPanel already draws.
"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Plus, Loader2, ShieldCheck } from "lucide-react";
import RelationPicker from "@/components/dashboard/RelationPicker";

interface Officeholder { id: string; full_name: string; role: string; officeholder_entity_id: string | null; }
interface TrustLink { relationshipId: string; trustId: string; trustName: string | null; }

const ROLES = ["Director", "Secretary", "Public Officer", "Shareholder", "Trustee", "Beneficiary", "Other"];

export default function EntityOfficeholdersPanel({ pageId, itemId, canEdit }: {
  pageId: string; itemId: string; canEdit: boolean;
}) {
  const [officeholders, setOfficeholders] = useState<Officeholder[]>([]);
  const [entityType, setEntityType] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [trust, setTrust] = useState<TrustLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingDirector, setAddingDirector] = useState(false);
  const [newDirectorId, setNewDirectorId] = useState<string | null>(null);
  const [newDirectorLabel, setNewDirectorLabel] = useState<string | null>(null);
  const [newDirectorRole, setNewDirectorRole] = useState("Director");
  const [saving, setSaving] = useState(false);

  // Checks both entities.roles (see supabase/migrations/20260729420000_
  // entities_multi_role.sql -- covers an entity holding Corporate/Non
  // Corporate Trustee as an ADDITIONAL role, not just its primary
  // entity_type) and the old exact entity_type match, belt and suspenders.
  const isCorporateTrustee = roles.includes("Corporate Trustee") || roles.includes("Non Corporate Trustee")
    || entityType === "Corporate Trustee" || entityType === "Non Corporate Trustee";

  const load = useCallback(async () => {
    setLoading(true);
    const officeholdersJson = await fetch(`/api/client-update-pages/${pageId}/items/${itemId}/officeholders`).then(r => r.json());
    setOfficeholders(officeholdersJson.officeholders || []);
    setEntityType(officeholdersJson.entityType ?? null);
    const entityRoles: string[] = officeholdersJson.roles || [];
    setRoles(entityRoles);
    if (entityRoles.includes("Corporate Trustee") || entityRoles.includes("Non Corporate Trustee") || officeholdersJson.entityType === "Corporate Trustee" || officeholdersJson.entityType === "Non Corporate Trustee") {
      const trustJson = await fetch(`/api/client-update-pages/${pageId}/items/${itemId}/trust`).then(r => r.json());
      setTrust(trustJson.trust || null);
    }
    setLoading(false);
  }, [pageId, itemId]);

  useEffect(() => { load(); }, [load]);

  const addDirector = async () => {
    if (!newDirectorLabel?.trim() || saving) return;
    setSaving(true);
    const res = await fetch(`/api/client-update-pages/${pageId}/items/${itemId}/officeholders`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ directorEntityId: newDirectorId, fullName: newDirectorLabel, role: newDirectorRole }),
    });
    setSaving(false);
    if (res.ok) {
      setAddingDirector(false); setNewDirectorId(null); setNewDirectorLabel(null); setNewDirectorRole("Director");
      load();
    }
  };

  const removeOfficeholder = async (officeholderId: string) => {
    setSaving(true);
    await fetch(`/api/client-update-pages/${pageId}/items/${itemId}/officeholders/${officeholderId}`, { method: "DELETE" });
    setSaving(false);
    load();
  };

  const setTrustLink = async (trustId: string | null, trustName: string | null) => {
    setSaving(true);
    await fetch(`/api/client-update-pages/${pageId}/items/${itemId}/trust`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trustId, trustName }),
    });
    setSaving(false);
    load();
  };

  if (loading) return <div className="border-t border-slate-100 pt-3"><Loader2 size={14} className="animate-spin text-slate-300" /></div>;

  return (
    <div className="border-t border-slate-100 pt-3 space-y-3">
      <div className="space-y-2">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Directors &amp; Officeholders</p>
        {officeholders.length === 0 && <p className="text-[11px] text-slate-300 italic">None listed</p>}
        <div className="flex flex-wrap gap-1.5">
          {officeholders.map(o => (
            <span key={o.id} className="flex items-center gap-1.5 pl-3 pr-1.5 py-1 bg-slate-50 border border-slate-200 rounded-full text-[11px] text-slate-600">
              {o.full_name} <span className="text-slate-400">· {o.role}</span>
              {canEdit && (
                <button onClick={() => removeOfficeholder(o.id)} disabled={saving} title="Remove" className="text-slate-300 hover:text-red-500 transition-colors">
                  <X size={11} />
                </button>
              )}
            </span>
          ))}
        </div>
        {canEdit && (
          addingDirector ? (
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <div className="min-w-[180px]">
                <RelationPicker linkedSystemTable="entities" value={newDirectorId} allowCreateEntity
                  onSelect={(id, label) => { setNewDirectorId(id); setNewDirectorLabel(label); }}
                  placeholder="Search or add a person..." size="sm" />
              </div>
              <select value={newDirectorRole} onChange={e => setNewDirectorRole(e.target.value)}
                className="text-[11px] border border-slate-200 rounded-full px-2.5 py-1.5 outline-none bg-white">
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <button onClick={addDirector} disabled={!newDirectorLabel?.trim() || saving}
                className="px-3 py-1.5 bg-indigo-600 text-white text-[11px] font-bold rounded-full disabled:opacity-40">
                {saving ? <Loader2 size={12} className="animate-spin" /> : "Add"}
              </button>
              <button onClick={() => { setAddingDirector(false); setNewDirectorId(null); setNewDirectorLabel(null); }}
                className="text-[11px] text-slate-400 hover:text-slate-600">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setAddingDirector(true)} className="flex items-center gap-1 text-[11px] text-indigo-500 hover:text-indigo-700 transition-colors">
              <Plus size={12} /> Add director/officeholder
            </button>
          )
        )}
      </div>

      {isCorporateTrustee && (
        <div className="space-y-2 pt-1">
          <p className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
            <ShieldCheck size={11} className="text-indigo-400" /> Trust
          </p>
          {canEdit ? (
            <div className="max-w-xs">
              <RelationPicker linkedSystemTable="entities" value={trust?.trustId ?? null} initialLabel={trust?.trustName ?? undefined}
                onSelect={(id, label) => setTrustLink(id, label)} placeholder="No Trust linked" size="sm" />
            </div>
          ) : (
            <p className="text-[11px] text-slate-600">{trust?.trustName || <span className="text-slate-300 italic">No Trust linked</span>}</p>
          )}
        </div>
      )}
    </div>
  );
}
