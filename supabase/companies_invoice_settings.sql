-- Invoice branding/terms/template configuration, mirroring
-- supabase/companies_table_labels.sql's one-column-per-concern convention.
-- Shape: { creditTerms, otherTerms, bankDetails: {accountName,bsb,accountNumber,reference},
-- templates: [{ id, name, display: { showStaffInitials, showLineDescriptions,
-- showRatePerLine, showHoursPerLine, showAmountAndGstPerLine, showFeeSubtotal,
-- showDisbursementSubtotal, showPriorBalance, showDueDate, showPaymentSummary,
-- showAccountSummary } }] } -- templates is an array (not a single object) so
-- a company can maintain more than one invoice layout, since Create Invoice
-- offers a template picker, not just one fixed look.
--
-- logo_url is its own top-level column, not folded into this jsonb blob --
-- logos are reusable beyond invoices (same reasoning as
-- table_label_overrides/disabled_system_tables each getting their own
-- column). Backed by the new public `company-logos` Storage bucket, same
-- shape as the existing `avatars` bucket (see supabase/profiles_avatar_url.sql)
-- -- public buckets serve objects via their public URL directly, no RLS
-- policy needed on storage.objects; uploads only ever go through
-- app/api/company/logo/route.ts's service-role client.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS invoice_settings jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('company-logos', 'company-logos', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
ON CONFLICT (id) DO NOTHING;
