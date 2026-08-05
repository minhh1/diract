// components/settings/PublicTaskPagesTab.tsx
"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/components/CompanyContext";
import {
  Plus, Copy, Check, Trash2, ExternalLink, X, Pencil,
} from "lucide-react";
import { PUBLIC_TASK_COLUMNS, SCOPE_LABELS } from "@/lib/publicTaskColumns";
import { useProgressBarWhile } from "@/components/TopProgressBar";
import { useCompanyCustomFields } from "@/lib/hooks/useCompanyCustomFields";
import { companyTodayPlusDaysStr } from "@/lib/companyLocalDate";

interface Team { id: string; team_name: string; leader_id: string | null; }
interface Page {
  id: string; title: string; scope: string; teamId: string | null; teamName: string | null;
  columns: string[]; expiresAt: string | null; isActive: boolean;
  createdAt: string; createdBy: string;
}

function defaultExpiry(companyType: string | null | undefined): string {
  return companyTodayPlusDaysStr(30, companyType);
}

// Cached via useQuery so revisiting this tab within staleTime shows the
// last result immediately instead of re-running this whole batch every
// time -- companyId/isAdmin come from CompanyContext (already resolved
// once for the whole dashboard shell), not re-derived here.
async function fetchPublicTaskPagesData(userId: string): Promise<{ allTeams: Team[]; myTeams: Team[]; pages: Page[] }> {
  // teams has no company_id column -- teams aren't scoped to a company in
  // this schema (see components/admin/AdminTeamsTab.tsx, which loads them
  // the same unfiltered way). Independent of the pages fetch, so both run
  // in the same batch instead of one after the other.
  const [{ data: teams }, { data: myMemberships }, res] = await Promise.all([
    supabase.from("teams").select("id, team_name, leader_id").eq("is_active", true).order("team_name"),
    supabase.from("team_members").select("team_id").eq("profile_id", userId),
    fetch("/api/public-tasks/list"),
  ]);
  const json = await res.json();
  const myTeamIds = new Set([
    ...(myMemberships || []).map(m => m.team_id),
    ...(teams || []).filter(t => t.leader_id === userId).map(t => t.id),
  ]);
  return {
    allTeams: teams || [],
    myTeams: (teams || []).filter(t => myTeamIds.has(t.id)),
    pages: json.pages || [],
  };
}

export default function PublicTaskPagesTab() {
  const { userId, isAdmin } = useCompany();
  const [showCreate, setShowCreate] = useState(false);
  const [editingPage, setEditingPage] = useState<Page | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data, isLoading: loading, refetch } = useQuery({
    queryKey: ["public-task-pages", userId],
    queryFn: () => fetchPublicTaskPagesData(userId!),
    enabled: !!userId,
    staleTime: 60 * 1000,
  });
  const allTeams = data?.allTeams ?? [];
  const myTeams = data?.myTeams ?? [];
  const pages = data?.pages ?? [];

  useProgressBarWhile(loading);

  const handleRevoke = async (id: string) => {
    if (!window.confirm("Revoke this page? The link will stop working immediately.")) return;
    await fetch(`/api/public-tasks/${id}/revoke`, { method: "PATCH" });
    refetch();
  };

  const copyLink = (id: string) => {
    const url = `${window.location.origin}/public/tasks/${id}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const teamOptions = isAdmin ? allTeams : myTeams;

  if (loading) return null;

  return (
    <div className="space-y-6 animate-in fade-in">
      <button onClick={() => setShowCreate(true)}
        className="flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white text-[11px] font-bold rounded-full hover:bg-indigo-700 transition-colors">
        <Plus size={14} /> Create public page
      </button>

      <div className="space-y-3">
        {pages.length === 0 && <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest p-12">No public pages yet</p>}
        {pages.map(p => (
          <div key={p.id} className="flex items-center gap-4 p-5 bg-white border border-slate-200 rounded-[24px]">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[13px] font-bold text-slate-800">{p.title}</p>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${p.isActive ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
                  {p.isActive ? "Active" : "Revoked"}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {SCOPE_LABELS[p.scope]}{p.teamName ? ` (${p.teamName})` : ""} · by {p.createdBy}
                {p.expiresAt ? ` · expires ${new Date(p.expiresAt).toLocaleDateString('en-AU')}` : " · no expiry"}
              </p>
            </div>
            {p.isActive && (
              <>
                <button onClick={() => copyLink(p.id)} title="Copy link"
                  className="p-2 text-slate-400 hover:text-indigo-600 transition-colors shrink-0">
                  {copiedId === p.id ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
                </button>
                <a href={`/public/tasks/${p.id}`} target="_blank" rel="noopener noreferrer" title="Open"
                  className="p-2 text-slate-400 hover:text-indigo-600 transition-colors shrink-0">
                  <ExternalLink size={15} />
                </a>
                <button onClick={() => setEditingPage(p)} title="Edit"
                  className="p-2 text-slate-400 hover:text-indigo-600 transition-colors shrink-0">
                  <Pencil size={15} />
                </button>
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
        <EditPageModal page={editingPage} isAdmin={isAdmin} teamOptions={teamOptions} onClose={() => setEditingPage(null)} onSaved={() => { setEditingPage(null); refetch(); }} />
      )}
    </div>
  );
}

function CreatePageModal({ isAdmin, teamOptions, onClose, onCreated }: {
  isAdmin: boolean; teamOptions: Team[]; onClose: () => void; onCreated: () => void;
}) {
  const { companyType } = useCompany();
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState<"self" | "team" | "company">("self");
  const [teamId, setTeamId] = useState("");
  const [columns, setColumns] = useState<string[]>(["project_name", "due_date", "status"]);
  const [noExpiry, setNoExpiry] = useState(false);
  const [expiresAt, setExpiresAt] = useState(defaultExpiry(companyType));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  // "Matter number" is a per-company custom field on Projects (see
  // supabase/template_law_firm_seed.sql's "Matter fields on projects"
  // block) -- not every company has one (a non-Australian-law-firm
  // template company has no such field at all), so it's only offered as a
  // column choice when it actually exists, rather than showing it
  // unconditionally as an option that would just render blank for
  // everyone else.
  const { fields: projectFields } = useCompanyCustomFields('projects');
  const hasMatterNumberField = projectFields.some(f => f.field_key === 'matter_number');
  const availableColumns = PUBLIC_TASK_COLUMNS.filter(c => c.key !== 'matter_number' || hasMatterNumberField);

  const toggleColumn = (key: string) => setColumns(prev => prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]);

  const handleCreate = async () => {
    if (!title.trim()) { setError("Title is required"); return; }
    if (scope === "team" && !teamId) { setError("Select a team"); return; }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/public-tasks/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title, scope, teamId: scope === "team" ? teamId : undefined,
        columns, expiresAt: noExpiry ? null : expiresAt,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setError(json.error || "Failed to create page"); return; }
    setCreatedUrl(`${window.location.origin}/public/tasks/${json.pageId}`);
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
          <button onClick={() => { navigator.clipboard.writeText(createdUrl); }}
            className="w-full py-3 bg-slate-900 text-white text-[12px] font-bold rounded-full hover:bg-slate-700 flex items-center justify-center gap-2">
            <Copy size={13} /> Copy link
          </button>
          <button onClick={onCreated} className="w-full py-3 border border-slate-200 text-slate-600 text-[12px] font-bold rounded-full hover:bg-slate-50">
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
          <h3 className="text-[14px] font-bold text-slate-800 uppercase tracking-wide">Create public page</h3>
          <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-700"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Title</p>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Weekly team tasks"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none focus:border-indigo-400" />
          </div>

          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">What should it show</p>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-2xl cursor-pointer has-[:checked]:border-indigo-400 has-[:checked]:bg-indigo-50">
                <input type="radio" checked={scope === "self"} onChange={() => setScope("self")} />
                <span className="text-[12px] text-slate-700">Just my tasks</span>
              </label>
              {teamOptions.length > 0 && (
                <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-2xl cursor-pointer has-[:checked]:border-indigo-400 has-[:checked]:bg-indigo-50">
                  <input type="radio" checked={scope === "team"} onChange={() => setScope("team")} />
                  <span className="text-[12px] text-slate-700">My team's tasks</span>
                </label>
              )}
              {isAdmin && (
                <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-2xl cursor-pointer has-[:checked]:border-indigo-400 has-[:checked]:bg-indigo-50">
                  <input type="radio" checked={scope === "company"} onChange={() => setScope("company")} />
                  <span className="text-[12px] text-slate-700">Everyone's tasks (admin)</span>
                </label>
              )}
            </div>
          </div>

          {scope === "team" && teamOptions.length > 1 && (
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Team</p>
              <select value={teamId} onChange={e => setTeamId(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none bg-white">
                <option value="">Select team...</option>
                {teamOptions.map(t => <option key={t.id} value={t.id}>{t.team_name}</option>)}
              </select>
            </div>
          )}
          {scope === "team" && teamOptions.length === 1 && (
            (() => { if (teamId !== teamOptions[0].id) setTeamId(teamOptions[0].id); return null; })()
          )}

          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Columns to show</p>
            <div className="flex flex-wrap gap-2">
              {availableColumns.map(c => (
                <button key={c.key} type="button" onClick={() => toggleColumn(c.key)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-medium border transition-colors ${
                    columns.includes(c.key) ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-500 border-slate-200 hover:border-indigo-300"
                  }`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Expiry date <span className="text-indigo-500 normal-case font-normal">(strongly recommended)</span></p>
            <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} disabled={noExpiry}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none disabled:opacity-40" />
            <label className="flex items-center gap-2 mt-2 cursor-pointer">
              <input type="checkbox" checked={noExpiry} onChange={e => setNoExpiry(e.target.checked)} />
              <span className="text-[11px] text-slate-500">No expiry (not recommended, leaves this link open indefinitely)</span>
            </label>
          </div>

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

// Edits an existing page's title/scope/columns/expiry via PATCH
// .../settings. scope/team picker mirrors CreatePageModal's above --
// changing it is a real access-control decision (see that route's own doc
// comment), but the page keeps its existing pageId/URL, so it's an
// in-place edit, not a revoke-and-recreate.
function EditPageModal({ page, isAdmin, teamOptions, onClose, onSaved }: {
  page: Page; isAdmin: boolean; teamOptions: Team[]; onClose: () => void; onSaved: () => void;
}) {
  const { companyType } = useCompany();
  const [title, setTitle] = useState(page.title);
  const [scope, setScope] = useState<"self" | "team" | "company">(page.scope as "self" | "team" | "company");
  const [teamId, setTeamId] = useState(page.teamId || "");
  const [columns, setColumns] = useState<string[]>(page.columns || []);
  const [noExpiry, setNoExpiry] = useState(!page.expiresAt);
  const [expiresAt, setExpiresAt] = useState(page.expiresAt || defaultExpiry(companyType));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // See CreatePageModal's matching comment.
  const { fields: projectFields } = useCompanyCustomFields('projects');
  const hasMatterNumberField = projectFields.some(f => f.field_key === 'matter_number');
  const availableColumns = PUBLIC_TASK_COLUMNS.filter(c => c.key !== 'matter_number' || hasMatterNumberField);

  const toggleColumn = (key: string) => setColumns(prev => prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]);

  const handleSave = async () => {
    if (!title.trim()) { setError("Title is required"); return; }
    if (scope === "team" && !teamId) { setError("Select a team"); return; }
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/public-tasks/${page.id}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title, scope, teamId: scope === "team" ? teamId : undefined,
        columns, expiresAt: noExpiry ? null : expiresAt,
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
          <h3 className="text-[14px] font-bold text-slate-800 uppercase tracking-wide">Edit public page</h3>
          <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-700"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Title</p>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Weekly team tasks"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none focus:border-indigo-400" />
          </div>

          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">What should it show</p>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-2xl cursor-pointer has-[:checked]:border-indigo-400 has-[:checked]:bg-indigo-50">
                <input type="radio" checked={scope === "self"} onChange={() => setScope("self")} />
                <span className="text-[12px] text-slate-700">Just my tasks</span>
              </label>
              {teamOptions.length > 0 && (
                <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-2xl cursor-pointer has-[:checked]:border-indigo-400 has-[:checked]:bg-indigo-50">
                  <input type="radio" checked={scope === "team"} onChange={() => setScope("team")} />
                  <span className="text-[12px] text-slate-700">My team's tasks</span>
                </label>
              )}
              {isAdmin && (
                <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-2xl cursor-pointer has-[:checked]:border-indigo-400 has-[:checked]:bg-indigo-50">
                  <input type="radio" checked={scope === "company"} onChange={() => setScope("company")} />
                  <span className="text-[12px] text-slate-700">Everyone's tasks (admin)</span>
                </label>
              )}
            </div>
          </div>

          {scope === "team" && teamOptions.length > 1 && (
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Team</p>
              <select value={teamId} onChange={e => setTeamId(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none bg-white">
                <option value="">Select team...</option>
                {teamOptions.map(t => <option key={t.id} value={t.id}>{t.team_name}</option>)}
              </select>
            </div>
          )}
          {scope === "team" && teamOptions.length === 1 && (
            (() => { if (teamId !== teamOptions[0].id) setTeamId(teamOptions[0].id); return null; })()
          )}

          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Columns to show</p>
            <div className="flex flex-wrap gap-2">
              {availableColumns.map(c => (
                <button key={c.key} type="button" onClick={() => toggleColumn(c.key)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-medium border transition-colors ${
                    columns.includes(c.key) ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-500 border-slate-200 hover:border-indigo-300"
                  }`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Expiry date</p>
            <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} disabled={noExpiry}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none disabled:opacity-40" />
            <label className="flex items-center gap-2 mt-2 cursor-pointer">
              <input type="checkbox" checked={noExpiry} onChange={e => setNoExpiry(e.target.checked)} />
              <span className="text-[11px] text-slate-500">No expiry (not recommended, leaves this link open indefinitely)</span>
            </label>
          </div>

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
