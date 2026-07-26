// One-time backfill: add the "Time & Fees" / "Disbursements" record-dashboard
// tabs to every EXISTING project/matter at a company that has those tables
// (installed the Law Firm template), so they don't have to wait for someone
// to reopen each matter for lib/dashboardWidgets/defaultRecordDashboardTabs.ts's
// lazy top-up (wired into components/dashboard/RecordDashboard.tsx's loadTabs)
// to add them. Uses the service_role key directly -- bypasses RLS/the
// prevent_non_admin_delete-style triggers entirely, same as this session's
// earlier verification cleanup.
//
// Run: node scripts/backfill_default_dashboard_tabs.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Mirrors lib/dashboardWidgets/defaultRecordDashboardTabs.ts's specs exactly
// -- kept in sync manually since this is a one-off Node script, not a module
// the app itself imports (see that file's own doc comment for why 'matter'
// is omitted from both field lists).
const SPECS = [
  {
    slug: 'time-fee-entries',
    title: 'Time & Fees',
    icon: 'Clock',
    gridFieldKeys: ['date', 'staff', 'type', 'description', 'rate', 'duration_hours', 'billable', 'amount'],
    quickAddFieldKeys: ['date', 'staff', 'type', 'task_code', 'description', 'activity_code', 'rate', 'duration_hours', 'billable'],
  },
  {
    slug: 'disbursements',
    title: 'Disbursements',
    icon: 'Receipt',
    gridFieldKeys: ['date', 'staff', 'supplier_name', 'description', 'rate', 'quantity', 'gst_inclusive', 'billable', 'amount'],
    quickAddFieldKeys: ['date', 'staff', 'supplier_name', 'expense_code', 'description', 'rate', 'quantity', 'gst_inclusive', 'billable'],
  },
];

function createWidget(type, existingWidgets) {
  const y = existingWidgets.reduce((max, w) => Math.max(max, w.layout.y + w.layout.h), 0);
  const layout = { x: 0, y, w: 12, h: type === 'grid' ? 6 : 2 };
  return { id: crypto.randomUUID(), type, layout, config: { fieldIds: [] } };
}

let companiesTouched = 0, tabsCreated = 0, projectsTouched = 0;

for (const spec of SPECS) {
  const { data: tables, error: tablesErr } = await supabase
    .from('company_tables').select('id, company_id').eq('slug', spec.slug).is('deleted_at', null);
  if (tablesErr) { console.error(`Fetching ${spec.slug} tables:`, tablesErr.message); continue; }

  for (const table of tables ?? []) {
    const { data: fields } = await supabase
      .from('company_table_fields').select('id, field_key').eq('table_id', table.id).is('deleted_at', null);
    const idByKey = new Map((fields ?? []).map(f => [f.field_key, f.id]));
    const resolve = keys => keys.map(k => idByKey.get(k)).filter(Boolean);

    const quickAdd = createWidget('quick_add_form', []);
    quickAdd.config.fieldIds = resolve(spec.quickAddFieldKeys);
    const grid = createWidget('grid', [quickAdd]);
    grid.config.fieldIds = resolve(spec.gridFieldKeys);
    grid.config.showTotalsRow = true;
    const widgets = [quickAdd, grid];

    const { data: projects, error: projErr } = await supabase
      .from('projects').select('id').eq('company_id', table.company_id).is('deleted_at', null);
    if (projErr) { console.error(`Fetching projects for company ${table.company_id}:`, projErr.message); continue; }
    if (!projects?.length) continue;

    let touchedThisCompany = false;
    for (const project of projects) {
      const { data: existing } = await supabase
        .from('record_tabs').select('id').eq('record_id', project.id).eq('record_table', 'projects').eq('linked_table_id', table.id).maybeSingle();
      if (existing) continue; // already has this tab -- idempotent

      const { count: tabCount } = await supabase
        .from('record_tabs').select('id', { head: true, count: 'exact' }).eq('record_id', project.id).eq('record_table', 'projects');

      const { data: newTab, error: insertErr } = await supabase
        .from('record_tabs')
        .insert({
          company_id: table.company_id, record_id: project.id, record_table: 'projects',
          title: spec.title, icon: spec.icon, tab_type: 'custom_dashboard',
          linked_table_id: table.id, display_order: tabCount ?? 0,
        })
        .select('id').single();
      if (insertErr) { console.error(`  project ${project.id}:`, insertErr.message); continue; }

      const { error: widgetsErr } = await supabase
        .from('record_tab_dashboard_widgets')
        .upsert({ tab_id: newTab.id, widgets, updated_at: new Date().toISOString() }, { onConflict: 'tab_id' });
      if (widgetsErr) { console.error(`  widgets for tab ${newTab.id}:`, widgetsErr.message); continue; }

      tabsCreated++;
      touchedThisCompany = true;
      projectsTouched++;
    }
    if (touchedThisCompany) companiesTouched++;
  }
}

console.log(`Done. ${tabsCreated} tab(s) created across ${projectsTouched} matter(s) in ${companiesTouched} company/company-table combo(s).`);
