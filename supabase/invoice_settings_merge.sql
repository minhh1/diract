-- Partial JSONB merge for companies.invoice_settings, called via .rpc()
-- instead of each invoice-settings section doing its own client-side
-- {...invoiceSettings, ...patch} spread + whole-object update.
--
-- That pattern raced: Branding/Terms & payment/Templates each hold their
-- own snapshot of `invoiceSettings` from CompanyContext, which only
-- refreshes after a round trip. If two sections saved close together, the
-- slower one's stale snapshot would overwrite the faster one's just-written
-- field -- confirmed live: Huynh Lawyers' ourReferenceFieldKey was set via
-- the Terms & payment section, then silently reverted to null shortly
-- after by another section's save using a snapshot from before that write
-- landed. A server-side jsonb `||` merge means a save can only ever touch
-- the keys it explicitly sends, so it can no longer stomp a sibling
-- section's concurrent write.
--
-- LANGUAGE sql, no SECURITY DEFINER -- runs as the calling user, so the
-- UPDATE inside is still subject to the existing companies_update RLS
-- policy (is_member_of(id) AND is_current_user_admin()) exactly as if the
-- caller had run the UPDATE directly.
CREATE OR REPLACE FUNCTION merge_company_invoice_settings(p_company_id uuid, p_patch jsonb)
RETURNS jsonb
LANGUAGE sql
AS $$
  UPDATE companies
  SET invoice_settings = COALESCE(invoice_settings, '{}'::jsonb) || p_patch
  WHERE id = p_company_id
  RETURNING invoice_settings;
$$;
