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
import { isTokenCapReached } from "@/lib/billing/aiUsageCap";
import { costUsd } from "@/lib/billing/aiModels";

const MODEL_ID = "claude-opus-4-8";
// 10MB -- generous for a real supplier invoice (a few pages of text), but
// bounds the worst-case cost of a single Claude document-input call.
const MAX_PDF_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const { data: aiSettings } = await admin.from("ai_chat_settings").select("ai_enabled, monthly_token_cap").eq("company_id", companyId).maybeSingle();
  if (aiSettings?.ai_enabled === false) {
    return NextResponse.json({ error: "AI features are disabled for this company" }, { status: 403 });
  }
  const tokenCap = aiSettings?.monthly_token_cap ?? 2000000;
  if (await isTokenCapReached(admin, companyId, tokenCap)) {
    return NextResponse.json({ error: "Monthly AI usage cap reached for this company" }, { status: 429 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "A PDF file is required" }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Only PDF files are supported" }, { status: 400 });
  }
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json({ error: "PDF is too large (10MB max)" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  let parsed;
  try {
    const result = await parseDisbursementInvoicePdf(base64);
    parsed = result.parsed;
    const cost = costUsd("anthropic", MODEL_ID, result.usage);
    await admin.from("ai_usage_events").insert({
      company_id: companyId, user_id: user.id, model_id: MODEL_ID, provider: "anthropic",
      input_tokens: result.usage.inputTokens, output_tokens: result.usage.outputTokens, cost_usd: cost,
    });
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

  // ── Duplicate detection ── flags a line item that looks like it's already
  // been recorded against this matter (the same invoice re-uploaded, or an
  // earlier invoice that billed the same search) -- checked against that
  // SAME matter's existing disbursement rows only, not company-wide, since
  // the same search TYPE genuinely recurs across different matters and
  // isn't itself suspicious. Primary signal is the dealing number (a land
  // registry search/dealing is inherently a one-off event for a given
  // matter, so it showing up twice is a strong signal) -- falls back to an
  // exact date+description+amount match for line items with no dealing
  // number (e.g. VOI/AML charges). Staff still decide on the review screen;
  // this only flags, never silently drops anything.
  const resolvedProjectIds = [...new Set(matters.map(m => m.projectId).filter((id): id is string => !!id))];
  const existingByProject = new Map<string, { description: string; date: string | null; rate: number | null }[]>();
  if (resolvedProjectIds.length) {
    const { data: disbTable } = await admin
      .from("company_tables").select("id").eq("company_id", companyId).eq("slug", "disbursements").is("deleted_at", null).maybeSingle();
    if (disbTable) {
      const { data: disbFields } = await admin
        .from("company_table_fields").select("id, field_key").eq("table_id", disbTable.id).is("deleted_at", null);
      const fieldIdByKey = new Map((disbFields || []).map(f => [f.field_key, f.id]));
      const matterFieldId = fieldIdByKey.get("matter");
      const descFieldId = fieldIdByKey.get("description");
      const dateFieldId = fieldIdByKey.get("date");
      const rateFieldId = fieldIdByKey.get("rate");
      if (matterFieldId && descFieldId) {
        const { data: matterLinks } = await admin
          .from("company_table_values").select("record_id, value_record_id")
          .eq("field_id", matterFieldId).in("value_record_id", resolvedProjectIds);
        const projectByRecord = new Map((matterLinks || []).map(l => [l.record_id, l.value_record_id as string]));
        const recordIds = [...projectByRecord.keys()];
        if (recordIds.length) {
          const { data: existingVals } = await admin
            .from("company_table_values").select("record_id, field_id, value_text, value_number, value_date")
            .in("record_id", recordIds).in("field_id", [descFieldId, dateFieldId, rateFieldId].filter((id): id is string => !!id));
          const byRecord = new Map<string, { description: string; date: string | null; rate: number | null }>();
          (existingVals || []).forEach(v => {
            const entry = byRecord.get(v.record_id) || { description: "", date: null, rate: null };
            if (v.field_id === descFieldId) entry.description = v.value_text || "";
            if (v.field_id === dateFieldId) entry.date = v.value_date;
            if (v.field_id === rateFieldId) entry.rate = v.value_number;
            byRecord.set(v.record_id, entry);
          });
          for (const [recordId, projectId] of projectByRecord) {
            const entry = byRecord.get(recordId);
            if (!entry) continue;
            if (!existingByProject.has(projectId)) existingByProject.set(projectId, []);
            existingByProject.get(projectId)!.push(entry);
          }
        }
      }
    }
  }

  const mattersWithDuplicateFlags = matters.map(m => {
    if (!m.projectId) return { ...m, lineItems: m.lineItems.map(li => ({ ...li, isDuplicate: false })) };
    const existing = existingByProject.get(m.projectId) || [];
    return {
      ...m,
      lineItems: m.lineItems.map(li => {
        const isDuplicate = existing.some(e => {
          if (li.dealingNumber && e.description.toLowerCase().includes(li.dealingNumber.toLowerCase())) return true;
          if (!li.dealingNumber) {
            const sameDesc = e.description.trim().toLowerCase() === li.description.trim().toLowerCase();
            const sameAmount = e.rate != null && Math.abs(e.rate - li.exGstAmount) < 0.01;
            const sameDate = !li.orderDate || e.date === li.orderDate;
            return sameDesc && sameAmount && sameDate;
          }
          return false;
        });
        return { ...li, isDuplicate };
      }),
    };
  });

  return NextResponse.json({
    supplierName: parsed.supplierName,
    invoiceNumber: parsed.invoiceNumber,
    invoiceDate: parsed.invoiceDate,
    matters: mattersWithDuplicateFlags,
  });
}
