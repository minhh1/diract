-- GST redesign, part 3: snapshot each billed line's GST status/amount onto
-- invoice_line_items (billed_amount already snapshots the ex-GST amount --
-- see CreateInvoiceModal.tsx's splitGst()) so generateInvoicePdf.ts can
-- render a real per-line GST breakdown instead of nothing, matching the
-- existing InvoiceTemplateDisplay.showAmountAndGstPerLine toggle that's
-- had no GST data to show until now.
ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS gst_status text,
  ADD COLUMN IF NOT EXISTS gst_amount numeric;
