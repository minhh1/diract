// components/admin/AdminDefaultSettingsTab.tsx
// One Admin tab ("Default Settings") covering the 4 "what does a new/
// existing record get by default" questions -- pill-tab switcher at the
// top, same pattern AdminGmailSyncTab.tsx uses for its own sub-sections,
// instead of 4 separate top-level Admin tabs or a sidebar sub-menu.
//
// Scope bar (above the pill switcher): company admins can additionally
// pick a team or a specific person to configure a distinct default for,
// instead of the company-wide one -- see the migration
// 20260729000000_scoped_default_views.sql for the person > team > company
// "most specific wins" resolution this backs (for Default views) and the
// additive company_default_scopes table (for Default tables/dashboards).
// Default tabs (company_record_tab_defaults) isn't scoped -- see
// AdminDefaultTabsTab.tsx's own note.
//
// `restrictToTeamIds` is set when a Team Leader (not a company admin)
// reaches this page (see app/dashboard/admin/page.tsx) -- they get no
// "Company-wide" option and can only pick among their own led team(s), or
// a person who's a member of one of those teams.
"use client";

import { useState, useEffect, useMemo } from "react";
import { Table2, LayoutGrid, LayoutDashboard, Settings, Users, User, Building2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import AdminDefaultViewsTab from "@/components/admin/AdminDefaultViewsTab";
import AdminDefaultTabsTab from "@/components/admin/AdminDefaultTabsTab";
import AdminDefaultTablesTab from "@/components/admin/AdminDefaultTablesTab";
import AdminDefaultDashboardsTab from "@/components/admin/AdminDefaultDashboardsTab";

interface Props {
  companyId: string;
  restrictToTeamIds?: string[];
}

type Section = "views" | "tabs" | "tables" | "dashboards";

// Passed down to every child tab -- exactly one of teamId/userId is set, or
// both null for the company-wide default.
export interface DefaultScope {
  teamId: string | null;
  userId: string | null;
}

interface TeamOption { id: string; team_name: string }
interface PersonOption { id: string; full_name: string | null; email: string | null }

export default function AdminDefaultSettingsTab({ companyId, restrictToTeamIds }: Props) {
  const [section, setSection] = useState<Section>("views");
  const isRestricted = !!restrictToTeamIds;

  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [loadingScopeData, setLoadingScopeData] = useState(true);

  const [scopeKind, setScopeKind] = useState<"company" | "team" | "person">(isRestricted ? "team" : "company");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoadingScopeData(true);
      const { data: teamRows } = await supabase
        .from('teams').select('id, team_name').eq('is_active', true).order('team_name');
      let visibleTeams = (teamRows || []) as TeamOption[];
      if (restrictToTeamIds) {
        const allowed = new Set(restrictToTeamIds);
        visibleTeams = visibleTeams.filter(t => allowed.has(t.id));
      }
      if (!active) return;
      setTeams(visibleTeams);
      setSelectedTeamId(prev => prev ?? visibleTeams[0]?.id ?? null);

      // Person picker candidates: every company member for an admin, or
      // just the members of the leader's own team(s) when restricted.
      let profileIds: string[];
      if (restrictToTeamIds) {
        const { data: tm } = await supabase
          .from('team_members').select('profile_id').in('team_id', restrictToTeamIds);
        profileIds = Array.from(new Set((tm || []).map((r: any) => r.profile_id)));
      } else {
        const { data: ms } = await supabase
          .from('company_memberships').select('user_id').eq('company_id', companyId);
        profileIds = (ms || []).map((m: any) => m.user_id);
      }
      if (!profileIds.length) { if (active) setPeople([]); }
      else {
        const { data: profs } = await supabase
          .from('profiles').select('id, full_name, email').in('id', profileIds);
        if (active) setPeople((profs || []) as PersonOption[]);
      }
      if (active) setLoadingScopeData(false);
    })();
    return () => { active = false; };
  }, [companyId, restrictToTeamIds]);

  const scope: DefaultScope = useMemo(() => ({
    teamId: scopeKind === 'team' ? selectedTeamId : null,
    userId: scopeKind === 'person' ? selectedUserId : null,
  }), [scopeKind, selectedTeamId, selectedUserId]);

  const sections = [
    { id: "views" as const, label: "Default views", icon: Settings },
    { id: "tabs" as const, label: "Default tabs", icon: LayoutGrid },
    { id: "tables" as const, label: "Default tables", icon: Table2 },
    { id: "dashboards" as const, label: "Default dashboards", icon: LayoutDashboard },
  ];

  const scopeLabel = scopeKind === 'company' ? 'Company-wide'
    : scopeKind === 'team' ? teams.find(t => t.id === selectedTeamId)?.team_name || 'a team'
    : people.find(p => p.id === selectedUserId)?.full_name || people.find(p => p.id === selectedUserId)?.email || 'a person';

  return (
    <div className="space-y-5">

      {/* Scope bar */}
      <div className="bg-white border border-slate-200 rounded-[24px] px-5 py-4 space-y-3">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Editing defaults for</p>
        <div className="flex flex-wrap items-center gap-2">
          {!isRestricted && (
            <button
              onClick={() => setScopeKind('company')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                scopeKind === 'company' ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
              }`}
            >
              <Building2 size={12} /> Company-wide
            </button>
          )}
          <button
            onClick={() => setScopeKind('team')}
            disabled={!teams.length}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-bold transition-all disabled:opacity-40 ${
              scopeKind === 'team' ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
            }`}
          >
            <Users size={12} /> Team
          </button>
          {scopeKind === 'team' && (
            <select
              value={selectedTeamId || ''}
              onChange={e => setSelectedTeamId(e.target.value || null)}
              className="px-3 py-1.5 border border-slate-200 rounded-full text-[11px] font-medium outline-none bg-white"
            >
              {teams.map(t => <option key={t.id} value={t.id}>{t.team_name}</option>)}
            </select>
          )}
          <button
            onClick={() => setScopeKind('person')}
            disabled={!people.length}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-bold transition-all disabled:opacity-40 ${
              scopeKind === 'person' ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
            }`}
          >
            <User size={12} /> Person
          </button>
          {scopeKind === 'person' && (
            <select
              value={selectedUserId || ''}
              onChange={e => setSelectedUserId(e.target.value || null)}
              className="px-3 py-1.5 border border-slate-200 rounded-full text-[11px] font-medium outline-none bg-white"
            >
              <option value="">Select a person...</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
            </select>
          )}
        </div>
        {scopeKind !== 'company' && (
          <p className="text-[10px] text-slate-400">
            Changes below save for <span className="font-bold text-slate-600">{scopeLabel}</span> only, and take priority over the company-wide default.
          </p>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {sections.map(s => {
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-bold transition-all ${
                section === s.id
                  ? "bg-slate-900 text-white"
                  : "bg-white border border-slate-200 text-slate-500 hover:border-slate-400"
              }`}
            >
              <Icon size={13} />
              {s.label}
            </button>
          );
        })}
      </div>

      {!loadingScopeData && scopeKind === 'person' && !selectedUserId ? (
        <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest py-10">Select a person above to continue</p>
      ) : !loadingScopeData && (
        <>
          {section === "views" && <AdminDefaultViewsTab companyId={companyId} scope={scope} />}
          {section === "tabs" && <AdminDefaultTabsTab companyId={companyId} scope={scope} />}
          {section === "tables" && <AdminDefaultTablesTab companyId={companyId} scope={scope} />}
          {section === "dashboards" && <AdminDefaultDashboardsTab companyId={companyId} scope={scope} />}
        </>
      )}
    </div>
  );
}
