// components/admin/AdminTeamsTab.tsx
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Users, Plus, X, Crown, Pencil, Check, ShieldCheck, ChevronDown } from "lucide-react";

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface TeamMember {
  profile_id: string;
  is_leader: boolean;
}

interface Team {
  id: string;
  team_name: string;
  leader_id: string | null;
  is_active: boolean;
  members: TeamMember[];
  // Time & Fee Entries/Disbursements permission -- see lib/teamScope.ts's
  // getStaffScopeIds, the '$team_scope' Staff-field sentinel this backs.
  // Off by default: only a company_admin can bill as someone else until an
  // admin explicitly grants a team this.
  allow_time_entry_delegation: boolean;
  // Separate permission -- who can VIEW other staff's time entries (grid,
  // date navigation, summary chart), not who can log time AS them. Backed
  // by the RLS-enforced time_entry_view_scope_ids() (see migration
  // 20260728220000_time_entry_view_scope.sql) -- without this, or admin,
  // a member can only ever see their own entries. Off by default, same
  // reasoning as delegation above.
  allow_time_entry_view: boolean;
  // Tasks permission -- separate domain from time entries (project
  // management vs. billing) and universal (every company has Tasks, unlike
  // Time & Fee Entries), so not gated behind hasTimeEntries below. See
  // migration 20260729010000_task_view_scope.sql's
  // task_visible_to_current_user. Without this, or admin, a member only
  // sees tasks assigned directly to them (plus team-assigned tasks, if
  // includeTeamTasksInScope below is on).
  allow_task_view: boolean;
  // Per-team toggle for what counts as "theirs" for a member who lacks
  // allow_task_view: also tasks assigned to this whole team
  // (tasks.assigned_team_id), not just tasks assigned to them personally.
  // Defaults true in the DB; irrelevant once allow_task_view is on for the
  // same team (they already see everything).
  include_team_tasks_in_scope: boolean;
}

// Every boolean permission column on `teams` lives here, not as its own
// hand-copied <label><input> block in the JSX below -- this list had grown
// to 4 near-identical blocks (2 time-entry, 2 tasks) purely by copy/paste as
// each new domain (billing, then tasks) got its own admin-configurable
// scope, and was on track to keep growing that way with zero structure.
// Adding a future permission (e.g. a documents or invoices scope) is now
// exactly one entry here -- the button/panel below renders whatever's in
// this array and stays correct on its own.
type PermissionKey =
  | 'allow_time_entry_delegation'
  | 'allow_time_entry_view'
  | 'allow_task_view'
  | 'include_team_tasks_in_scope';

interface PermissionDef {
  key: PermissionKey;
  label: string;
  // Omit to always show; return false to hide this permission for a given
  // team/company (e.g. no Time & Fee Entries table, or a sub-option that's
  // moot once its parent permission is already on).
  visible?: (ctx: { team: Team; hasTimeEntries: boolean }) => boolean;
}

const PERMISSION_DEFS: PermissionDef[] = [
  {
    key: 'allow_time_entry_delegation',
    label: 'Allow members to enter time on behalf of other staff',
    visible: ({ hasTimeEntries }) => hasTimeEntries,
  },
  {
    key: 'allow_time_entry_view',
    label: "Allow members to view all staff's time entries",
    visible: ({ hasTimeEntries }) => hasTimeEntries,
  },
  {
    key: 'allow_task_view',
    label: 'Allow members to view all company tasks',
  },
  {
    key: 'include_team_tasks_in_scope',
    label: 'Without the above, members can still see tasks assigned to this team',
    visible: ({ team }) => !team.allow_task_view,
  },
];

interface Props {
  companyId: string;
}

// Module-level cache (survives this component unmounting/remounting as the
// user switches tabs and comes back, e.g. Members -> Teams -> Members ->
// Teams) so re-opening the Teams tab doesn't force a full network refetch.
const CACHE_TTL_MS = 60_000;
const teamsCache = new Map<string, { teams: Team[]; profiles: Profile[]; fetchedAt: number }>();

export default function AdminTeamsTab({ companyId }: Props) {
  const cached = teamsCache.get(companyId);
  const [teams, setTeams]             = useState<Team[]>(cached?.teams || []);
  const [allProfiles, setAllProfiles] = useState<Profile[]>(cached?.profiles || []);
  const [loading, setLoading]         = useState(!cached);
  const [newTeamName, setNewTeamName] = useState('');
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [editName, setEditName]       = useState('');
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [expandedPermissionsTeamId, setExpandedPermissionsTeamId] = useState<string | null>(null);
  // Whether this company has a Time & Fee Entries table at all -- the two
  // checkboxes below (delegation, view-all) only make sense for a company
  // that actually has that concept (currently just the law-firm-seed
  // template). Checking for the table directly, rather than e.g.
  // companies.company_type (a free-text, admin-editable field with no
  // enforced relationship to what tables actually exist), so this stays
  // correct even if a company's tables drift from whatever template it
  // started from.
  const [hasTimeEntries, setHasTimeEntries] = useState(false);

  useEffect(() => {
    const isFresh = cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS;
    if (isFresh) return; // show cached data instantly, skip the refetch
    load();
  }, [companyId]);

  const load = async () => {
    if (!teamsCache.get(companyId)) setLoading(true);

    supabase.from('company_tables').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).eq('slug', 'time-fee-entries').is('deleted_at', null)
      .then(({ count }) => setHasTimeEntries(!!count));

    // Load teams
    const { data: ts } = await supabase
      .from('teams')
      .select('id, team_name, leader_id, is_active, allow_time_entry_delegation, allow_time_entry_view, allow_task_view, include_team_tasks_in_scope')
      .eq('company_id', companyId)
      .order('team_name');

    // Load all company members
    const { data: ms } = await supabase
      .from('company_memberships')
      .select('user_id')
      .eq('company_id', companyId);

    let profs: Profile[] = [];
    if (ms?.length) {
      const { data: pd } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', ms.map((m: any) => m.user_id));
      profs = pd || [];
    }
    setAllProfiles(profs);

    // Load team members (many-to-many via team_members table or profiles.team_id)
    // Using profiles.team_id for now — members can only be in one team this way
    // Switch to team_members join table if multi-team is needed in DB
    const activeTeams: Team[] = (ts || [])
      .filter((t: any) => t.is_active)
      .map((t: any) => ({
        ...t,
        members: profs
          .filter(p => {
            // Check team_id on profile for now
            return false; // will be populated from team_members if available
          })
          .map(p => ({ profile_id: p.id, is_leader: t.leader_id === p.id })),
      }));

    // Load from team_members table (multi-team support)
    const { data: tmRows } = await supabase
      .from('team_members')
      .select('team_id, profile_id');

    if (tmRows) {
      activeTeams.forEach(team => {
        const memberIds = tmRows
          .filter((r: any) => r.team_id === team.id)
          .map((r: any) => r.profile_id);
        team.members = memberIds.map(pid => ({
          profile_id: pid,
          is_leader: team.leader_id === pid,
        }));
      });
    } else {
      // Fallback: use profiles.team_id
      activeTeams.forEach(team => {
        team.members = profs
          .filter((p: any) => (p as any).team_id === team.id)
          .map(p => ({ profile_id: p.id, is_leader: team.leader_id === p.id }));
      });
    }

    setTeams(activeTeams);
    setAllProfiles(profs);
    teamsCache.set(companyId, { teams: activeTeams, profiles: profs, fetchedAt: Date.now() });
    setLoading(false);
  };

  const createTeam = async () => {
    const name = newTeamName.trim();
    if (!name) return;
    setNewTeamName('');
    const { data: created } = await supabase
      .from('teams').insert({ team_name: name, is_active: true, company_id: companyId }).select('id, team_name, leader_id, is_active, allow_time_entry_delegation, allow_time_entry_view, allow_task_view, include_team_tasks_in_scope').single();
    if (created) {
      const newTeam: Team = { ...created, members: [] };
      updateTeams(prev => [...prev, newTeam].sort((a, b) => a.team_name.localeCompare(b.team_name)));
    }
  };

  const renameTeam = (teamId: string) => {
    const name = editName.trim();
    if (!name) return;
    setEditingId(null);
    updateTeams(prev => prev.map(t => t.id === teamId ? { ...t, team_name: name } : t));
    supabase.from('teams').update({ team_name: name }).eq('id', teamId).then();
  };

  const deleteTeam = (teamId: string) => {
    if (!window.confirm('Remove this team?')) return;
    updateTeams(prev => prev.filter(t => t.id !== teamId));
    supabase.from('teams').update({ is_active: false }).eq('id', teamId).then();
  };

  // Applies a local state update and keeps the cache in sync in one step —
  // every mutation below is optimistic (UI updates instantly, the network
  // write happens in the background) so the cache never goes stale relative
  // to what's on screen.
  const updateTeams = (updater: (prev: Team[]) => Team[]) => {
    setTeams(prev => {
      const next = updater(prev);
      teamsCache.set(companyId, { teams: next, profiles: allProfiles, fetchedAt: Date.now() });
      return next;
    });
  };

  const toggleMember = (teamId: string, profileId: string, isMember: boolean) => {
    updateTeams(prev => prev.map(t => {
      if (t.id !== teamId) return t;
      const members = isMember
        ? t.members.filter(m => m.profile_id !== profileId)
        : [...t.members, { profile_id: profileId, is_leader: false }];
      return { ...t, members };
    }));
    if (isMember) {
      supabase.from('team_members').delete().eq('team_id', teamId).eq('profile_id', profileId).then();
    } else {
      supabase.from('team_members')
        .upsert({ team_id: teamId, profile_id: profileId }, { onConflict: 'team_id,profile_id' }).then();
    }
  };

  // Single write path for every permission in PERMISSION_DEFS -- adding a
  // new permission never needs a new toggle function, just a new entry
  // there and this already knows how to read/write it.
  const togglePermission = (teamId: string, key: PermissionKey, next: boolean) => {
    updateTeams(prev => prev.map(t => t.id === teamId ? { ...t, [key]: next } : t));
    supabase.from('teams').update({ [key]: next }).eq('id', teamId).then();
  };

  const setLeader = (teamId: string, profileId: string) => {
    updateTeams(prev => prev.map(t => {
      if (t.id !== teamId) return t;
      return {
        ...t,
        leader_id: profileId,
        members: t.members.map(m => ({ ...m, is_leader: m.profile_id === profileId })),
      };
    }));
    supabase.from('teams').update({ leader_id: profileId }).eq('id', teamId).then();
  };

  const getProfile = (id: string) => allProfiles.find(p => p.id === id);

  if (loading) return <p className="text-[11px] text-slate-400">Loading...</p>;

  return (
    <div className="space-y-6">

      {/* Create team */}
      <div className="bg-white border border-slate-200 rounded-[32px] p-6">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-4">New team</p>
        <div className="flex gap-3">
          <input
            value={newTeamName}
            onChange={e => setNewTeamName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createTeam()}
            placeholder="Team name..."
            className="flex-1 px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none focus:border-indigo-400"
          />
          <button
            onClick={createTeam}
            disabled={!newTeamName.trim()}
            className="px-5 py-2.5 bg-indigo-600 text-white text-[12px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          >
            Create
          </button>
        </div>
      </div>

      {/* Teams */}
      {teams.map(team => (
        <div key={team.id} className="bg-white border border-slate-200 rounded-[32px] overflow-hidden">

          {/* Header */}
          <div className="flex items-center gap-3 px-6 py-4 bg-slate-50 border-b border-slate-100">
            <Users size={14} className="text-indigo-500 shrink-0" />
            {editingId === team.id ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  autoFocus
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') renameTeam(team.id); if (e.key === 'Escape') setEditingId(null); }}
                  className="flex-1 px-3 py-1 border border-indigo-300 rounded-full text-[13px] outline-none"
                />
                <button onClick={() => renameTeam(team.id)} className="p-1.5 bg-indigo-600 text-white rounded-full"><Check size={12} /></button>
                <button onClick={() => setEditingId(null)} className="p-1.5 text-slate-400 hover:text-slate-700"><X size={12} /></button>
              </div>
            ) : (
              <>
                <p className="text-[13px] font-bold text-slate-800 flex-1">{team.team_name}</p>
                <span className="text-[10px] text-slate-400">{team.members.length} member{team.members.length !== 1 ? 's' : ''}</span>
                <button
                  onClick={() => setExpandedTeamId(expandedTeamId === team.id ? null : team.id)}
                  className="p-1.5 text-slate-300 hover:text-indigo-600 transition-colors"
                  title="Add member"
                >
                  <Plus size={13} />
                </button>
                <button
                  onClick={() => { setEditingId(team.id); setEditName(team.team_name); }}
                  className="p-1.5 text-slate-300 hover:text-indigo-600 transition-colors"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => deleteTeam(team.id)}
                  className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                >
                  <X size={13} />
                </button>
              </>
            )}
          </div>

          {/* Permissions -- driven entirely by PERMISSION_DEFS above, so a
              future permission is one entry there, not a new block here. */}
          {(() => {
            const visibleDefs = PERMISSION_DEFS.filter(p => !p.visible || p.visible({ team, hasTimeEntries }));
            const enabledCount = visibleDefs.filter(p => team[p.key]).length;
            const isOpen = expandedPermissionsTeamId === team.id;
            return (
              <div className="border-b border-slate-50">
                <button
                  onClick={() => setExpandedPermissionsTeamId(isOpen ? null : team.id)}
                  className="w-full flex items-center justify-between px-6 py-3 hover:bg-slate-50/50 transition-colors"
                >
                  <span className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
                    <ShieldCheck size={13} className="text-indigo-500" /> Permissions
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
                    {enabledCount} of {visibleDefs.length} enabled
                    <ChevronDown size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </span>
                </button>
                {isOpen && (
                  <div className="px-6 pb-3 space-y-0.5">
                    {visibleDefs.map(p => (
                      <label
                        key={p.key}
                        className="flex items-start gap-2.5 py-2 px-2 -mx-2 rounded-xl cursor-pointer hover:bg-slate-50/50 transition-colors"
                      >
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
          })()}

          {/* Current members */}
          {team.members.map(m => {
            const prof = getProfile(m.profile_id);
            if (!prof) return null;
            return (
              <div key={m.profile_id} className="flex items-center gap-3 px-6 py-3 border-b border-slate-50">
                <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-600 shrink-0">
                  {(prof.full_name || prof.email || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-slate-800 truncate">{prof.full_name || prof.email}</p>
                  {prof.full_name && <p className="text-[10px] text-slate-400 truncate">{prof.email}</p>}
                </div>
                {m.is_leader ? (
                  <span className="flex items-center gap-1 text-[10px] text-amber-500 font-bold shrink-0">
                    <Crown size={11} /> Leader
                  </span>
                ) : (
                  <button
                    onClick={() => setLeader(team.id, m.profile_id)}
                    title="Set as leader"
                    className="p-1 text-slate-300 hover:text-amber-500 transition-colors"
                  >
                    <Crown size={11} />
                  </button>
                )}
                <button
                  onClick={() => toggleMember(team.id, m.profile_id, true)}
                  className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}

          {/* Member checklist — shown when + is clicked */}
          {expandedTeamId === team.id && (
            <div className="px-6 py-3 space-y-1.5 border-t border-slate-100">
                <div className="flex items-center justify-between pb-1">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Add / remove members</p>
                  <button
                    onClick={() => setExpandedTeamId(null)}
                    className="px-3 py-1.5 bg-slate-900 text-white text-[10px] font-bold rounded-full hover:bg-slate-700 transition-colors"
                  >
                    Done
                  </button>
                </div>
                {allProfiles.map(prof => {
                  const isMember = team.members.some(m => m.profile_id === prof.id);
                  return (
                    <button
                      key={prof.id}
                      onClick={() => toggleMember(team.id, prof.id, isMember)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl border text-left transition-colors active:scale-[0.98] ${
                        isMember
                          ? 'bg-indigo-50 border-indigo-200'
                          : 'bg-white border-slate-200 hover:border-indigo-200'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center ${
                        isMember ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'
                      }`}>
                        {isMember && (
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                      <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0">
                        {(prof.full_name || prof.email || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[12px] font-medium truncate ${isMember ? 'text-indigo-800' : 'text-slate-700'}`}>
                          {prof.full_name || prof.email}
                        </p>
                        {prof.full_name && <p className="text-[10px] text-slate-400 truncate">{prof.email}</p>}
                      </div>
                    </button>
                  );
                })}
              </div>
          )}

        </div>
      ))}

    </div>
  );
}