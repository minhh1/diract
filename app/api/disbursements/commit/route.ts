// app/api/disbursements/commit/route.ts
// Writes the line items staff kept/edited on the invoice-import review
// screen (see components/dashboard/DisbursementInvoiceImportModal.tsx) into
// this company's own Disbursements table -- resolving that table's actual
// field ids by field_key rather than hardcoding them, since a company can
// customize its Disbursements table (rename/remove fields) after the Law
// Firm template seeds it (see supabase/template_law_firm_seed.sql). Every
// row needs a resolved projectId already -- unmatched matters are the
// review screen's job to flag, not this route's to guess.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { getValueColumn } from "@/lib/schema/fieldCapabilities";

interface CommitLineItem {
  projectId: string;
  description: string;
  amount: number; // GST-exclusive rate
  date: string; // YYYY-MM-DD
  supplierName: string;
  expenseCode?: string | null;
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const body = await req.json().catch(() => ({}));
  const items = body.items as CommitLineItem[] | undefined;
  if (!Array.isArray(items) || !items.length) {
    return NextResponse.json({ error: "No line items to add" }, { status: 400 });
  }
  for (const item of items) {
    if (!item.projectId || !item.description || typeof item.amount !== "number" || !item.date) {
      return NextResponse.json({ error: "Every line item needs a matter, description, amount, and date" }, { status: 400 });
    }
  }

  const { data: table } = await admin
    .from("company_tables")
    .select("id, is_ledger")
    .eq("company_id", companyId)
    .eq("slug", "disbursements")
    .is("deleted_at", null)
    .maybeSingle();
  if (!table) return NextResponse.json({ error: "This company doesn't have a Disbursements table" }, { status: 404 });
  if (table.is_ledger) return NextResponse.json({ error: "Disbursements isn't writable directly here" }, { status: 400 });

  const { data: fields } = await admin
    .from("company_table_fields")
    .select("id, field_key, field_type")
    .eq("table_id", table.id)
    .is("deleted_at", null);
  const fieldByKey = new Map((fields || []).map(f => [f.field_key, f]));

  const required = ["matter", "date", "supplier_name", "description", "rate", "quantity"];
  const missing = required.filter(k => !fieldByKey.has(k));
  if (missing.length) {
    return NextResponse.json({ error: `The Disbursements table is missing expected field(s): ${missing.join(", ")}` }, { status: 400 });
  }

  const { data: records, error: recErr } = await admin
    .from("company_table_records")
    .insert(items.map(() => ({ company_id: companyId, table_id: table.id, created_by: user.id })))
    .select("id");
  if (recErr || !records) return NextResponse.json({ error: recErr?.message || "Couldn't create the disbursement rows" }, { status: 500 });

  const values: Record<string, any>[] = [];
  const push = (recordId: string, fieldKey: string, value: any) => {
    const field = fieldByKey.get(fieldKey);
    if (!field || value == null || value === "") return;
    values.push({ company_id: companyId, table_id: table.id, record_id: recordId, field_id: field.id, [getValueColumn(field.field_type)]: value });
  };

  items.forEach((item, i) => {
    const recordId = records[i].id;
    push(recordId, "matter", item.projectId);
    push(recordId, "date", item.date);
    push(recordId, "supplier_name", item.supplierName);
    push(recordId, "expense_code", item.expenseCode);
    push(recordId, "description", item.description);
    push(recordId, "rate", item.amount);
    push(recordId, "quantity", 1);
    push(recordId, "gst_status", "GST Exclusive");
    push(recordId, "billable", true);
    push(recordId, "amount", item.amount); // rate * quantity, quantity is always 1 here
  });

  const { error: valErr } = await admin.from("company_table_values").insert(values);
  if (valErr) {
    await admin.from("company_table_records").delete().in("id", records.map(r => r.id));
    return NextResponse.json({ error: valErr.message }, { status: 500 });
  }

  return NextResponse.json({ created: records.length });
}
