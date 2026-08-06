// app/api/generic-invoice-import/commit/route.ts
// Writes the line items staff kept/edited on the invoice-import review
// screen (components/dashboard/InvoiceImportModal.tsx) into the
// invoice_import widget's own bound table -- one new record per line item
// (v1: header fields like supplier/invoice number repeated on every row, no
// header/detail child-table split, mirroring the disbursements commit
// route's own shape). Field ids always come from the WIDGET'S OWN STORED
// config, re-loaded server-side from dashboardId/widgetId -- never trusted
// from the request, same convention as the document_export export route.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { getValueColumn } from "@/lib/schema/fieldCapabilities";
import type { InvoiceImportWidget } from "@/lib/dashboardWidgets/types";

interface CommitLineItem {
  description: string;
  amount: number;
  supplierName?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const body = await req.json().catch(() => ({}));
  const dashboardId = String(body.dashboardId || "");
  const widgetId = String(body.widgetId || "");
  const items = body.lineItems as CommitLineItem[] | undefined;
  if (!Array.isArray(items) || !items.length) {
    return NextResponse.json({ error: "No line items to add" }, { status: 400 });
  }
  for (const item of items) {
    if (!item.description || typeof item.amount !== "number") {
      return NextResponse.json({ error: "Every line item needs a description and amount" }, { status: 400 });
    }
  }

  const { data: dashboard } = await admin
    .from("company_dashboards")
    .select("id, source_table_id, widgets")
    .eq("id", dashboardId).eq("company_id", companyId).is("deleted_at", null).maybeSingle();
  if (!dashboard || !dashboard.source_table_id) return NextResponse.json({ error: "Dashboard not found" }, { status: 404 });

  const widget = (dashboard.widgets || []).find((w: any) => w.id === widgetId) as InvoiceImportWidget | undefined;
  if (!widget || widget.type !== "invoice_import") return NextResponse.json({ error: "Widget not found" }, { status: 404 });
  const cfg = widget.config;
  if (!cfg.descriptionFieldId || !cfg.amountFieldId) {
    return NextResponse.json({ error: "This widget's description/amount fields haven't been configured yet" }, { status: 400 });
  }

  const { data: table } = await admin
    .from("company_tables")
    .select("id, is_ledger, is_from_template")
    .eq("id", dashboard.source_table_id).eq("company_id", companyId).is("deleted_at", null).maybeSingle();
  if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });
  if (table.is_ledger) return NextResponse.json({ error: "This table isn't writable directly here" }, { status: 400 });

  const fieldIds = [cfg.descriptionFieldId, cfg.amountFieldId, cfg.supplierNameFieldId, cfg.invoiceNumberFieldId, cfg.invoiceDateFieldId]
    .filter((id): id is string => !!id);
  const { data: fields } = await admin
    .from("company_table_fields").select("id, field_type").in("id", fieldIds).is("deleted_at", null);
  const fieldTypeById = new Map((fields || []).map((f: any) => [f.id, f.field_type]));
  // A field id in the widget's config could be stale (the field was renamed
  // away or deleted since the widget was configured) -- skip it gracefully
  // rather than failing the whole import.
  const liveFieldId = (id: string | null | undefined) => (id && fieldTypeById.has(id) ? id : null);

  const { data: records, error: recErr } = await admin
    .from("company_table_records")
    .insert(items.map(() => ({ company_id: companyId, table_id: table.id, created_by: user.id })))
    .select("id");
  if (recErr || !records) return NextResponse.json({ error: recErr?.message || "Couldn't create the rows" }, { status: 500 });

  const values: Record<string, any>[] = [];
  const push = (recordId: string, fieldId: string | null, value: any) => {
    if (!fieldId || value == null || value === "") return;
    const fieldType = fieldTypeById.get(fieldId);
    values.push({ company_id: companyId, table_id: table.id, record_id: recordId, field_id: fieldId, [getValueColumn(fieldType)]: value });
  };

  items.forEach((item, i) => {
    const recordId = records[i].id;
    push(recordId, liveFieldId(cfg.descriptionFieldId), item.description);
    push(recordId, liveFieldId(cfg.amountFieldId), item.amount);
    push(recordId, liveFieldId(cfg.supplierNameFieldId), item.supplierName);
    push(recordId, liveFieldId(cfg.invoiceNumberFieldId), item.invoiceNumber);
    push(recordId, liveFieldId(cfg.invoiceDateFieldId), item.invoiceDate);
  });

  const { error: valErr } = await admin.from("company_table_values").insert(values);
  if (valErr) {
    await admin.from("company_table_records").delete().in("id", records.map((r: any) => r.id));
    return NextResponse.json({ error: valErr.message }, { status: 500 });
  }

  return NextResponse.json({ created: records.length });
}
