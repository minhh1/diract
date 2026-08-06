// app/api/generic-invoice-import/parse/route.ts
// Staff uploads a PDF invoice/receipt here for a read-only preview -- parses
// it via Claude (lib/genericInvoiceParser.ts) and returns the extracted
// header fields + line items. Writes nothing; the review screen
// (components/dashboard/InvoiceImportModal.tsx) commits the kept/edited
// items afterward via .../commit. A flatter, table-agnostic sibling to
// app/api/disbursements/parse-invoice/route.ts -- no matter-grouping, no
// duplicate detection, since there's no fixed 'disbursements' table shape
// to check against here.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { parseGenericInvoicePdf } from "@/lib/genericInvoiceParser";
import { isTokenCapReached } from "@/lib/billing/aiUsageCap";
import { costUsd } from "@/lib/billing/aiModels";

const MODEL_ID = "claude-opus-4-8";
// Same bound as the disbursement parser's own limit -- generous for a real
// invoice (a few pages of text), bounds the worst-case cost of one call.
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

  try {
    const { parsed, usage } = await parseGenericInvoicePdf(base64);
    const cost = costUsd("anthropic", MODEL_ID, usage);
    await admin.from("ai_usage_events").insert({
      company_id: companyId, user_id: user.id, model_id: MODEL_ID, provider: "anthropic",
      input_tokens: usage.inputTokens, output_tokens: usage.outputTokens, cost_usd: cost,
    });
    return NextResponse.json(parsed);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Couldn't read this invoice" }, { status: 502 });
  }
}
