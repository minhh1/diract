// One-time backfill for the Invoicing feature, complementing
// scripts/backfill_default_dashboard_tabs.mjs (which already created the
// Time & Fees/Disbursements tabs for every existing matter, before
// record_tabs.billing_role existed): (1) tags those already-existing tabs
// with billing_role = 'fee_source', and (2) adds the new "Invoices" tab
// (tab_type: 'invoice_dashboard', billing_role: 'invoices') to every
// existing matter at a company that has an Invoices table. Uses the
// service_role key directly, same as the earlier backfill script.
//
// Run: node scripts/backfill_invoice_tabs_and_billing_roles.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// ── Step 1: tag existing Time & Fees / Disbursements tabs ──────────────
const { data: feeSourceTables } = await supabase
  .from('company_tables').select('id').in('slug', ['time-fee-entries', 'disbursements']).is('deleted_at', null);
const feeSourceTableIds = (feeSourceTables ?? []).map(t => t.id);

let taggedFeeSource = 0;
if (feeSourceTableIds.length) {
  const { data: updated, error } = await supabase
    .from('record_tabs')
    .update({ billing_role: 'fee_source' })
    .in('linked_table_id', feeSourceTableIds)
    .is('billing_role', null)
    .select('id');
  if (error) console.error('Tagging fee-source tabs:', error.message);
  else taggedFeeSource = updated?.length ?? 0;
}

// ── Step 2: tag any already-existing Invoices-linked tabs (shouldn't be
// any yet since the tab_type didn't exist before this feature, but harmless
// if a company_record_tab_defaults entry already created one) ───────────
const { data: invoicesTables } = await supabase
  .from('company_tables').select('id, company_id').eq('slug', 'invoices').is('deleted_at', null);

let taggedInvoices = 0;
if (invoicesTables?.length) {
  const invoicesTableIds = invoicesTables.map(t => t.id);
  const { data: updated, error } = await supabase
    .from('record_tabs')
    .update({ billing_role: 'invoices' })
    .in('linked_table_id', invoicesTableIds)
    .is('billing_role', null)
    .select('id');
  if (error) console.error('Tagging invoices tabs:', error.message);
  else taggedInvoices = updated?.length ?? 0;
}

// ── Step 3: add the Invoices tab to every existing matter that doesn't
// already have one, for companies that have an Invoices table ──────────
let tabsCreated = 0, mattersTouched = 0;

for (const table of invoicesTables ?? []) {
  const { data: projects, error: projErr } = await supabase
    .from('projects').select('id').eq('company_id', table.company_id).is('deleted_at', null);
  if (projErr) { console.error(`Fetching projects for company ${table.company_id}:`, projErr.message); continue; }
  if (!projects?.length) continue;

  for (const project of projects) {
    const { data: existing } = await supabase
      .from('record_tabs').select('id').eq('record_id', project.id).eq('record_table', 'projects').eq('linked_table_id', table.id).maybeSingle();
    if (existing) continue;

    const { count: tabCount } = await supabase
      .from('record_tabs').select('id', { head: true, count: 'exact' }).eq('record_id', project.id).eq('record_table', 'projects');

    const { error: insertErr } = await supabase
      .from('record_tabs')
      .insert({
        company_id: table.company_id, record_id: project.id, record_table: 'projects',
        title: 'Invoices', icon: 'Receipt', tab_type: 'invoice_dashboard',
        linked_table_id: table.id, display_order: tabCount ?? 0, billing_role: 'invoices',
      });
    if (insertErr) { console.error(`  project ${project.id}:`, insertErr.message); continue; }
    tabsCreated++;
    mattersTouched++;
  }
}

console.log(`Tagged ${taggedFeeSource} fee-source tab(s), ${taggedInvoices} pre-existing invoices tab(s).`);
console.log(`Created ${tabsCreated} new Invoices tab(s) across ${mattersTouched} matter(s).`);
