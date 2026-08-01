// app/api/disbursements/parse-invoice/route.ts
// Staff uploads a supplier tax invoice PDF (e.g. InfoTrack) here for a
// read-only preview -- parses it via Claude (lib/disbursementInvoiceParser.ts)
// and resolves each extracted matter number against this company's own
// `matter_number` field on projects, but writes nothing. The staff member
// reviews/edits/excludes matters and line items on the client, then commits
// via app/api/disbursements/commit/route.ts. Matter numbers that don't
// resolve are returned as their own group so the UI can flag them rather
// than silently dropping or guessing which matter they belong to.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { parseDisbursementInvoicePdf } from "@/lib/disbursementInvoiceParser";

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "A PDF file is required" }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Only PDF files are supported" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  let parsed;
  try {
    parsed = await parseDisbursementInvoicePdf(base64);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Couldn't read this invoice" }, { status: 502 });
  }

  const { data: matterNumberField } = await admin
    .from("company_custom_fields")
    .select("id")
    .eq("company_id", companyId)
    .eq("table_name", "projects")
    .eq("field_key", "matter_number")
    .is("deleted_at", null)
    .maybeSingle();

  const matterNumbers = parsed.matters.map(m => m.matterNumber);
  let projectByNumber = new Map<string, { id: string; name: string }>();
  if (matterNumberField && matterNumbers.length) {
    const { data: values } = await admin
      .from("company_custom_field_values")
      .select("record_id, value_text")
      .eq("field_id", matterNumberField.id)
      .in("value_text", matterNumbers);
    const projectIds = (values || []).map(v => v.record_id);
    const { data: projects } = projectIds.length
      ? await admin.from("projects").select("id, name").in("id", projectIds).is("deleted_at", null)
      : { data: [] as { id: string; name: string }[] };
    const projectById = new Map((projects || []).map(p => [p.id, p]));
    projectByNumber = new Map(
      (values || [])
        .map(v => {
          const project = projectById.get(v.record_id);
          return project ? [v.value_text as string, project] as const : null;
        })
        .filter((e): e is [string, { id: string; name: string }] => e !== null)
    );
  }

  const matters = parsed.matters.map(m => {
    const match = projectByNumber.get(m.matterNumber);
    return {
      matterNumber: m.matterNumber,
      projectId: match?.id ?? null,
      projectName: match?.name ?? null,
      lineItems: m.lineItems,
    };
  });

  return NextResponse.json({
    supplierName: parsed.supplierName,
    invoiceNumber: parsed.invoiceNumber,
    invoiceDate: parsed.invoiceDate,
    matters,
  });
}
