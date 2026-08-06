// lib/genericInvoiceParser.ts
// A flatter, generic sibling to lib/disbursementInvoiceParser.ts -- extracts
// a generic invoice/receipt PDF's header fields + line items via Claude's
// native PDF document input, same call shape (model, thinking, structured
// output schema) as the disbursement parser, just without that one's
// law-firm-specific "group by matter number" schema/prompt or its
// dealing-number/order-date fields. Used by the invoice_import dashboard
// widget (see lib/dashboardWidgets/types.ts's InvoiceImportWidget) to
// import PDF invoices into ANY custom table, not just the fixed
// 'disbursements' table the law-firm feature writes to.
import Anthropic from "@anthropic-ai/sdk";

function getClient(): Anthropic {
  return new Anthropic();
}

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

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    supplierName: { type: "string", description: "The name of the company that issued this invoice (who it should be paid to), not the recipient." },
    invoiceNumber: { type: "string" },
    invoiceDate: { type: "string", description: "The invoice's own issue date, as YYYY-MM-DD." },
    subtotal: { type: ["number", "null"], description: "The pre-tax subtotal, if printed. Null if not shown separately." },
    tax: { type: ["number", "null"], description: "The tax/GST amount, if printed. Null if not shown separately." },
    total: { type: ["number", "null"], description: "The final total amount due, if printed." },
    lineItems: {
      type: "array",
      description: "Every line item on the invoice.",
      items: {
        type: "object",
        properties: {
          description: { type: "string", description: "The full line item description, exactly as printed." },
          amount: { type: "number", description: "This line's amount." },
        },
        required: ["description", "amount"],
        additionalProperties: false,
      },
    },
  },
  required: ["supplierName", "invoiceNumber", "invoiceDate", "subtotal", "tax", "total", "lineItems"],
  additionalProperties: false,
} as const;

export async function parseGenericInvoicePdf(pdfBase64: string): Promise<ParseGenericInvoiceResult> {
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
            text: "This is a generic invoice or receipt. Extract the supplier/vendor name, invoice number, invoice date, subtotal, tax, and total (null for any that aren't printed), and every line item (description + amount) exactly as printed. There's no matter/project grouping here -- just extract the invoice as a whole.",
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
    parsed: JSON.parse(textBlock.text) as ParsedGenericInvoice,
    usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
  };
}
