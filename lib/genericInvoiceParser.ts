// lib/genericInvoiceParser.ts
// A flatter, generic sibling to lib/disbursementInvoiceParser.ts -- extracts
// a generic invoice/receipt PDF's header fields + line items. Unlike the
// disbursement parser (Claude's native PDF document input), this goes
// through Together's OpenAI-compatible vision endpoint: no Together model
// accepts a PDF directly, so the PDF is rasterized to page images first
// (lib/pdf/rasterizePdfPages.ts) and sent as image_url content blocks to
// moonshotai/Kimi-K2.6, the vision-capable model in Together's serverless
// catalog (deepseek-ai/DeepSeek-V4-Pro, used elsewhere in this app, is
// text-only). Used by the invoice_import dashboard widget (see
// lib/dashboardWidgets/types.ts's InvoiceImportWidget) to import PDF
// invoices into ANY custom table, not just the fixed 'disbursements' table
// the law-firm feature writes to.
import { rasterizePdfPages } from "@/lib/pdf/rasterizePdfPages";

const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY;
export const GENERIC_INVOICE_MODEL_ID = "moonshotai/Kimi-K2.6";

export interface ParsedGenericLineItem {
  description: string;
  amount: number;
}

export interface ParsedGenericInvoice {
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string; // ISO yyyy-mm-dd
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  lineItems: ParsedGenericLineItem[];
}

export interface ParseGenericInvoiceResult {
  parsed: ParsedGenericInvoice;
  usage: { inputTokens: number; outputTokens: number };
}

// Kimi-K2.6's structured-output support is unconfirmed for response_format
// json_schema (DeepSeek-family models on Together only reliably document
// json_object) -- describing the exact shape in the prompt alongside plain
// json_object mode is the safer, well-precedented combination.
const EXTRACTION_PROMPT = `This is a generic invoice or receipt, shown to you as one or more page images. Extract its data as a single JSON object with EXACTLY these keys and no others:

{
  "supplierName": string -- the company that issued this invoice (who it should be paid to), not the recipient,
  "invoiceNumber": string,
  "invoiceDate": string -- the invoice's own issue date, as YYYY-MM-DD,
  "subtotal": number or null -- the pre-tax subtotal, if printed, else null,
  "tax": number or null -- the tax/GST amount, if printed, else null,
  "total": number or null -- the final total amount due, if printed, else null,
  "lineItems": [ { "description": string, "amount": number }, ... ] -- every line item on the invoice, description exactly as printed
}

There's no matter/project grouping here -- just extract the invoice as a whole. Respond with ONLY the JSON object, no other text, no markdown code fences.`;

export async function parseGenericInvoicePdf(pdfBytes: Uint8Array): Promise<ParseGenericInvoiceResult> {
  const pageImages = await rasterizePdfPages(pdfBytes);
  if (!pageImages.length) throw new Error("Couldn't read any pages from this PDF.");

  const content: Record<string, unknown>[] = [{ type: "text", text: EXTRACTION_PROMPT }];
  for (const dataUrl of pageImages) {
    content.push({ type: "image_url", image_url: { url: dataUrl } });
  }

  const res = await fetch("https://api.together.xyz/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOGETHER_API_KEY}` },
    body: JSON.stringify({
      model: GENERIC_INVOICE_MODEL_ID,
      messages: [{ role: "user", content }],
      response_format: { type: "json_object" },
      stream: false,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Couldn't read this invoice (${res.status}): ${errText.slice(0, 300)}`);
  }

  const json = await res.json();
  const text: string | undefined = json.choices?.[0]?.message?.content;
  if (!text) throw new Error("No structured output returned.");

  let parsed: ParsedGenericInvoice;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Couldn't parse the extracted invoice data.");
  }
  if (!Array.isArray(parsed.lineItems)) parsed.lineItems = [];

  return {
    parsed,
    usage: {
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
    },
  };
}
