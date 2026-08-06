// app/api/document-export/[dashboardId]/[widgetId]/[recordId]/route.ts
// GET -> a PDF for one record, rendered per a document_export widget's own
// config (see lib/dashboardWidgets/types.ts's DocumentExportWidget) --
// downloaded from components/dashboard/DocumentExportWidget.tsx.
//
// Security-relevant: every field id used to build the PDF comes from the
// WIDGET'S OWN STORED config, re-loaded server-side from `dashboardId` --
// never from the request. A caller can only pick which record (recordId) to
// render, not which fields end up in the document.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { renderLetterheadPdf } from "@/lib/precedents/renderLetterheadPdf";
import { generateGenericInvoicePdf } from "@/lib/invoices/generateGenericInvoicePdf";
import type { DocumentExportWidget } from "@/lib/dashboardWidgets/types";

type ValueRow = { field_id: string; value_text: string | null; value_number: number | null; value_date: string | null; value_boolean: boolean | null };

function hydrateRecord(valueRows: ValueRow[]): Map<string, any> {
  const byField = new Map<string, any>();
  for (const v of valueRows) {
    byField.set(v.field_id, v.value_text ?? v.value_number ?? v.value_date ?? (v.value_boolean != null ? v.value_boolean : null));
  }
  return byField;
}

const str = (v: any): string => (v == null ? "" : String(v));
const num = (v: any): number | null => (v == null || v === "" ? null : Number(v));

export async function GET(_req: NextRequest, { params }: { params: Promise<{ dashboardId: string; widgetId: string; recordId: string }> }) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;
  const { dashboardId, widgetId, recordId } = await params;

  const { data: dashboard } = await admin
    .from("company_dashboards")
    .select("id, source_table_id, widgets")
    .eq("id", dashboardId).eq("company_id", companyId).is("deleted_at", null).maybeSingle();
  if (!dashboard || !dashboard.source_table_id) return NextResponse.json({ error: "Dashboard not found" }, { status: 404 });

  const widget = (dashboard.widgets || []).find((w: any) => w.id === widgetId) as DocumentExportWidget | undefined;
  if (!widget || widget.type !== "document_export") return NextResponse.json({ error: "Widget not found" }, { status: 404 });

  const { data: record } = await admin
    .from("company_table_records")
    .select("id")
    .eq("id", recordId).eq("table_id", dashboard.source_table_id).eq("company_id", companyId).is("deleted_at", null)
    .maybeSingle();
  if (!record) return NextResponse.json({ error: "Record not found" }, { status: 404 });

  const { data: valueRows } = await admin
    .from("company_table_values")
    .select("field_id, value_text, value_number, value_date, value_boolean")
    .eq("record_id", recordId);
  const values = hydrateRecord((valueRows || []) as ValueRow[]);
  const get = (fieldId: string | null | undefined) => (fieldId ? values.get(fieldId) : undefined);

  if (widget.config.style === "letter") {
    const cfg = widget.config.letter;
    if (!cfg) return NextResponse.json({ error: "This widget's letter fields haven't been configured yet" }, { status: 400 });

    const result = await renderLetterheadPdf(admin, {
      companyId,
      subject: str(get(cfg.subjectFieldId)),
      body: str(get(cfg.bodyFieldId)),
      recipientName: str(get(cfg.recipientNameFieldId)),
      recipientAddress: str(get(cfg.recipientAddressFieldId)),
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return new NextResponse(new Uint8Array(result.pdfBuffer), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="document.pdf"` },
    });
  }

  // style === 'invoice'
  const cfg = widget.config.invoice;
  if (!cfg) return NextResponse.json({ error: "This widget's invoice fields haven't been configured yet" }, { status: 400 });

  const { data: company } = await admin.from("companies").select("name").eq("id", companyId).maybeSingle();

  const description = str(get(cfg.descriptionFieldId));
  const amount = num(get(cfg.amountFieldId));
  const pdfBuffer = await generateGenericInvoicePdf({
    companyName: company?.name || "",
    invoiceNumber: get(cfg.invoiceNumberFieldId) != null ? str(get(cfg.invoiceNumberFieldId)) : null,
    invoiceDate: get(cfg.invoiceDateFieldId) != null ? str(get(cfg.invoiceDateFieldId)).slice(0, 10) : null,
    dueDate: get(cfg.dueDateFieldId) != null ? str(get(cfg.dueDateFieldId)).slice(0, 10) : null,
    customerName: get(cfg.customerNameFieldId) != null ? str(get(cfg.customerNameFieldId)) : null,
    customerAddress: get(cfg.customerAddressFieldId) != null ? str(get(cfg.customerAddressFieldId)) : null,
    lineItems: description || amount != null ? [{ description, amount: amount ?? 0 }] : [],
    subtotal: num(get(cfg.subtotalFieldId)),
    tax: num(get(cfg.taxFieldId)),
    total: num(get(cfg.totalFieldId)),
  });
  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="invoice.pdf"` },
  });
}
