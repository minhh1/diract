// lib/disbursementInvoiceParser.ts
// Extracts disbursement line items from a supplier tax invoice PDF (e.g.
// InfoTrack) via Claude, grouped by the client's own matter number -- these
// invoices list many matters' worth of search/certificate/VOI charges on
// one document, with a "<matter number> Matter Total = ..." header
// introducing each group (see app/api/disbursements/parse-invoice/route.ts,
// which resolves each matterNumber against this company's own matters and
// hands the result to a staff review screen before anything is written).
// This is the first PDF-to-structured-data feature in the app -- everything
// else under lib/import/ is CSV-only -- so it goes through Claude's native
// PDF document support rather than the Together/Ollama text-completion
// path used elsewhere (lib/ai/modelCall.ts), which has no document input.
import Anthropic from "@anthropic-ai/sdk";

// Constructed lazily (not at module scope) so a missing ANTHROPIC_API_KEY
// throws inside parseDisbursementInvoicePdf's own call, where the route
// catches it and returns a normal error response -- constructing it at
// import time would throw during module load instead, before any request
// handler runs, which Next.js turns into an opaque 500.
function getClient(): Anthropic {
  return new Anthropic();
}

export interface ParsedInvoiceLineItem {
  description: string;
  exGstAmount: number;
  gstAmount: number;
  totalAmount: number;
  // Both null when this line item doesn't carry one (e.g. a VOI/AML charge
  // has no land registry dealing) -- see app/api/disbursements/parse-invoice/
  // route.ts's duplicate check, which relies on these to catch the same
  // search/certificate being re-imported from a second copy of an invoice,
  // or a corrected re-issue that repeats earlier charges.
  dealingNumber: string | null;
  orderDate: string | null; // ISO yyyy-mm-dd -- when the search/certificate was ORDERED, not the invoice's own date.
}

export interface ParsedInvoiceMatter {
  matterNumber: string;
  lineItems: ParsedInvoiceLineItem[];
}

export interface ParsedInvoice {
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string; // ISO yyyy-mm-dd
  matters: ParsedInvoiceMatter[];
}

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    supplierName: { type: "string", description: "The name of the company that issued this invoice (who it should be paid to), not the recipient." },
    invoiceNumber: { type: "string" },
    invoiceDate: { type: "string", description: "The invoice's own issue date, as YYYY-MM-DD." },
    matters: {
      type: "array",
      description: "Every distinct client matter/file number this invoice's charges are grouped under.",
      items: {
        type: "object",
        properties: {
          matterNumber: { type: "string", description: "The client's own internal matter/file number this group of charges is billed against (not the supplier's own order/reference number)." },
          lineItems: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string", description: "The full line item description exactly as printed, including the search/certificate type and reference." },
                exGstAmount: { type: "number", description: "The GST-exclusive amount for this line." },
                gstAmount: { type: "number", description: "The GST amount for this line." },
                totalAmount: { type: "number", description: "The GST-inclusive total for this line." },
                dealingNumber: { type: ["string", "null"], description: "The land registry dealing number this search/certificate/transaction relates to, if the line item states one (e.g. 'Dealing No. AB123456', 'Deal No.', 'Dealing Ref'). Null if this line item has none (e.g. a VOI/AML charge)." },
                orderDate: { type: ["string", "null"], description: "The date this specific search/certificate was ORDERED/requested, as YYYY-MM-DD, if printed on the line item -- a different date to the invoice's own issue date. Null if no such date is printed for this line." },
              },
              required: ["description", "exGstAmount", "gstAmount", "totalAmount", "dealingNumber", "orderDate"],
              additionalProperties: false,
            },
          },
        },
        required: ["matterNumber", "lineItems"],
        additionalProperties: false,
      },
    },
  },
  required: ["supplierName", "invoiceNumber", "invoiceDate", "matters"],
  additionalProperties: false,
} as const;

export interface ParseDisbursementInvoiceResult {
  parsed: ParsedInvoice;
  usage: { inputTokens: number; outputTokens: number };
}

export async function parseDisbursementInvoicePdf(pdfBase64: string): Promise<ParseDisbursementInvoiceResult> {
  const response = await getClient().messages.create({
    model: "claude-opus-4-8",
    max_tokens: 8192,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: EXTRACTION_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
          {
            type: "text",
            text: "This is a supplier tax invoice billing disbursements (searches, certificates, verification of identity, etc.) across multiple client matters. Extract every line item, grouped by the matter/file number each group of charges is billed against (the bold heading above each group, not any supplier-internal order number). Preserve amounts and descriptions exactly as printed. For each line item, also extract its land registry dealing number and the date it was ordered, if printed -- these are used to catch the same search being billed/imported twice, so pull them out as their own fields even though they may also appear inside the description text.",
          },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Claude declined to process this document.");
  }

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!textBlock) throw new Error("No structured output returned.");

  return {
    parsed: JSON.parse(textBlock.text) as ParsedInvoice,
    usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
  };
}
