// Shared shape of companies.invoice_settings (see
// supabase/companies_invoice_settings.sql) -- read by CompanyContext.tsx,
// InvoiceTemplateSettingsTab.tsx, CreateInvoiceModal.tsx, and
// app/api/invoices/[invoiceId]/pdf/route.ts.
import type { InvoiceTemplateDisplay } from "./generateInvoicePdf";

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
