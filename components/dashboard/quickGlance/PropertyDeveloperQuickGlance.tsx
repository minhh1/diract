"use client";

// Property Developer Quick Glance -- a live map of current projects,
// rendered as the main content of the full-page /dashboard/quick-glance
// landing route (see QuickGlanceDashboard.tsx, which owns the page
// header/shell around this). "Current" = not (all linked properties sold)
// OR not (all linked loans discharged) -- see the per-field comments below
// for where each of those lives.
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/components/CompanyContext";
import { useCustomTable } from "@/lib/hooks/useCustomTable";
import { readCache, writeCache } from "@/lib/queryCache";
import {
  fetchQuickGlanceProjects, quickGlanceProjectsCacheKey,
  type QuickGlanceProjectRow, type QuickGlancePropertyRow,
} from "@/lib/hooks/prefetchQuickGlance";
import ProjectTaskProgressBars from "./ProjectTaskProgressBars";
import type { MapPin } from "./ProjectsMapWidget";

// ssr:false -- Leaflet touches window/document at import time.
const ProjectsMapWidget = dynamic(() => import("./ProjectsMapWidget"), { ssr: false });

const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'NT', 'ACT'];

const pillClass = (active: boolean) =>
  `px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide transition-all ${
    active ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'
  }`;

export default function PropertyDeveloperQuickGlance() {
  const { companyId } = useCompany();
  // finance-model-loans -- see supabase/migrations/20260731310000_niksen_finance_model_v2_tables.sql
  // (project relation field_key 'project') and .../20260801300000_niksen_loans_is_discharged.sql
  // (boolean field_key 'is_discharged'). Already covered by
  // prefetchShells.ts's generic per-company-table warmer, so `loans.records`
  // is warm by the time this mounts -- no separate cache needed here.
  const loans = useCustomTable('finance-model-loans');

  // Cache-seeded so a repeat visit (or a first visit after the "shells"
  // bootstrap step warmed it -- see lib/hooks/prefetchQuickGlance.ts) paints
  // the real project count immediately instead of 0-then-jump. `companyId`
  // is guaranteed resolved here: QuickGlanceDashboard.tsx only ever mounts
  // this component once useCompany().loading is false.
  const [projects, setProjects] = useState<QuickGlanceProjectRow[] | null>(
    () => companyId ? readCache<QuickGlanceProjectRow[]>(quickGlanceProjectsCacheKey(companyId)) : null
  );
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Revalidate in the background -- same shape whether this painted from
  // cache or not, same "stale-while-revalidate" pattern as useCustomTable.ts.
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    fetchQuickGlanceProjects(companyId).then(fresh => {
      if (cancelled) return;
      setProjects(fresh);
      writeCache(quickGlanceProjectsCacheKey(companyId), fresh);
    });
    return () => { cancelled = true; };
  }, [companyId]);

  const loansByProject = useMemo(() => {
    const m = new Map<string, boolean[]>();
    for (const r of loans.records) {
      const projectId = String(r.values.project || '');
      if (!projectId) continue;
      if (!m.has(projectId)) m.set(projectId, []);
      m.get(projectId)!.push(!!r.values.is_discharged);
    }
    return m;
  }, [loans.records]);

  // Current = not fully sold OR not all loans discharged. A project with no
  // linked properties is never "sold"; a project with no linked loans is
  // vacuously "all discharged" (loans alone never keep it current).
  const currentProjects = useMemo(() => {
    if (!projects) return [];
    return projects.filter(p => {
      const allSold = p.properties.length > 0 && p.properties.every(prop => prop.sold === true);
      const dischargedFlags = loansByProject.get(p.id) || [];
      const allDischarged = dischargedFlags.length === 0 || dischargedFlags.every(Boolean);
      return !allSold || !allDischarged;
    });
  }, [projects, loansByProject]);

  // Geocode any current project's property missing lat/lng, one at a time
  // (Nominatim's usage policy caps at ~1 req/sec), persisting the result
  // (both to properties.lat/lng and this cache) so it's never re-geocoded.
  useEffect(() => {
    const seen = new Set<string>();
    const toGeocode = currentProjects
      .flatMap(p => p.properties)
      .filter(prop => prop.lat == null && prop.street_address && !seen.has(prop.id) && seen.add(prop.id));
    if (!toGeocode.length || !companyId) return;
    let cancelled = false;
    (async () => {
      for (const prop of toGeocode) {
        if (cancelled) return;
        const address = [prop.street_address, prop.suburb, prop.state, prop.postcode].filter(Boolean).join(', ');
        try {
          const res = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
          const { lat, lng } = await res.json();
          if (!cancelled && lat != null && lng != null) {
            await supabase.from('properties').update({ lat, lng }).eq('id', prop.id);
            setProjects(prev => {
              if (!prev) return prev;
              const next = prev.map(pr => ({
                ...pr,
                properties: pr.properties.map(pp => pp.id === prop.id ? { ...pp, lat, lng } : pp),
              }));
              writeCache(quickGlanceProjectsCacheKey(companyId), next);
              return next;
            });
          }
        } catch {
          // Best-effort -- a failed geocode just leaves that property pin-less.
        }
        await new Promise(r => setTimeout(r, 1100));
      }
    })();
    return () => { cancelled = true; };
  }, [currentProjects, companyId]);

  const availableStates = useMemo(() => {
    const set = new Set<string>();
    currentProjects.forEach(p => p.properties.forEach(prop => { if (prop.state) set.add(prop.state); }));
    return AU_STATES.filter(s => set.has(s));
  }, [currentProjects]);

  const filteredProjects = useMemo(() => {
    if (!stateFilter) return currentProjects;
    return currentProjects.filter(p => p.properties.some(prop => prop.state === stateFilter));
  }, [currentProjects, stateFilter]);

  const pins: MapPin[] = useMemo(() => filteredProjects.flatMap(p =>
    p.properties
      .filter((prop): prop is QuickGlancePropertyRow & { lat: number; lng: number } => prop.lat != null && prop.lng != null)
      .map(prop => ({ id: p.id, name: p.name, lat: prop.lat, lng: prop.lng, isSelected: p.id === selectedProjectId }))
  ), [filteredProjects, selectedProjectId]);

  if (projects === null) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-slate-400">
        <Loader2 size={14} className="animate-spin" /> Loading Quick Glance…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">
        {currentProjects.length} current project{currentProjects.length === 1 ? '' : 's'}
      </p>

      {availableStates.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <button onClick={() => setStateFilter(null)} className={pillClass(stateFilter === null)}>All states</button>
          {availableStates.map(s => (
            <button key={s} onClick={() => setStateFilter(s)} className={pillClass(stateFilter === s)}>{s}</button>
          ))}
        </div>
      )}

      {/* flex, not grid -- with grid-cols-1 on mobile each panel's row
          auto-sizes to content, so the map's h-full resolved against a
          0-height row and Leaflet rendered into a collapsed container
          (invisible, not just small). A fixed height on mobile, handed off
          to flex-stretch once side-by-side on lg+, keeps both panels
          reliably non-zero at every width. */}
      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-[540px]">
        <div className="h-[360px] lg:h-auto lg:flex-[2] lg:min-w-0">
          <ProjectsMapWidget pins={pins} onSelect={setSelectedProjectId} />
        </div>
        <div className="h-[360px] lg:h-auto lg:flex-1 lg:min-w-0 overflow-y-auto bg-white border border-slate-200 rounded-2xl divide-y divide-slate-50">
          {filteredProjects.map(p => (
            <div key={p.id}>
              <button
                onClick={() => setSelectedProjectId(prev => prev === p.id ? null : p.id)}
                className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
              >
                <p className="text-[12px] font-bold text-slate-800 truncate">{p.name}</p>
                <p className="text-[10px] text-slate-400 truncate">
                  {p.properties.map(pr => pr.street_address).filter(Boolean).join(' · ') || 'No linked property'}
                </p>
              </button>
              {selectedProjectId === p.id && (
                <div className="px-4 pb-4">
                  <ProjectTaskProgressBars projectId={p.id} />
                </div>
              )}
            </div>
          ))}
          {filteredProjects.length === 0 && (
            <p className="text-[11px] text-slate-300 italic text-center py-8">No current projects</p>
          )}
        </div>
      </div>
    </div>
  );
}
