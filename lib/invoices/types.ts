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
}

export interface InvoiceSettings {
  firmAddress?: string;
  creditTerms?: string;
  otherTerms?: string;
  bankDetails?: InvoiceBankDetails | null;
  templates: InvoiceTemplateConfig[];
}

export function emptyInvoiceSettings(): InvoiceSettings {
  return { firmAddress: '', creditTerms: '', otherTerms: '', bankDetails: null, templates: [] };
}
