// app/api/pay-runs/run/route.ts
// The compute-and-commit engine behind the bespoke "Run Pay" page
// (app/(app)/dashboard/pay-run/page.tsx). GET returns a dry-run preview
// (nothing written) so the review screen can show computed gross/tax/
// super/net before anyone commits to it; POST recomputes the exact same
// thing and actually calls run_employee_payslip() once per employee (see
// supabase/migrations/20260805100000_run_employee_payslip.sql) -- same
// per-item RPC-loop, tolerate-partial-failure shape as
// app/api/time-entries/submit/route.ts, so one employee missing bank
// details doesn't block the rest of the run.
//
// Employees = entities with unconsumed Timesheets hours inside the pay
// run's period (not yet Paid, not yet tagged to a pay run) -- there's no
// separate "who's on this pay run" list to maintain, it falls straight out
// of who logged hours. Gross pay is hours x hourly rate only (no salaried/
// annual-salary path -- Part C didn't seed a salary field on entities, so
// that's out of scope here, not silently guessed at).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember, adminClient } from "@/lib/documentTemplateAuth";
import { calculateWithholding, calculateSuperGuarantee, deriveWeeksFromPeriod } from "@/lib/payroll/calculateWithholding";

type AdminClient = ReturnType<typeof adminClient>;

interface EmployeeLine {
  employeeId: string;
  employeeName: string;
  timesheetIds: string[];
  hours: number;
  hourlyRate: number;
  claimsTaxFreeThreshold: boolean;
  hasHelpDebt: boolean;
  grossPay: number;
  taxWithheld: number;
  superAmount: number;
  netPay: number;
  ytdGross: number;
  ytdTaxWithheld: number;
  ytdSuper: number;
  missingRate: boolean;
}

interface FieldMeta {
  id: string;
  field_key: string;
  field_type: string;
}
interface TableResolution {
  tableId: string;
  fieldByKey: Map<string, FieldMeta>;
}
interface Fail {
  error: string;
}

async function resolveTable(admin: AdminClient, companyId: string, slug: string, requiredKeys: string[]): Promise<TableResolution | Fail> {
  const { data: table } = await admin.from("company_tables").select("id").eq("company_id", companyId).eq("slug", slug).is("deleted_at", null).maybeSingle();
  if (!table) return { error: `${slug} table not found` };
  const { data: fields } = await admin.from("company_table_fields").select("id, field_key, field_type").eq("table_id", table.id).is("deleted_at", null);
  const fieldByKey = new Map<string, FieldMeta>((fields || []).map(f => [f.field_key, f]));
  const missing = requiredKeys.filter(k => !fieldByKey.has(k));
  if (missing.length) return { error: `${slug} table is missing expected field(s): ${missing.join(", ")}` };
  return { tableId: table.id, fieldByKey };
}

interface PayRunInfo extends TableResolution {
  periodStart: string;
  periodEnd: string;
  status: string;
}

async function loadPayRun(admin: AdminClient, companyId: string, payRunId: string): Promise<PayRunInfo | Fail> {
  const resolved = await resolveTable(admin, companyId, "pay-runs", ["period_start", "period_end", "status"]);
  if ("error" in resolved) return resolved;
  const { tableId, fieldByKey } = resolved;

  const { data: record } = await admin.from("company_table_records").select("id").eq("id", payRunId).eq("table_id", tableId).is("deleted_at", null).maybeSingle();
  if (!record) return { error: "Pay run not found" };

  const { data: values } = await admin
    .from("company_table_values")
    .select("field_id, value_date, value_text")
    .eq("record_id", payRunId)
    .in("field_id", [fieldByKey.get("period_start")!.id, fieldByKey.get("period_end")!.id, fieldByKey.get("status")!.id]);

  const periodStart = values?.find(v => v.field_id === fieldByKey.get("period_start")!.id)?.value_date;
  const periodEnd = values?.find(v => v.field_id === fieldByKey.get("period_end")!.id)?.value_date;
  const status = values?.find(v => v.field_id === fieldByKey.get("status")!.id)?.value_text;
  if (!periodStart || !periodEnd) return { error: "Pay run is missing its period dates" };

  return { tableId, fieldByKey, periodStart, periodEnd, status: status || "Draft" };
}

// Sums a numeric-valued field across a set of records in one query -- used
// both for grouping timesheet hours by employee and for YTD payslip totals.
async function sumByEmployee(admin: AdminClient, recordIds: string[], groupFieldId: string, sumFieldId: string): Promise<Map<string, number>> {
  if (!recordIds.length) return new Map();
  const [{ data: groupVals }, { data: sumVals }] = await Promise.all([
    admin.from("company_table_values").select("record_id, value_record_id").eq("field_id", groupFieldId).in("record_id", recordIds),
    admin.from("company_table_values").select("record_id, value_number").eq("field_id", sumFieldId).in("record_id", recordIds),
  ]);
  const groupByRecord = new Map((groupVals || []).map(v => [v.record_id, v.value_record_id as string | null]));
  const sumByRecord = new Map((sumVals || []).map(v => [v.record_id, v.value_number as number | null]));
  const totals = new Map<string, number>();
  for (const id of recordIds) {
    const employeeId = groupByRecord.get(id);
    if (!employeeId) continue;
    totals.set(employeeId, (totals.get(employeeId) || 0) + (sumByRecord.get(id) || 0));
  }
  return totals;
}

interface PayRunComputation {
  lines: EmployeeLine[];
  periodStart: string;
  periodEnd: string;
  payRunTableId: string;
  tsTableId: string;
  tsField: (k: string) => FieldMeta;
}

async function computePayRun(admin: AdminClient, companyId: string, payRunId: string): Promise<PayRunComputation | Fail> {
  const payRun = await loadPayRun(admin, companyId, payRunId);
  if ("error" in payRun) return payRun;
  const { periodStart, periodEnd } = payRun;

  const ts = await resolveTable(admin, companyId, "timesheets", ["employee", "date", "hours_worked", "status", "pay_run"]);
  if ("error" in ts) return ts;
  const tsField = (k: string) => ts.fieldByKey.get(k)!;

  const { data: dateVals } = await admin
    .from("company_table_values")
    .select("record_id")
    .eq("field_id", tsField("date").id)
    .gte("value_date", periodStart)
    .lte("value_date", periodEnd);
  const candidateIds = (dateVals || []).map(v => v.record_id as string);

  let eligibleIds: string[] = [];
  if (candidateIds.length) {
    const [{ data: statusVals }, { data: payRunVals }] = await Promise.all([
      admin.from("company_table_values").select("record_id, value_text").eq("field_id", tsField("status").id).in("record_id", candidateIds),
      admin.from("company_table_values").select("record_id, value_record_id").eq("field_id", tsField("pay_run").id).in("record_id", candidateIds),
    ]);
    const statusByRecord = new Map((statusVals || []).map(v => [v.record_id, v.value_text]));
    const payRunByRecord = new Map((payRunVals || []).map(v => [v.record_id, v.value_record_id]));
    eligibleIds = candidateIds.filter(id => statusByRecord.get(id) !== "Paid" && !payRunByRecord.get(id));
  }

  if (!eligibleIds.length) return { lines: [] as EmployeeLine[], periodStart, periodEnd, payRunTableId: payRun.tableId, tsTableId: ts.tableId, tsField };

  const [{ data: employeeVals }, { data: hoursVals }] = await Promise.all([
    admin.from("company_table_values").select("record_id, value_record_id").eq("field_id", tsField("employee").id).in("record_id", eligibleIds),
    admin.from("company_table_values").select("record_id, value_number").eq("field_id", tsField("hours_worked").id).in("record_id", eligibleIds),
  ]);
  const employeeByRecord = new Map((employeeVals || []).map(v => [v.record_id, v.value_record_id as string | null]));
  const hoursByRecord = new Map((hoursVals || []).map(v => [v.record_id, v.value_number as number | null]));

  const byEmployee = new Map<string, { timesheetIds: string[]; hours: number }>();
  for (const id of eligibleIds) {
    const employeeId = employeeByRecord.get(id);
    if (!employeeId) continue;
    const entry = byEmployee.get(employeeId) || { timesheetIds: [], hours: 0 };
    entry.timesheetIds.push(id);
    entry.hours += hoursByRecord.get(id) || 0;
    byEmployee.set(employeeId, entry);
  }

  const employeeIds = [...byEmployee.keys()];
  const { data: entityRows } = await admin.from("entities").select("id, name, default_rate").in("id", employeeIds);
  const entityById = new Map((entityRows || []).map(e => [e.id, e]));

  const { data: payrollCustomFields } = await admin
    .from("company_custom_fields")
    .select("id, field_key")
    .eq("company_id", companyId)
    .eq("table_name", "entities")
    .in("field_key", ["tax_free_threshold_claimed", "has_help_debt"]);
  const thresholdFieldId = payrollCustomFields?.find(f => f.field_key === "tax_free_threshold_claimed")?.id;
  const helpFieldId = payrollCustomFields?.find(f => f.field_key === "has_help_debt")?.id;

  const [{ data: thresholdVals }, { data: helpVals }] = await Promise.all([
    thresholdFieldId
      ? admin.from("company_custom_field_values").select("record_id, value_boolean").eq("field_id", thresholdFieldId).in("record_id", employeeIds)
      : Promise.resolve({ data: [] as { record_id: string; value_boolean: boolean | null }[] }),
    helpFieldId
      ? admin.from("company_custom_field_values").select("record_id, value_boolean").eq("field_id", helpFieldId).in("record_id", employeeIds)
      : Promise.resolve({ data: [] as { record_id: string; value_boolean: boolean | null }[] }),
  ]);
  const thresholdByEmployee = new Map((thresholdVals || []).map(v => [v.record_id, !!v.value_boolean]));
  const helpByEmployee = new Map((helpVals || []).map(v => [v.record_id, !!v.value_boolean]));

  // FY-to-date payslip totals -- Australian financial year starts 1 July.
  // "This period's FY" is derived from periodStart, not "today", so
  // back-processing a period from an earlier FY still sums the right window.
  const periodStartDate = new Date(`${periodStart}T00:00:00Z`);
  const fyStartYear = periodStartDate.getUTCMonth() >= 6 ? periodStartDate.getUTCFullYear() : periodStartDate.getUTCFullYear() - 1;
  const fyStart = `${fyStartYear}-07-01`;

  const payslips = await resolveTable(admin, companyId, "payslips", ["employee", "period_start", "gross_pay", "tax_withheld", "super_amount"]);
  let ytdGrossByEmployee = new Map<string, number>();
  let ytdTaxByEmployee = new Map<string, number>();
  let ytdSuperByEmployee = new Map<string, number>();
  if (!("error" in payslips)) {
    const pField = (k: string) => payslips.fieldByKey.get(k)!;
    const { data: fyPeriodVals } = await admin
      .from("company_table_values")
      .select("record_id")
      .eq("field_id", pField("period_start").id)
      .gte("value_date", fyStart)
      .lt("value_date", periodStart); // strictly before this run -- this run's own amount is added separately below

    const fyRecordIds = (fyPeriodVals || []).map(v => v.record_id as string);
    if (fyRecordIds.length) {
      [ytdGrossByEmployee, ytdTaxByEmployee, ytdSuperByEmployee] = await Promise.all([
        sumByEmployee(admin, fyRecordIds, pField("employee").id, pField("gross_pay").id),
        sumByEmployee(admin, fyRecordIds, pField("employee").id, pField("tax_withheld").id),
        sumByEmployee(admin, fyRecordIds, pField("employee").id, pField("super_amount").id),
      ]);
    }
  }

  const lines: EmployeeLine[] = employeeIds.map(employeeId => {
    const entity = entityById.get(employeeId);
    const group = byEmployee.get(employeeId)!;
    const hourlyRate = entity?.default_rate ?? 0;
    const grossPay = Math.round(group.hours * hourlyRate * 100) / 100;
    const claimsTaxFreeThreshold = thresholdByEmployee.get(employeeId) ?? false;
    const hasHelpDebt = helpByEmployee.get(employeeId) ?? false;

    const { taxWithheld } = calculateWithholding({
      grossPay,
      periodWeeks: deriveWeeksFromPeriod(periodStart, periodEnd),
      claimsTaxFreeThreshold,
      hasHelpDebt,
    });
    const superAmount = calculateSuperGuarantee(grossPay);
    const netPay = Math.round((grossPay - taxWithheld) * 100) / 100;

    return {
      employeeId,
      employeeName: entity?.name || "Unknown",
      timesheetIds: group.timesheetIds,
      hours: group.hours,
      hourlyRate,
      claimsTaxFreeThreshold,
      hasHelpDebt,
      grossPay,
      taxWithheld,
      superAmount,
      netPay,
      ytdGross: Math.round(((ytdGrossByEmployee.get(employeeId) || 0) + grossPay) * 100) / 100,
      ytdTaxWithheld: Math.round(((ytdTaxByEmployee.get(employeeId) || 0) + taxWithheld) * 100) / 100,
      ytdSuper: Math.round(((ytdSuperByEmployee.get(employeeId) || 0) + superAmount) * 100) / 100,
      missingRate: hourlyRate <= 0,
    };
  });

  return { lines, periodStart, periodEnd, payRunTableId: payRun.tableId, tsTableId: ts.tableId, tsField };
}

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;

  const payRunId = req.nextUrl.searchParams.get("payRunId");
  if (!payRunId) return NextResponse.json({ error: "payRunId is required" }, { status: 400 });

  const result = await computePayRun(admin, companyId, payRunId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ lines: result.lines, periodStart: result.periodStart, periodEnd: result.periodEnd });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;

  const body = await req.json().catch(() => null);
  const payRunId: string | undefined = body?.payRunId;
  if (!payRunId) return NextResponse.json({ error: "payRunId is required" }, { status: 400 });

  const result = await computePayRun(admin, companyId, payRunId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  const { lines, periodStart, periodEnd, payRunTableId, tsField } = result;
  if (!lines.length) return NextResponse.json({ error: "No unpaid timesheet hours found in this period" }, { status: 400 });

  const payslips = await resolveTable(admin, companyId, "payslips", [
    "employee", "pay_run", "period_start", "period_end", "hours", "gross_pay", "tax_withheld", "super_amount", "net_pay", "ytd_gross", "ytd_tax_withheld", "ytd_super", "issued_date",
  ]);
  if ("error" in payslips) return NextResponse.json({ error: payslips.error }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);
  const results: { employeeId: string; employeeName: string; ok: boolean; error?: string; payslipId?: string }[] = [];

  for (const line of lines) {
    if (line.missingRate) {
      results.push({ employeeId: line.employeeId, employeeName: line.employeeName, ok: false, error: "No hourly rate set on this employee's record" });
      continue;
    }
    const { data, error } = await admin.rpc("run_employee_payslip", {
      p_company_id: companyId,
      p_payslips_table_id: payslips.tableId,
      p_pay_run_id: payRunId,
      p_employee_id: line.employeeId,
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_hours: line.hours,
      p_gross_pay: line.grossPay,
      p_tax_withheld: line.taxWithheld,
      p_super_amount: line.superAmount,
      p_net_pay: line.netPay,
      p_ytd_gross: line.ytdGross,
      p_ytd_tax_withheld: line.ytdTaxWithheld,
      p_ytd_super: line.ytdSuper,
      p_issued_date: today,
      p_timesheet_ids: line.timesheetIds,
      p_timesheet_status_field_id: tsField("status").id,
      p_timesheet_payrun_field_id: tsField("pay_run").id,
    });
    if (error) {
      results.push({ employeeId: line.employeeId, employeeName: line.employeeName, ok: false, error: error.message });
      continue;
    }
    results.push({ employeeId: line.employeeId, employeeName: line.employeeName, ok: true, payslipId: data?.id });
  }

  const succeeded = results.filter(r => r.ok);
  if (succeeded.length) {
    const payRun = await resolveTable(admin, companyId, "pay-runs", ["status", "processed_at", "total_gross", "total_tax_withheld", "total_super", "employee_count"]);
    if (!("error" in payRun)) {
      const totals = succeeded.reduce(
        (acc, r) => {
          const line = lines.find(l => l.employeeId === r.employeeId)!;
          acc.gross += line.grossPay;
          acc.tax += line.taxWithheld;
          acc.super += line.superAmount;
          return acc;
        },
        { gross: 0, tax: 0, super: 0 }
      );
      const pField = (k: string) => payRun.fieldByKey.get(k)!;
      const upserts = [
        { field: "status", col: "value_text", val: "Processed" },
        { field: "processed_at", col: "value_date", val: today },
        { field: "total_gross", col: "value_number", val: totals.gross },
        { field: "total_tax_withheld", col: "value_number", val: totals.tax },
        { field: "total_super", col: "value_number", val: totals.super },
        { field: "employee_count", col: "value_number", val: succeeded.length },
      ];
      await admin.from("company_table_values").upsert(
        upserts.map(u => ({ company_id: companyId, table_id: payRunTableId, record_id: payRunId, field_id: pField(u.field).id, [u.col]: u.val })),
        { onConflict: "record_id,field_id" }
      );
    }
  }

  return NextResponse.json({ results });
}
