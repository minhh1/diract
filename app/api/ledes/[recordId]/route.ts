// app/api/ledes/[recordId]/route.ts
// GET -> a LEDES 1998B e-billing file for one invoice record (custom-tables
// engine row on the Law Firm template's Invoices table), built from the time
// entries and disbursements whose `invoice` relation points at it. LEDES
// 1998B is the pipe-delimited, 24-field format US corporate e-billing
// systems ingest; fee lines are timekeeper hours x rate with UTBMS task/
// activity codes, expense lines carry E-codes. Downloaded from
// components/dashboard/LedesExportWidget.tsx.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

const LEDES_HEADER = [
  'INVOICE_DATE', 'INVOICE_NUMBER', 'CLIENT_ID', 'LAW_FIRM_MATTER_ID', 'INVOICE_TOTAL',
  'BILLING_START_DATE', 'BILLING_END_DATE', 'INVOICE_DESCRIPTION', 'LINE_ITEM_NUMBER',
  'EXP/FEE/INV_ADJ_TYPE', 'LINE_ITEM_NUMBER_OF_UNITS', 'LINE_ITEM_ADJUSTMENT_AMOUNT',
  'LINE_ITEM_TOTAL', 'LINE_ITEM_DATE', 'LINE_ITEM_TASK_CODE', 'LINE_ITEM_EXPENSE_CODE',
  'LINE_ITEM_ACTIVITY_CODE', 'TIMEKEEPER_ID', 'LINE_ITEM_DESCRIPTION', 'LAW_FIRM_ID',
  'LINE_ITEM_UNIT_COST', 'TIMEKEEPER_NAME', 'TIMEKEEPER_CLASSIFICATION', 'CLIENT_MATTER_ID',
];

const ledesDate = (iso: any) => (iso ? String(iso).slice(0, 10).replace(/-/g, '') : '');
const ledesText = (v: any) => String(v ?? '').replace(/[|\r\n]/g, ' ').trim();
// Select options store "L110 Fact Investigation/Development" -- the code is
// the leading token.
const ledesCode = (v: any) => ledesText(v).split(' ')[0] || '';
const money = (n: any) => (Number(n) || 0).toFixed(2);

type ValueRow = { record_id: string; field_id: string; value_text: string | null; value_number: number | null; value_date: string | null; value_boolean: boolean | null; value_record_id: string | null };

function hydrate(valueRows: ValueRow[], fieldKeyById: Map<string, string>): Map<string, Record<string, any>> {
  const byRecord = new Map<string, Record<string, any>>();
  for (const v of valueRows) {
    const key = fieldKeyById.get(v.field_id);
    if (!key) continue;
    const rec = byRecord.get(v.record_id) || {};
    rec[key] = v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean ?? v.value_record_id ?? null;
    byRecord.set(v.record_id, rec);
  }
  return byRecord;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ recordId: string }> }) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;
  const { recordId } = await params;

  const { data: invoiceRecord } = await admin
    .from('company_table_records')
    .select('id, table_id')
    .eq('id', recordId).eq('company_id', companyId).is('deleted_at', null)
    .maybeSingle();
  if (!invoiceRecord) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

  const { data: invoiceFields } = await admin
    .from('company_table_fields').select('id, field_key, field_type')
    .eq('table_id', invoiceRecord.table_id).is('deleted_at', null);
  const invoiceKeyById = new Map((invoiceFields || []).map(f => [f.id, f.field_key]));

  const { data: invoiceValueRows } = await admin
    .from('company_table_values')
    .select('record_id, field_id, value_text, value_number, value_date, value_boolean, value_record_id')
    .eq('record_id', recordId);
  const invoice = hydrate((invoiceValueRows || []) as ValueRow[], invoiceKeyById).get(recordId) || {};

  // Child tables = every table with a table_relation field pointing at the
  // invoices table. The template gives two: Time & Fee Entries (has
  // duration_hours -> fee lines) and Disbursements (has expense_code ->
  // expense lines).
  const { data: relationFields } = await admin
    .from('company_table_fields')
    .select('id, table_id, field_key')
    .eq('linked_table_id', invoiceRecord.table_id)
    .eq('field_type', 'table_relation')
    .eq('company_id', companyId)
    .is('deleted_at', null);

  type Line = { type: 'F' | 'E'; date: any; units: number; unitCost: number; total: number; taskCode: string; expenseCode: string; activityCode: string; staffId: string; description: string };
  const lines: Line[] = [];
  const staffIds = new Set<string>();

  for (const rel of relationFields || []) {
    const { data: childFields } = await admin
      .from('company_table_fields').select('id, field_key')
      .eq('table_id', rel.table_id).is('deleted_at', null);
    const childKeyById = new Map((childFields || []).map(f => [f.id, f.field_key]));
    const childKeys = new Set(childKeyById.values());
    const isFeeTable = childKeys.has('duration_hours');

    const { data: links } = await admin
      .from('company_table_values').select('record_id')
      .eq('field_id', rel.id).eq('value_record_id', recordId);
    const childIds = (links || []).map(l => l.record_id);
    if (!childIds.length) continue;

    const { data: aliveRows } = await admin
      .from('company_table_records').select('id')
      .in('id', childIds).is('deleted_at', null);
    const aliveIds = (aliveRows || []).map(r => r.id);
    if (!aliveIds.length) continue;

    const { data: childValueRows } = await admin
      .from('company_table_values')
      .select('record_id, field_id, value_text, value_number, value_date, value_boolean, value_record_id')
      .in('record_id', aliveIds);
    const children = hydrate((childValueRows || []) as ValueRow[], childKeyById);

    for (const [, row] of children) {
      if (row.staff) staffIds.add(String(row.staff));
      if (isFeeTable) {
        const units = Number(row.duration_hours) || 0;
        const unitCost = Number(row.rate) || 0;
        lines.push({
          type: 'F', date: row.date, units, unitCost,
          total: Number(row.amount) || units * unitCost,
          taskCode: ledesCode(row.task_code), expenseCode: '', activityCode: ledesCode(row.activity_code),
          staffId: String(row.staff || ''), description: ledesText(row.description),
        });
      } else {
        const units = Number(row.quantity) || 1;
        const unitCost = Number(row.rate) || 0;
        lines.push({
          type: 'E', date: row.date, units, unitCost,
          total: Number(row.amount) || units * unitCost,
          taskCode: '', expenseCode: ledesCode(row.expense_code), activityCode: '',
          staffId: String(row.staff || ''), description: ledesText(row.description),
        });
      }
    }
  }

  // Resolve display names for the header/timekeeper columns.
  const [{ data: company }, { data: matter }, { data: debtor }, { data: staffRows }] = await Promise.all([
    admin.from('companies').select('name').eq('id', companyId).maybeSingle(),
    invoice.matter ? admin.from('projects').select('id, name').eq('id', invoice.matter).maybeSingle() : Promise.resolve({ data: null }),
    invoice.debtor ? admin.from('entities').select('id, name').eq('id', invoice.debtor).maybeSingle() : Promise.resolve({ data: null }),
    staffIds.size ? admin.from('entities').select('id, name').in('id', [...staffIds]) : Promise.resolve({ data: [] }),
  ]);
  const staffNameById = new Map((staffRows || []).map((s: any) => [s.id, s.name]));

  const invoiceNumber = ledesText(invoice.invoice_number) || recordId.slice(0, 8).toUpperCase();
  const shared = {
    invoiceDate: ledesDate(invoice.issue_date),
    clientId: invoice.debtor ? String(invoice.debtor).slice(0, 8).toUpperCase() : '',
    matterId: invoice.matter ? String(invoice.matter).slice(0, 8).toUpperCase() : '',
    invoiceTotal: money(invoice.total_inc_gst ?? invoice.subtotal),
    start: ledesDate(invoice.period_start) || ledesDate(invoice.issue_date),
    end: ledesDate(invoice.period_end) || ledesDate(invoice.issue_date),
    description: ledesText(`Professional fees and disbursements${matter?.name ? ` — ${matter.name}` : ''}`),
    firmId: ledesText(company?.name),
    clientMatterId: ledesText(matter?.name),
  };

  const rows = lines
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
    .map((line, i) => [
      shared.invoiceDate, invoiceNumber, shared.clientId, shared.matterId, shared.invoiceTotal,
      shared.start, shared.end, shared.description, String(i + 1),
      line.type, String(line.units), '0.00', money(line.total), ledesDate(line.date),
      line.taskCode, line.expenseCode, line.activityCode,
      line.staffId ? line.staffId.slice(0, 8).toUpperCase() : '',
      line.description, shared.firmId, money(line.unitCost),
      ledesText(staffNameById.get(line.staffId)), '', shared.clientMatterId,
    ].join('|') + '[]');

  const content = ['LEDES1998B[]', LEDES_HEADER.join('|') + '[]', ...rows].join('\r\n') + '\r\n';

  return new NextResponse(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${invoiceNumber.replace(/[^\w.-]/g, '_')}.ledes.txt"`,
    },
  });
}

// Note for reviewers: the debtor entity/client-matter ids above are our row
// ids shortened for readability -- real e-billing rollouts replace CLIENT_ID/
// CLIENT_MATTER_ID with the identifiers the client's e-billing system
// assigns. Kept as fields a client can map rather than left blank.
