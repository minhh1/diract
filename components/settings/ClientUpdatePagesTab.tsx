// components/settings/ClientUpdatePagesTab.tsx
// Admin (and Team Leader/member, for team-scoped pages) management for
// "Detailed table pages" (client_update_pages internally -- see
// lib/clientUpdatePageTableResolver.ts for the generic table support this
// UI drives). Creation flow mirrors components/settings/PublicTaskPagesTab.tsx's
// shape (batched {teams, pages} fetch, teamOptions = isAdmin ? allTeams :
// myTeams, visibility radio, team picker, expiry date + "no expiry"
// checkbox, create -> success view with a copyable link) plus two steps
// neither existing feature has: a table picker and a field picker.
"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/components/CompanyContext";
import { companyTodayPlusDaysStr } from "@/lib/companyLocalDate";
import { useCustomTables } from "@/lib/hooks/useCustomTables";
import {
  Plus, Copy, Check, Trash2, ExternalLink, X, Pencil, RefreshCw, Users, Globe, Settings2, AlertTriangle, Loader2,
} from "lucide-react";
import { useProgressBarWhile } from "@/components/TopProgressBar";

interface Team { id: string; team_name: string; leader_id: string | null; }
interface Page {
  id: string; title: string; client_label: string | null; slug: string;
  access_code: string | null; is_active: boolean; expires_at: string | null;
  matterCount: number; base_table: string; visibility: "public" | "team";
  teamNames: string[]; teamIds: string[];
}

const SYSTEM_TABLE_OPTIONS = [
  { id: "projects", label: "Matters" },
  { id: "entities", label: "Entities" },
  { id: "properties", label: "Properties" },
];

function defaultExpiry(companyType: string | null | undefined): string {
  return companyTodayPlusDaysStr(30, companyType);
}

async function fetchTabData(userId: string): Promise<{ allTeams: Team[]; myTeams: Team[]; pages: Page[] }> {
  const [{ data: teams }, { data: myMemberships }, res] = await Promise.all([
    supabase.from("teams").select("id, team_name, leader_id").eq("is_active", true).order("team_name"),
    supabase.from("team_members").select("team_id").eq("profile_id", userId),
    fetch("/api/client-update-pages/list"),
  ]);
  const json = await res.json();
  const myTeamIds = new Set([
    ...(myMemberships || []).map((m: any) => m.team_id),
    ...(teams || []).filter((t: any) => t.leader_id === userId).map((t: any) => t.id),
  ]);
  return {
    allTeams: teams || [],
    myTeams: (teams || []).filter((t: any) => myTeamIds.has(t.id)),
    pages: json.pages || [],
  };
}

export default function ClientUpdatePagesTab() {
  const { userId, isAdmin } = useCompany();
  const [showCreate, setShowCreate] = useState(false);
  const [editingPage, setEditingPage] = useState<Page | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingPinId, setEditingPinId] = useState<string | null>(null);
  const [pinDraft, setPinDraft] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [savingPin, setSavingPin] = useState(false);
  const [installingIrregularities, setInstallingIrregularities] = useState(false);

  const { data, isLoading: loading, refetch } = useQuery({
    queryKey: ["client-update-pages", userId],
    queryFn: () => fetchTabData(userId!),
    enabled: !!userId,
    staleTime: 30 * 1000,
  });
  const allTeams = data?.allTeams ?? [];
  const myTeams = data?.myTeams ?? [];
  const pages = data?.pages ?? [];
  const teamOptions = isAdmin ? allTeams : myTeams;
  useProgressBarWhile(loading);

  const handleRevoke = async (id: string) => {
    if (!window.confirm("Revoke this page? The link will stop working immediately.")) return;
    await fetch(`/api/client-update-pages/${id}/revoke`, { method: "PATCH" });
    refetch();
  };

  const copyLink = (slug: string, id: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/public/updates/${slug}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const changePin = async (id: string, body: { pin: string } | { regenerate: true }) => {
    setSavingPin(true);
    setPinError(null);
    const res = await fetch(`/api/client-update-pages/${id}/pin`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const json = await res.json();
    setSavingPin(false);
    if (!res.ok) { setPinError(json.error || "Could not update PIN"); return; }
    setEditingPinId(null);
    refetch();
  };

  const installIrregularities = async () => {
    setInstallingIrregularities(true);
    try {
      const res = await fetch("/api/client-update-pages/irregularities/install", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { window.alert(json.error || "Couldn't add the irregularity table"); return; }
      if (json.status === "already_installed") {
        window.alert("This company already has an Irregularity table.");
      } else {
        window.alert(`Irregularity table created. PIN ${json.accessCode}`);
      }
      refetch();
    } finally {
      setInstallingIrregularities(false);
    }
  };

  if (loading) return null;

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white text-[11px] font-bold rounded-full hover:bg-indigo-700 transition-colors">
          <Plus size={14} /> Create detailed table page
        </button>
        <button onClick={installIrregularities} disabled={installingIrregularities}
          title="Auto-flags data-quality issues on Entities/Properties (missing details, invalid TFN, duplicate names, etc.)"
          className="flex items-center gap-2 px-5 py-3 bg-white border border-slate-200 text-slate-600 text-[11px] font-bold rounded-full hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-40 transition-colors">
          {installingIrregularities ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />} Add irregularity table
        </button>
      </div>

      <div className="space-y-3">
        {pages.length === 0 && <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest p-12">No detailed table pages yet</p>}
        {pages.map(p => (
          <div key={p.id} className="flex items-center gap-4 p-5 bg-white border border-slate-200 rounded-[24px]">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[13px] font-bold text-slate-800">{p.title}</p>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${p.is_active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
                  {p.is_active ? "Active" : "Revoked"}
                </span>
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-slate-50 text-slate-500">
                  {p.visibility === "public" ? <><Globe size={9} /> Public</> : <><Users size={9} /> {p.teamNames.join(", ") || "Team-only"}</>}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {p.visibility === "public" && editingPinId === p.id ? (
                  <>
                    <input value={pinDraft} onChange={e => setPinDraft(e.target.value)} autoFocus
                      onKeyDown={e => { if (e.key === "Enter" && pinDraft.trim()) changePin(p.id, { pin: pinDraft.trim() }); if (e.key === "Escape") setEditingPinId(null); }}
                      placeholder="New PIN" className="w-24 px-2 py-0.5 border border-indigo-300 rounded-full text-[11px] outline-none" />
                    <button disabled={savingPin || !pinDraft.trim()} onClick={() => changePin(p.id, { pin: pinDraft.trim() })}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 disabled:opacity-40">Save</button>
                    <button onClick={() => setEditingPinId(null)} className="text-[10px] font-bold text-slate-400 hover:text-slate-600">Cancel</button>
                  </>
                ) : (
                  <>
                    <p className="text-[11px] text-slate-400">
                      {p.matterCount} record{p.matterCount === 1 ? "" : "s"}
                      {p.visibility === "public" ? ` · PIN ${p.access_code}${p.expires_at ? ` · expires ${new Date(p.expires_at).toLocaleDateString('en-AU')}` : " · no expiry"}` : ""}
                    </p>
                    {p.is_active && p.visibility === "public" && (
                      <>
                        <button onClick={() => { setPinDraft(p.access_code || ""); setEditingPinId(p.id); setPinError(null); }} title="Change PIN"
                          className="p-0.5 text-slate-300 hover:text-indigo-600 transition-colors"><Pencil size={11} /></button>
                        <button onClick={() => changePin(p.id, { regenerate: true })} disabled={savingPin} title="Generate a new random PIN"
                          className="p-0.5 text-slate-300 hover:text-indigo-600 transition-colors disabled:opacity-40"><RefreshCw size={11} /></button>
                      </>
                    )}
                  </>
                )}
              </div>
              {editingPinId === p.id && pinError && <p className="text-[10px] text-red-500 mt-0.5">{pinError}</p>}
            </div>
            {p.is_active && (
              <>
                <button onClick={() => copyLink(p.slug, p.id)} title="Copy link"
                  className="p-2 text-slate-400 hover:text-indigo-600 transition-colors shrink-0">
                  {copiedId === p.id ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
                </button>
                <a href={`/public/updates/${p.slug}`} target="_blank" rel="noopener noreferrer" title="Open"
                  className="p-2 text-slate-400 hover:text-indigo-600 transition-colors shrink-0">
                  <ExternalLink size={15} />
                </a>
                {isAdmin && (
                  <button onClick={() => setEditingPage(p)} title="Edit settings"
                    className="p-2 text-slate-400 hover:text-indigo-600 transition-colors shrink-0">
                    <Settings2 size={15} />
                  </button>
                )}
                <button onClick={() => handleRevoke(p.id)} title="Revoke"
                  className="p-2 text-slate-400 hover:text-red-500 transition-colors shrink-0">
                  <Trash2 size={15} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {showCreate && (
        <CreatePageModal isAdmin={isAdmin} teamOptions={teamOptions} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); refetch(); }} />
      )}

      {editingPage && (
        <EditPageModal page={editingPage} teamOptions={teamOptions} onClose={() => setEditingPage(null)} onSaved={() => { setEditingPage(null); refetch(); }} />
      )}
    </div>
  );
}

function CreatePageModal({ isAdmin, teamOptions, onClose, onCreated }: {
  isAdmin: boolean; teamOptions: Team[]; onClose: () => void; onCreated: (id: string) => void;
}) {
  const { tables: customTables, loading: tablesLoading } = useCustomTables();
  const { companyType } = useCompany();

  const [title, setTitle] = useState("");
  const [clientLabel, setClientLabel] = useState("");
  const [slug, setSlug] = useState("");
  const [baseTable, setBaseTable] = useState("");
  const [fieldOptions, setFieldOptions] = useState<{ base: { field_key: string; label: string }[]; custom: { field_key: string; label: string }[] }>({ base: [], custom: [] });
  const [loadingFields, setLoadingFields] = useState(false);
  const [pickedFields, setPickedFields] = useState<{ fieldSource: "base" | "custom"; fieldKey: string; label: string }[]>([]);
  const [visibility, setVisibility] = useState<"public" | "team">("public");
  const [teamIds, setTeamIds] = useState<Set<string>>(new Set());
  const [noExpiry, setNoExpiry] = useState(false);
  const [expiresAt, setExpiresAt] = useState(defaultExpiry(companyType));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const tableOptions = [
    ...SYSTEM_TABLE_OPTIONS,
    ...customTables.filter(t => t.owner_user_id === null).map(t => ({ id: t.id, label: t.name })),
  ];

  useEffect(() => {
    if (!baseTable) { setFieldOptions({ base: [], custom: [] }); setPickedFields([]); return; }
    let active = true;
    (async () => {
      setLoadingFields(true);
      const res = await fetch(`/api/client-update-pages/table-fields?table=${encodeURIComponent(baseTable)}`);
      const json = await res.json();
      if (!active) return;
      setFieldOptions({ base: json.base || [], custom: json.custom || [] });
      setPickedFields([]);
      setLoadingFields(false);
    })();
    return () => { active = false; };
  }, [baseTable]);

  const toggleField = (fieldSource: "base" | "custom", f: { field_key: string; label: string }) => {
    setPickedFields(prev => prev.some(p => p.fieldKey === f.field_key)
      ? prev.filter(p => p.fieldKey !== f.field_key)
      : [...prev, { fieldSource, fieldKey: f.field_key, label: f.label }]);
  };

  const toggleTeam = (id: string) => setTeamIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleCreate = async () => {
    if (!title.trim()) { setError("Title is required"); return; }
    if (!baseTable) { setError("Select a table"); return; }
    if (visibility === "team" && !teamIds.size) { setError("Select at least one team"); return; }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/client-update-pages/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title, clientLabel, slug: slug || title, baseTable, fields: pickedFields,
        visibility, teamIds: visibility === "team" ? [...teamIds] : undefined,
        expiresAt: visibility === "public" && !noExpiry ? expiresAt : null,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setError(json.error || "Failed to create page"); return; }
    setCreatedUrl(`${window.location.origin}/public/updates/${json.page.slug}`);
    setCreatedId(json.page.id);
  };

  if (createdUrl) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
        <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md mx-4 p-8 text-center space-y-4">
          <Check size={32} className="text-emerald-500 mx-auto" />
          <p className="text-[14px] font-bold text-slate-800">Page created</p>
          <div className="px-4 py-3 bg-slate-50 rounded-2xl">
            <code className="text-[11px] text-slate-600 break-all">{createdUrl}</code>
          </div>
          <p className="text-[11px] text-slate-400">
            {visibility === "public"
              ? "Add more records, groups, and columns directly on the page. Open it above, sign in, and you'll see full editing controls."
              : "Only members of the selected team(s), and company admins, can open this page."}
          </p>
          <button onClick={() => { navigator.clipboard.writeText(createdUrl); }}
            className="w-full py-3 bg-slate-900 text-white text-[12px] font-bold rounded-full hover:bg-slate-700 flex items-center justify-center gap-2">
            <Copy size={13} /> Copy link
          </button>
          <button onClick={() => onCreated(createdId!)} className="w-full py-3 border border-slate-200 text-slate-600 text-[12px] font-bold rounded-full hover:bg-slate-50">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-t-[32px] sm:rounded-[32px] shadow-2xl w-full max-w-lg mx-0 sm:mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-8 pt-8 pb-4 border-b border-slate-100 shrink-0">
          <h3 className="text-[14px] font-bold text-slate-800 uppercase tracking-wide">Create detailed table page</h3>
          <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-700"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Title</p>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Niksen: Matter Update"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none focus:border-indigo-400" />
          </div>

          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Table</p>
            <select value={baseTable} onChange={e => setBaseTable(e.target.value)} disabled={tablesLoading}
              className="w-full bg-white border border-slate-200 rounded-full py-2.5 px-4 text-[13px] outline-none appearance-none">
              <option value="">Select a table...</option>
              {tableOptions.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>

          {baseTable && (
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Columns to show</p>
              {loadingFields ? (
                <p className="text-[11px] text-slate-300">Loading fields...</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {fieldOptions.base.map(f => (
                    <button key={f.field_key} type="button" onClick={() => toggleField("base", f)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-medium border transition-colors ${
                        pickedFields.some(p => p.fieldKey === f.field_key) ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-500 border-slate-200 hover:border-indigo-300"
                      }`}>
                      {f.label}
                    </button>
                  ))}
                  {fieldOptions.custom.map(f => (
                    <button key={f.field_key} type="button" onClick={() => toggleField("custom", f)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-medium border transition-colors ${
                        pickedFields.some(p => p.fieldKey === f.field_key) ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-500 border-slate-200 hover:border-indigo-300"
                      }`}>
                      {f.label}
                    </button>
                  ))}
                  {!fieldOptions.base.length && !fieldOptions.custom.length && (
                    <p className="text-[11px] text-slate-300 italic">No fields found on this table</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Who can view this</p>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-2xl cursor-pointer has-[:checked]:border-indigo-400 has-[:checked]:bg-indigo-50">
                <input type="radio" checked={visibility === "public"} onChange={() => setVisibility("public")} />
                <span className="text-[12px] text-slate-700">Public link (anyone with the link + PIN)</span>
              </label>
              <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-2xl cursor-pointer has-[:checked]:border-indigo-400 has-[:checked]:bg-indigo-50">
                <input type="radio" checked={visibility === "team"} onChange={() => setVisibility("team")} />
                <span className="text-[12px] text-slate-700">Team-only (requires sign-in)</span>
              </label>
            </div>
          </div>

          {visibility === "public" && (
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Client label <span className="normal-case font-normal text-slate-300">(optional)</span></p>
              <input value={clientLabel} onChange={e => setClientLabel(e.target.value)} placeholder="e.g. Niksen"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none focus:border-indigo-400" />
            </div>
          )}

          {visibility === "public" && (
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Custom URL <span className="normal-case font-normal text-slate-300">(defaults from title)</span></p>
              <div className="flex items-center gap-1 px-4 py-2.5 border border-slate-200 rounded-full">
                <span className="text-[12px] text-slate-400 shrink-0">/public/updates/</span>
                <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="niksen"
                  className="flex-1 min-w-0 text-[13px] outline-none" />
              </div>
            </div>
          )}

          {visibility === "team" && (
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Teams</p>
              {teamOptions.length === 0 && <p className="text-[11px] text-slate-300 italic">No teams available</p>}
              <div className="space-y-1.5">
                {teamOptions.map(t => (
                  <label key={t.id} className="flex items-center gap-2.5 px-3 py-2 border border-slate-200 rounded-2xl cursor-pointer has-[:checked]:border-indigo-400 has-[:checked]:bg-indigo-50">
                    <input type="checkbox" checked={teamIds.has(t.id)} onChange={() => toggleTeam(t.id)} className="w-4 h-4 accent-indigo-600" />
                    <span className="text-[12px] text-slate-700">{t.team_name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {visibility === "public" && (
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Expiry date <span className="text-indigo-500 normal-case font-normal">(strongly recommended)</span></p>
              <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} disabled={noExpiry}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none disabled:opacity-40" />
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input type="checkbox" checked={noExpiry} onChange={e => setNoExpiry(e.target.checked)} />
                <span className="text-[11px] text-slate-500">No expiry (not recommended, leaves this link open indefinitely)</span>
              </label>
            </div>
          )}

          {visibility === "public" && (
            <p className="text-[11px] text-slate-400">A 6-digit PIN is generated automatically. Clients enter it once and won't be asked again. Signed-in staff never need it.</p>
          )}
          {error && <p className="text-[11px] text-red-500">{error}</p>}
        </div>
        <div className="px-8 py-5 border-t border-slate-100 shrink-0">
          <button onClick={handleCreate} disabled={saving}
            className="w-full py-3 bg-indigo-600 text-white text-[12px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {saving ? "Creating..." : "Create page"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Edits an existing page's title/visibility/team(s)/expiry -- unlike Public
// Task Pages' equivalent (which deliberately treats scope as baked into the
// already-shared URL, not editable), this DOES allow flipping between
// public and team-only after the fact, since the URL itself doesn't change
// either way (still /public/updates/<slug>) -- only who can reach it does.
// No table/field picker here -- changing the underlying table out from
// under a page's existing items/fields isn't something this supports.
function EditPageModal({ page, teamOptions, onClose, onSaved }: {
  page: Page; teamOptions: Team[]; onClose: () => void; onSaved: () => void;
}) {
  const { companyType } = useCompany();
  const [title, setTitle] = useState(page.title);
  const [clientLabel, setClientLabel] = useState(page.client_label || "");
  const [visibility, setVisibility] = useState<"public" | "team">(page.visibility);
  const [teamIds, setTeamIds] = useState<Set<string>>(new Set(page.teamIds));
  const [noExpiry, setNoExpiry] = useState(!page.expires_at);
  const [expiresAt, setExpiresAt] = useState(page.expires_at || defaultExpiry(companyType));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleTeam = (id: string) => setTeamIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleSave = async () => {
    if (!title.trim()) { setError("Title is required"); return; }
    if (visibility === "team" && !teamIds.size) { setError("Select at least one team"); return; }
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/client-update-pages/${page.id}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title, clientLabel, visibility,
        teamIds: visibility === "team" ? [...teamIds] : undefined,
        expiresAt: visibility === "public" && !noExpiry ? expiresAt : null,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setError(json.error || "Failed to save"); return; }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-t-[32px] sm:rounded-[32px] shadow-2xl w-full max-w-lg mx-0 sm:mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-8 pt-8 pb-4 border-b border-slate-100 shrink-0">
          <h3 className="text-[14px] font-bold text-slate-800 uppercase tracking-wide">Edit detailed table page</h3>
          <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-700"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Title</p>
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none focus:border-indigo-400" />
          </div>

          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Who can view this</p>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-2xl cursor-pointer has-[:checked]:border-indigo-400 has-[:checked]:bg-indigo-50">
                <input type="radio" checked={visibility === "public"} onChange={() => setVisibility("public")} />
                <span className="text-[12px] text-slate-700">Public link (anyone with the link + PIN)</span>
              </label>
              <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-2xl cursor-pointer has-[:checked]:border-indigo-400 has-[:checked]:bg-indigo-50">
                <input type="radio" checked={visibility === "team"} onChange={() => setVisibility("team")} />
                <span className="text-[12px] text-slate-700">Team-only (requires sign-in)</span>
              </label>
            </div>
            {visibility !== page.visibility && (
              <p className="text-[10px] text-amber-600 mt-1.5">
                {visibility === "public"
                  ? "Switching to public removes the team restriction. Anyone with the link (and PIN) will be able to open it."
                  : "Switching to team-only immediately revokes the public link. The PIN and expiry stop applying."}
              </p>
            )}
          </div>

          {visibility === "public" && (
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Client label <span className="normal-case font-normal text-slate-300">(optional)</span></p>
              <input value={clientLabel} onChange={e => setClientLabel(e.target.value)} placeholder="e.g. Niksen"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none focus:border-indigo-400" />
            </div>
          )}

          {visibility === "team" && (
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Teams</p>
              {teamOptions.length === 0 && <p className="text-[11px] text-slate-300 italic">No teams available</p>}
              <div className="space-y-1.5">
                {teamOptions.map(t => (
                  <label key={t.id} className="flex items-center gap-2.5 px-3 py-2 border border-slate-200 rounded-2xl cursor-pointer has-[:checked]:border-indigo-400 has-[:checked]:bg-indigo-50">
                    <input type="checkbox" checked={teamIds.has(t.id)} onChange={() => toggleTeam(t.id)} className="w-4 h-4 accent-indigo-600" />
                    <span className="text-[12px] text-slate-700">{t.team_name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {visibility === "public" && (
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Expiry date</p>
              <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} disabled={noExpiry}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none disabled:opacity-40" />
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input type="checkbox" checked={noExpiry} onChange={e => setNoExpiry(e.target.checked)} />
                <span className="text-[11px] text-slate-500">No expiry (not recommended, leaves this link open indefinitely)</span>
              </label>
            </div>
          )}

          {error && <p className="text-[11px] text-red-500">{error}</p>}
        </div>
        <div className="px-8 py-5 border-t border-slate-100 shrink-0">
          <button onClick={handleSave} disabled={saving}
            className="w-full py-3 bg-indigo-600 text-white text-[12px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
