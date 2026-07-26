// One-time backfill for the GST redesign: DEFAULT_PROJECT_DASHBOARD_TAB_SPECS
// (lib/dashboardWidgets/defaultRecordDashboardTabs.ts) now includes the new
// gst_status field in Time & Fees/Disbursements' quick-add + grid widgets,
// but that spec only applies to a tab the FIRST time it's created --
// existing matters' already-materialized record_tab_dashboard_widgets rows
// have a fixed fieldIds array baked in from whenever their tab was built,
// so they need patching directly. Also strips Disbursements' now
// soft-deleted gst_inclusive field id, if present, for hygiene.
//
// Run: node scripts/backfill_gst_status_field_widgets.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: tables } = await supabase
  .from('company_tables').select('id, company_id, slug').in('slug', ['time-fee-entries', 'disbursements']).is('deleted_at', null);

let tabsPatched = 0, widgetsPatched = 0;

for (const table of tables ?? []) {
  const { data: fields } = await supabase
    .from('company_table_fields').select('id, field_key').eq('table_id', table.id).is('deleted_at', null);
  const gstStatusId = fields?.find(f => f.field_key === 'gst_status')?.id;
  const gstInclusiveId = fields?.find(f => f.field_key === 'gst_inclusive')?.id; // should be none -- soft-deleted, but check anyway
  const amountId = fields?.find(f => f.field_key === 'amount')?.id;
  if (!gstStatusId) { console.log(`  no gst_status field on table ${table.id} (${table.slug}) -- skipping`); continue; }

  const { data: tabs } = await supabase
    .from('record_tabs').select('id').eq('linked_table_id', table.id).eq('tab_type', 'custom_dashboard');

  for (const tab of tabs ?? []) {
    const { data: row } = await supabase
      .from('record_tab_dashboard_widgets').select('widgets').eq('tab_id', tab.id).maybeSingle();
    if (!row?.widgets) continue;

    let changed = false;
    const widgets = row.widgets.map(w => {
      if (w.type !== 'quick_add_form' && w.type !== 'grid') return w;
      let ids = (w.config?.fieldIds || []).filter(id => id !== gstInclusiveId);
      if (ids.length !== (w.config?.fieldIds || []).length) changed = true;
      if (!ids.includes(gstStatusId)) {
        const amountIdx = amountId ? ids.indexOf(amountId) : -1;
        ids = amountIdx >= 0 ? [...ids.slice(0, amountIdx), gstStatusId, ...ids.slice(amountIdx)] : [...ids, gstStatusId];
        changed = true;
      }
      return { ...w, config: { ...w.config, fieldIds: ids } };
    });

    if (!changed) continue;
    const { error } = await supabase.from('record_tab_dashboard_widgets').update({ widgets }).eq('tab_id', tab.id);
    if (error) { console.error(`  tab ${tab.id}:`, error.message); continue; }
    tabsPatched++;
    widgetsPatched += widgets.filter(w => w.type === 'quick_add_form' || w.type === 'grid').length;
  }
}

console.log(`Patched ${tabsPatched} tab(s), ${widgetsPatched} widget(s).`);
