// components/admin/AdminPermissionsTab.tsx
// One consolidated place for every company-wide access-control setting:
// default project access (who can see a brand-new project -- now actually
// wired up, see supabase/migrations/20260801410000_project_default_access.sql),
// default access for new custom tables/dashboards (resource_permissions'
// company-wide fallback), and per-team permission toggles (same data as
// AdminTeamsTab's own Permissions section -- deliberately duplicated here
// rather than extracted out of that already-large, working component; both
// read/write the same `teams` columns directly so they can't drift out of
// sync with each other, just edited from two possible places).
"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Users, User, ShieldCheck, ChevronDown } from "lucide-react";

type ProjectAccessMode = "all_members" | "specific_teams" | "specific_members";

interface Company {
  id: string;
  project_default_access: ProjectAccessMode;
  restrict_new_tables_dashboards_by_default: boolean;
}

interface Team {
  id: string;
  team_name: string;
  allow_time_entry_delegation: boolean;
  allow_time_entry_view: boolean;
  allow_task_view: boolean;
  include_team_tasks_in_scope: boolean;
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
}

type PermissionKey =
  | "allow_time_entry_delegation"
  | "allow_time_entry_view"
  | "allow_task_view"
  | "include_team_tasks_in_scope";

interface PermissionDef {
  key: PermissionKey;
  label: string;
  visible?: (ctx: { team: Team; hasTimeEntries: boolean }) => boolean;
}

// Mirrors AdminTeamsTab.tsx's own PERMISSION_DEFS exactly -- keep the two in
// sync if a new team-level permission is ever added.
const PERMISSION_DEFS: PermissionDef[] = [
  { key: "allow_time_entry_delegation", label: "Allow members to enter time on behalf of other staff", visible: ({ hasTimeEntries }) => hasTimeEntries },
  { key: "allow_time_entry_view", label: "Allow members to view all staff's time entries", visible: ({ hasTimeEntries }) => hasTimeEntries },
  { key: "allow_task_view", label: "Allow members to view all company tasks" },
  { key: "include_team_tasks_in_scope", label: "Without the above, members can still see tasks assigned to this team", visible: ({ team }) => !team.allow_task_view },
];

interface Props {
  companyId: string;
}

export default function AdminPermissionsTab({ companyId }: Props) {
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<Company | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [allMembers, setAllMembers] = useState<Profile[]>([]);
  const [defaultTeamIds, setDefaultTeamIds] = useState<Set<string>>(new Set());
  const [defaultMemberIds, setDefaultMemberIds] = useState<Set<string>>(new Set());
  const [hasTimeEntries, setHasTimeEntries] = useState(false);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [
      { data: comp },
      { data: teamRows },
      { data: memberships },
      { data: defaultAccessRows },
      { count: timeEntriesCount },
    ] = await Promise.all([
      supabase.from("companies")
        .select("id, project_default_access, restrict_new_tables_dashboards_by_default")
        .eq("id", companyId).single(),
      supabase.from("teams")
        .select("id, team_name, allow_time_entry_delegation, allow_time_entry_view, allow_task_view, include_team_tasks_in_scope")
        .eq("company_id", companyId).eq("is_active", true).order("team_name"),
      supabase.from("company_memberships").select("user_id").eq("company_id", companyId),
      supabase.from("company_project_default_access").select("target_type, target_id").eq("company_id", companyId),
      supabase.from("company_tables").select("id", { count: "exact", head: true })
        .eq("company_id", companyId).eq("slug", "time-fee-entries").is("deleted_at", null),
    ]);

    setCompany(comp as Company);
    setTeams((teamRows || []) as Team[]);
    setHasTimeEntries(!!timeEntriesCount);
    setDefaultTeamIds(new Set((defaultAccessRows || []).filter(r => r.target_type === "team").map(r => r.target_id)));
    setDefaultMemberIds(new Set((defaultAccessRows || []).filter(r => r.target_type === "member").map(r => r.target_id)));

    if (memberships?.length) {
      const { data: profs } = await supabase.from("profiles")
        .select("id, full_name, email").in("id", memberships.map(m => m.user_id));
      setAllMembers(profs || []);
    }
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    // Deferred a tick -- load()'s first line is a setState, and calling it
    // straight from the effect body causes a same-tick cascading render.
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const setProjectAccessMode = async (mode: ProjectAccessMode) => {
    if (!company) return;
    setCompany(c => c && { ...c, project_default_access: mode });
    await supabase.from("companies").update({ project_default_access: mode }).eq("id", companyId);
  };

  const setTableDashboardDefault = async (restrict: boolean) => {
    if (!company) return;
    setCompany(c => c && { ...c, restrict_new_tables_dashboards_by_default: restrict });
    await supabase.from("companies").update({ restrict_new_tables_dashboards_by_default: restrict }).eq("id", companyId);
  };

  const toggleDefaultTeam = async (teamId: string) => {
    const isSet = defaultTeamIds.has(teamId);
    setDefaultTeamIds(prev => {
      const next = new Set(prev);
      if (isSet) next.delete(teamId); else next.add(teamId);
      return next;
    });
    if (isSet) {
      await supabase.from("company_project_default_access").delete()
        .eq("company_id", companyId).eq("target_type", "team").eq("target_id", teamId);
    } else {
      await supabase.from("company_project_default_access")
        .upsert({ company_id: companyId, target_type: "team", target_id: teamId }, { onConflict: "company_id,target_type,target_id" });
    }
  };

  const toggleDefaultMember = async (userId: string) => {
    const isSet = defaultMemberIds.has(userId);
    setDefaultMemberIds(prev => {
      const next = new Set(prev);
      if (isSet) next.delete(userId); else next.add(userId);
      return next;
    });
    if (isSet) {
      await supabase.from("company_project_default_access").delete()
        .eq("company_id", companyId).eq("target_type", "member").eq("target_id", userId);
    } else {
      await supabase.from("company_project_default_access")
        .upsert({ company_id: companyId, target_type: "member", target_id: userId }, { onConflict: "company_id,target_type,target_id" });
    }
  };

  const togglePermission = async (teamId: string, key: PermissionKey, next: boolean) => {
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, [key]: next } : t));
    await supabase.from("teams").update({ [key]: next }).eq("id", teamId);
  };

  if (loading) return <p className="text-[11px] text-slate-400">Loading...</p>;

  return (
    <div className="space-y-4">
      {/* ── Default project access ── */}
      <div className="bg-white border border-slate-200 rounded-[40px] p-8">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-4">Default project access</p>
        <p className="text-[11px] text-slate-500 mb-4">When a new project is created, who can see it by default?</p>
        <div className="space-y-2">
          {([
            { value: "all_members", label: "All company members" },
            { value: "specific_teams", label: "Specific teams only" },
            { value: "specific_members", label: "Specific members only" },
          ] as { value: ProjectAccessMode; label: string }[]).map(opt => (
            <button
              key={opt.value}
              onClick={() => setProjectAccessMode(opt.value)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-all ${
                company?.project_default_access === opt.value ? "bg-indigo-50 border-indigo-200" : "bg-white border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                company?.project_default_access === opt.value ? "border-indigo-500" : "border-slate-300"
              }`}>
                {company?.project_default_access === opt.value && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
              </div>
              <span className={`text-[12px] font-bold ${company?.project_default_access === opt.value ? "text-indigo-800" : "text-slate-700"}`}>{opt.label}</span>
            </button>
          ))}
        </div>

        {company?.project_default_access === "specific_teams" && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">Teams, tick to include</p>
            {teams.length === 0 ? (
              <p className="text-[11px] text-slate-400 italic">No teams yet -- create one below first.</p>
            ) : (
              <div className="space-y-1.5">
                {teams.map(team => {
                  const isChecked = defaultTeamIds.has(team.id);
                  return (
                    <button
                      key={team.id}
                      onClick={() => toggleDefaultTeam(team.id)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl border text-left transition-all ${
                        isChecked ? "bg-indigo-50 border-indigo-200" : "bg-white border-slate-200 hover:border-indigo-200"
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center ${isChecked ? "bg-indigo-600 border-indigo-600" : "border-slate-300"}`}>
                        {isChecked && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                      </div>
                      <Users size={13} className={isChecked ? "text-indigo-500" : "text-slate-400"} />
                      <p className={`text-[12px] font-bold flex-1 ${isChecked ? "text-indigo-800" : "text-slate-700"}`}>{team.team_name}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {company?.project_default_access === "specific_members" && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">Members, tick to include</p>
            {allMembers.length === 0 ? (
              <p className="text-[11px] text-slate-400 italic">No company members found</p>
            ) : (
              <div className="space-y-1.5">
                {allMembers.map(m => {
                  const isChecked = defaultMemberIds.has(m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggleDefaultMember(m.id)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl border text-left transition-all ${
                        isChecked ? "bg-indigo-50 border-indigo-200" : "bg-white border-slate-200 hover:border-indigo-200"
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center ${isChecked ? "bg-indigo-600 border-indigo-600" : "border-slate-300"}`}>
                        {isChecked && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                      </div>
                      <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0">
                        {(m.full_name || m.email || "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[12px] font-medium truncate ${isChecked ? "text-indigo-800" : "text-slate-700"}`}>{m.full_name || m.email}</p>
                      </div>
                      <User size={13} className={isChecked ? "text-indigo-500" : "text-slate-300"} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Default access for custom tables & dashboards ── */}
      <div className="bg-white border border-slate-200 rounded-[40px] p-8">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-4">Default access for new tables &amp; dashboards</p>
        <p className="text-[11px] text-slate-500 mb-4">
          Applies only until someone explicitly assigns roles on a specific table or dashboard (via its own &quot;Manage access&quot;) &mdash; that always takes over regardless of this setting.
        </p>
        <div className="space-y-2">
          {([
            { value: false, label: "Open to the whole company", description: "Today's behaviour -- every custom table/dashboard is visible to all members by default." },
            { value: true, label: "Restricted until roles are assigned", description: "Hidden from everyone except company admins until an admin explicitly grants people access." },
          ] as { value: boolean; label: string; description: string }[]).map(opt => (
            <button
              key={String(opt.value)}
              onClick={() => setTableDashboardDefault(opt.value)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-all ${
                company?.restrict_new_tables_dashboards_by_default === opt.value ? "bg-indigo-50 border-indigo-200" : "bg-white border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                company?.restrict_new_tables_dashboards_by_default === opt.value ? "border-indigo-500" : "border-slate-300"
              }`}>
                {company?.restrict_new_tables_dashboards_by_default === opt.value && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
              </div>
              <div>
                <p className={`text-[12px] font-bold ${company?.restrict_new_tables_dashboards_by_default === opt.value ? "text-indigo-800" : "text-slate-700"}`}>{opt.label}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{opt.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Team permissions ── */}
      <div className="bg-white border border-slate-200 rounded-[40px] p-8">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Team permissions</p>
        <p className="text-[11px] text-slate-500 mb-4">
          Per-team capabilities -- create or rename teams, and manage membership, from Admin &gt; Teams.
        </p>
        {teams.length === 0 ? (
          <p className="text-[11px] text-slate-400 italic">No teams yet.</p>
        ) : (
          <div className="space-y-2">
            {teams.map(team => {
              const visibleDefs = PERMISSION_DEFS.filter(p => !p.visible || p.visible({ team, hasTimeEntries }));
              const enabledCount = visibleDefs.filter(p => team[p.key]).length;
              const isOpen = expandedTeamId === team.id;
              return (
                <div key={team.id} className="border border-slate-100 rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setExpandedTeamId(isOpen ? null : team.id)}
                    className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50/60 transition-colors"
                  >
                    <span className="flex items-center gap-2 text-[12px] font-bold text-slate-700">
                      <ShieldCheck size={13} className="text-indigo-500" /> {team.team_name}
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
                      {enabledCount} of {visibleDefs.length} enabled
                      <ChevronDown size={12} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4 space-y-0.5 border-t border-slate-100 pt-2">
                      {visibleDefs.map(p => (
                        <label key={p.key} className="flex items-start gap-2.5 py-2 px-2 -mx-2 rounded-xl cursor-pointer hover:bg-slate-50/50 transition-colors">
                          <input
                            type="checkbox"
                            checked={!!team[p.key]}
                            onChange={e => togglePermission(team.id, p.key, e.target.checked)}
                            className="w-4 h-4 accent-indigo-600 shrink-0 mt-0.5"
                          />
                          <span className="text-[11px] text-slate-600">{p.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
