"use client";

// A live map + list of current projects (map+list+expandable task-progress
// cluster kept as ONE widget, not split further -- the task-progress bars
// only make sense inside an expanded row of this same list, so there's no
// sensible standalone "task progress" tile). Was the entire body of
// PropertyDeveloperQuickGlance.tsx before Quick Glance became a movable/
// resizable canvas (see lib/dashboardWidgets/quickGlanceTypes.ts) -- same
// logic, relocated here as one self-fetching, independently addable widget
// instance instead of Property Developer Quick Glance's only content.
// "Current" = not (all linked properties sold) OR not (all linked loans
// discharged) -- see the per-field comments below for where each lives.
import { useEffect, useMemo, useRef, useState } from "react";
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
import ProjectTaskProgressBars from "../ProjectTaskProgressBars";
import type { MapPin } from "../ProjectsMapWidget";

// ssr:false -- Leaflet touches window/document at import time.
const ProjectsMapWidget = dynamic(() => import("../ProjectsMapWidget"), { ssr: false });

const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'NT', 'ACT'];

const pillClass = (active: boolean) =>
  `px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide transition-all ${
    active ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'
  }`;

export default function PropertyProjectsPanelWidget() {
  const { companyId } = useCompany();
  // finance-model-loans -- see supabase/migrations/20260731310000_niksen_finance_model_v2_tables.sql
  // (project relation field_key 'project') and .../20260801300000_niksen_loans_is_discharged.sql
  // (boolean field_key 'is_discharged'). Already covered by
  // prefetchShells.ts's generic per-company-table warmer, so `loans.records`
  // is warm by the time this mounts -- no separate cache needed here.
  const loans = useCustomTable('finance-model-loans');

  // Cache-seeded so a repeat visit (or a first visit after the "shells"
  // bootstrap step warmed it -- see lib/hooks/prefetchQuickGlance.ts) paints
  // the real project count immediately instead of 0-then-jump.
  const [projects, setProjects] = useState<QuickGlanceProjectRow[] | null>(
    () => companyId ? readCache<QuickGlanceProjectRow[]>(quickGlanceProjectsCacheKey(companyId)) : null
  );
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  // Bumped only by a genuine server refetch (never by the geocode effect's
  // own setProjects calls below) -- see that effect's dependency array.
  const [revalidateVersion, setRevalidateVersion] = useState(0);

  // Revalidate in the background -- same shape whether this painted from
  // cache or not, same "stale-while-revalidate" pattern as useCustomTable.ts.
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    fetchQuickGlanceProjects(companyId).then(fresh => {
      if (cancelled) return;
      setProjects(fresh);
      writeCache(quickGlanceProjectsCacheKey(companyId), fresh);
      // Only a genuine server refetch should re-trigger the geocode effect
      // below -- see that effect's own comment for why it doesn't depend
      // on `projects`/`currentProjects` directly.
      setRevalidateVersion(v => v + 1);
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

  // Always holds the latest currentProjects without being a reactive
  // dependency anywhere -- see the geocode effect below for why.
  const currentProjectsRef = useRef(currentProjects);
  useEffect(() => { currentProjectsRef.current = currentProjects; }, [currentProjects]);

  // Geocode any current project's property missing lat/lng, one at a time
  // (Nominatim's usage policy caps at ~1 req/sec), persisting the result
  // (both to properties.lat/lng and this cache) so it's never re-geocoded.
  //
  // Deliberately NOT keyed on `currentProjects` (only on companyId +
  // revalidateVersion, a counter bumped exclusively by a genuine server
  // refetch above): every successful geocode below calls setProjects,
  // which gives `projects` -- and therefore `currentProjects`, a useMemo
  // over it -- a new identity. With `currentProjects` in this effect's own
  // dependency array, that self-triggered update tore this effect down and
  // restarted it after EVERY SINGLE property, and the fresh instance fired
  // its first request immediately (the throttle delay only ran at the END
  // of each loop iteration, not before it) -- defeating the intended ~1
  // req/sec throttle and getting the whole batch rate-limited by Nominatim
  // after the first few properties, so most of a large batch (e.g. 75
  // properties) silently never got pins. Reading the live property list via
  // currentProjectsRef instead means this effect only starts a fresh batch
  // when the project list is genuinely refetched from the server, and its
  // own internal progress no longer restarts itself.
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      // The candidate list is snapshotted once here; each item is then
      // re-checked against the live ref just before its own request (below)
      // so a property that resolves via another path mid-batch (another
      // open tab, a concurrent revalidate) is skipped rather than re-fetched.
      const seen = new Set<string>();
      const toGeocode = currentProjectsRef.current
        .flatMap(p => p.properties)
        .filter(prop => prop.lat == null && prop.street_address && !seen.has(prop.id) && seen.add(prop.id));
      for (const prop of toGeocode) {
        if (cancelled) return;
        // Wait BEFORE each request, not after -- guarantees the throttle is
        // honored even for the very first request for this run.
        await new Promise(r => setTimeout(r, 1100));
        if (cancelled) return;
        const live = currentProjectsRef.current.flatMap(p => p.properties).find(pp => pp.id === prop.id);
        if (!live || live.lat != null) continue; // already resolved since toGeocode was built
        const address = [prop.street_address, prop.suburb, prop.state, prop.postcode, 'Australia'].filter(Boolean).join(', ');
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
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, revalidateVersion]);

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

  // Surfaced so a property missing a pin reads as "still being located"
  // (Nominatim's usage policy caps geocoding at ~1 req/sec, so a project
  // with several properties can take a few seconds to fully populate) --
  // not as a silently broken/missing pin.
  const pendingGeocodeCount = useMemo(() => currentProjects
    .flatMap(p => p.properties)
    .filter(prop => prop.lat == null && prop.street_address).length,
  [currentProjects]);

  if (projects === null) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-slate-400">
        <Loader2 size={14} className="animate-spin" /> Loading Quick Glance…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <p className="flex items-center gap-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">
        {currentProjects.length} current project{currentProjects.length === 1 ? '' : 's'}
        {pendingGeocodeCount > 0 && (
          <span className="flex items-center gap-1 normal-case font-medium text-slate-300">
            <Loader2 size={10} className="animate-spin" />
            locating {pendingGeocodeCount} more propert{pendingGeocodeCount === 1 ? 'y' : 'ies'}…
          </span>
        )}
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
        {/* isolate -- Leaflet's own panes (markers/popups) use z-index up to
            700 internally. Without a containing stacking context here, that
            escapes this div and competes directly with the mobile sidebar's
            z-40/z-50 in the page's root stacking context -- the map was
            rendering on top of the sidebar instead of under it. */}
        <div className="h-[360px] lg:h-auto lg:flex-[2] lg:min-w-0 isolate">
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
