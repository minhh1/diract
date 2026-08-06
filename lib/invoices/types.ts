// Shared shape of companies.invoice_settings (see
// supabase/companies_invoice_settings.sql) -- read by CompanyContext.tsx,
// InvoiceTemplateSettingsTab.tsx, CreateInvoiceModal.tsx, and
// app/api/invoices/[invoiceId]/pdf/route.ts.
import type { InvoiceTemplateDisplay, InvoiceLayout } from "./generateInvoicePdf";

export interface InvoiceBankDetails {
  accountName?: string;
  bsb?: string;
  accountNumber?: string;
  reference?: string;
}

export interface InvoiceTemplateConfig {
  id: string;
  name: string;
  isDefault?: boolean;
  display: InvoiceTemplateDisplay;
  // Header-region positions + table column order/width -- optional so any
  // template saved before InvoiceLayoutEditor.tsx existed keeps rendering
  // via DEFAULT_INVOICE_LAYOUT exactly as before (see generateInvoicePdf.ts).
  layout?: InvoiceLayout;
  // 'flexible' (default, absent = 'flexible') is the draggable-anchor/
  // configurable-column template InvoiceLayoutEditor.tsx edits, rendered by
  // generateInvoicePdf.ts. 'detailed' is the fixed, multi-page law-firm
  // style (summary + itemised appendix + remittance advice + notice of
  // rights) rendered by generateDetailedInvoicePdf.ts -- it doesn't use
  // `layout` at all, so InvoiceLayoutEditor.tsx/INVOICE_LAYOUT_PRESETS are
  // hidden for a template with this style.
  style?: 'flexible' | 'detailed';
}

// The Detailed template's (generateDetailedInvoicePdf.ts) "YOUR RIGHTS
// CONCERNING THIS INVOICE" clause used to be a hardcoded string with no
// company override -- this is that same text, now just the fallback used
// when a company hasn't set InvoiceSettings.rightsClause of its own (every
// company before this setting existed, and any that clears the field back
// to blank). Paragraphs are split on blank lines wherever this is rendered.
export const DEFAULT_INVOICE_RIGHTS_CLAUSE =
  "Please raise any concerns about this invoice with us directly in the first instance. If a concern cannot be resolved between us, you may, depending on your circumstances, have the following options:\n\n" +
  "1. Apply to the costs assessor of the relevant jurisdiction for a costs assessment under the Legal Profession Uniform Law. This application must generally be made within 12 months of the bill being given to you, of payment being requested, or, where no bill or request was made, within 12 months of the legal costs being paid. A costs assessor has discretion to accept a later application, taking into account the length of and reasons for the delay.\n\n" +
  "2. Lodge a costs complaint with the Legal Services Commissioner of the relevant jurisdiction. This must generally be done within 60 days of the legal costs becoming payable, or within 30 days of receiving an itemised bill you requested. The Commissioner's role is limited to disputes where the total legal costs are under the applicable indexed threshold, and a complaint made outside these timeframes may still be accepted at the Commissioner's discretion, provided we have not already commenced proceedings to recover the costs.";

export interface InvoiceSettings {
  firmAddress?: string;
  creditTerms?: string;
  otherTerms?: string;
  // Detailed template only (see DEFAULT_INVOICE_RIGHTS_CLAUSE) -- unset/
  // empty falls back to that default, not to no clause at all, so leaving
  // this blank in settings doesn't silently drop a statutorily-relevant
  // notice off every invoice.
  rightsClause?: string;
  bankDetails?: InvoiceBankDetails | null;
  // Days from issue date to default due date -- company-wide business
  // policy, not a per-template visual concern (unlike `layout`). Defaults
  // to 14 wherever read (CreateInvoiceModal.tsx, the settings input)
  // rather than here, so an old company row with this column simply absent
  // still behaves exactly as if it were set to 14.
  paymentTermsDays?: number;
  // Which matter field to auto-fill "Our Reference" from when creating an
  // invoice (e.g. Huynh Lawyers uses their Matter Number custom field) --
  // a native `projects` column name, or 'cf:<company_custom_fields.id>' for
  // a custom field, matching the convention RelationPicker.tsx's
  // displayField2/searchFieldKeys already use for the same distinction.
  // Unset = no auto-fill, "Our Reference" stays blank until typed in.
  ourReferenceFieldKey?: string | null;
  // Which entity-type matter field to auto-fill "Debtor" from when creating
  // an invoice -- always 'cf:<company_custom_fields.id>' (never a native
  // column: `projects` has no built-in "client"/"debtor" columns, only
  // whatever entity-relation custom fields a company happens to have
  // configured, e.g. a "Client Name" field). Unset = no auto-fill, Debtor
  // stays blank until picked manually, same as before this existed.
  debtorFieldKey?: string | null;
  templates: InvoiceTemplateConfig[];
}

export function emptyInvoiceSettings(): InvoiceSettings {
  return { firmAddress: '', creditTerms: '', otherTerms: '', bankDetails: null, paymentTermsDays: 14, templates: [] };
}
