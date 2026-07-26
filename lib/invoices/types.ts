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

export interface InvoiceSettings {
  firmAddress?: string;
  creditTerms?: string;
  otherTerms?: string;
  bankDetails?: InvoiceBankDetails | null;
  // Days from issue date to default due date -- company-wide business
  // policy, not a per-template visual concern (unlike `layout`). Defaults
  // to 14 wherever read (CreateInvoiceModal.tsx, the settings input)
  // rather than here, so an old company row with this column simply absent
  // still behaves exactly as if it were set to 14.
  paymentTermsDays?: number;
  templates: InvoiceTemplateConfig[];
}

export function emptyInvoiceSettings(): InvoiceSettings {
  return { firmAddress: '', creditTerms: '', otherTerms: '', bankDetails: null, paymentTermsDays: 14, templates: [] };
}
