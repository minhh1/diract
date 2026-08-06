// lib/invoices/taxSchemes.ts
// Shared between lib/invoices/generateGenericInvoicePdf.ts (server, picks
// the printed tax label) and components/dashboard/builder/WidgetConfigPanel.tsx
// (client, the scheme picker) -- kept out of generateGenericInvoicePdf.ts
// itself so the config panel doesn't have to pull pdf-lib into the client
// bundle just for this list.
//
// The tax AMOUNT always comes from the record's own mapped field (this app
// doesn't compute tax); a scheme only controls which region's terminology
// prints next to it, since "Tax" reads as vague/wrong to someone expecting
// to see "GST" or "VAT" on their own invoice.
export const TAX_SCHEMES: { value: string; region: string; taxLabel: string }[] = [
  { value: "us", region: "United States", taxLabel: "Sales Tax" },
  { value: "ca", region: "Canada", taxLabel: "GST/HST" },
  { value: "uk", region: "United Kingdom", taxLabel: "VAT" },
  { value: "eu", region: "European Union", taxLabel: "VAT" },
  { value: "au", region: "Australia", taxLabel: "GST" },
  { value: "nz", region: "New Zealand", taxLabel: "GST" },
  { value: "sg", region: "Singapore", taxLabel: "GST" },
  { value: "vn", region: "Vietnam", taxLabel: "VAT" },
  { value: "other", region: "Other / custom", taxLabel: "Tax" },
];

export function taxLabelForScheme(scheme: string | null | undefined): string {
  return TAX_SCHEMES.find((s) => s.value === scheme)?.taxLabel ?? "Tax";
}
