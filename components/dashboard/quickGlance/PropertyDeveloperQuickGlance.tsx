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
import ProjectTaskProgressBars from "./ProjectTaskProgressBars";
import type { MapPin } from "./ProjectsMapWidget";

// ssr:false -- Leaflet touches window/document at import time.
const ProjectsMapWidget = dynamic(() => import("./ProjectsMapWidget"), { ssr: false });

const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'NT', 'ACT'];

interface PropertyRow {
  id: string;
  street_address: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  lat: number | null;
  lng: number | null;
}

interface ProjectRow {
  id: string;
  name: string;
  properties: PropertyRow[];
}

const pillClass = (active: boolean) =>
  `px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide transition-all ${
    active ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'
  }`;

export default function PropertyDeveloperQuickGlance() {
  const { companyId } = useCompany();
  // finance-model-loans -- see supabase/migrations/20260731310000_niksen_finance_model_v2_tables.sql
  // (project relation field_key 'project') and .../20260801300000_niksen_loans_is_discharged.sql
  // (boolean field_key 'is_discharged').
  const loans = useCustomTable('finance-model-loans');

  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [soldByPropertyId, setSoldByPropertyId] = useState<Map<string, boolean>>(new Map());
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Projects + their linked properties (project_properties junction, the
  // many-to-many source of truth -- see
  // supabase/migrations/20260727035000_project_properties_multi.sql) + each
  // property's "Sold" custom field value.
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      const [{ data: projectRows }, { data: junctionRows }] = await Promise.all([
        supabase.from('projects').select('id, name').eq('company_id', companyId).is('deleted_at', null),
        supabase.from('project_properties').select('project_id, property_id').eq('company_id', companyId),
      ]);

      const propertyIds = [...new Set((junctionRows || []).map((j: any) => j.property_id as string))];
      const { data: propertyRows } = propertyIds.length
        ? await supabase.from('properties').select('id, street_address, suburb, state, postcode, lat, lng').in('id', propertyIds)
        : { data: [] as any[] };
      const propertyById = new Map((propertyRows || []).map((p: any) => [p.id, p as PropertyRow]));

      const propertiesByProject = new Map<string, PropertyRow[]>();
      (junctionRows || []).forEach((j: any) => {
        const prop = propertyById.get(j.property_id);
        if (!prop) return;
        if (!propertiesByProject.has(j.project_id)) propertiesByProject.set(j.project_id, []);
        propertiesByProject.get(j.project_id)!.push(prop);
      });

      // "Sold" custom field -- supabase/migrations/20260805020000_properties_sold_custom_field.sql
      const { data: soldField } = await supabase
        .from('company_custom_fields')
        .select('id')
        .eq('company_id', companyId)
        .eq('table_name', 'properties')
        .eq('field_key', 'sold')
        .is('deleted_at', null)
        .maybeSingle();
      const soldMap = new Map<string, boolean>();
      if (soldField && propertyIds.length) {
        const { data: soldValues } = await supabase
          .from('company_custom_field_values')
          .select('record_id, value_boolean')
          .eq('field_id', soldField.id)
          .in('record_id', propertyIds);
        (soldValues || []).forEach((v: any) => soldMap.set(v.record_id, !!v.value_boolean));
      }

      if (cancelled) return;
      setProjects((projectRows || []).map((p: any) => ({
        id: p.id, name: p.name, properties: propertiesByProject.get(p.id) || [],
      })));
      setSoldByPropertyId(soldMap);
    })();
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
      const allSold = p.properties.length > 0 && p.properties.every(prop => soldByPropertyId.get(prop.id) === true);
      const dischargedFlags = loansByProject.get(p.id) || [];
      const allDischarged = dischargedFlags.length === 0 || dischargedFlags.every(Boolean);
      return !allSold || !allDischarged;
    });
  }, [projects, soldByPropertyId, loansByProject]);

  // Geocode any current project's property missing lat/lng, one at a time
  // (Nominatim's usage policy caps at ~1 req/sec), persisting the result so
  // it's never re-geocoded.
  useEffect(() => {
    const seen = new Set<string>();
    const toGeocode = currentProjects
      .flatMap(p => p.properties)
      .filter(prop => prop.lat == null && prop.street_address && !seen.has(prop.id) && seen.add(prop.id));
    if (!toGeocode.length) return;
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
            setProjects(prev => prev && prev.map(pr => ({
              ...pr,
              properties: pr.properties.map(pp => pp.id === prop.id ? { ...pp, lat, lng } : pp),
            })));
          }
        } catch {
          // Best-effort -- a failed geocode just leaves that property pin-less.
        }
        await new Promise(r => setTimeout(r, 1100));
      }
    })();
    return () => { cancelled = true; };
  }, [currentProjects]);

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
      .filter((prop): prop is PropertyRow & { lat: number; lng: number } => prop.lat != null && prop.lng != null)
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-[540px]">
        <div className="lg:col-span-2 h-full">
          <ProjectsMapWidget pins={pins} onSelect={setSelectedProjectId} />
        </div>
        <div className="lg:col-span-1 h-full overflow-y-auto bg-white border border-slate-200 rounded-2xl divide-y divide-slate-50">
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
