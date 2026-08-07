-- Company-wide email signature branding defaults. One row per company --
-- the template choice, logo, colour, font and links every user's personal
-- signature (see user_email_signature_settings.sql) is rendered on top of.
-- See lib/signature/renderSignatureHtml.ts, the single renderer every
-- consumer (Settings preview, Gmail native push, Outlook add-in) shares.
CREATE TABLE IF NOT EXISTS company_email_signature_settings (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  -- 'logo_left' | 'logo_top' | 'compact_inline' -- validated in the API
  -- route, not a DB check constraint, matching this app's general style of
  -- keeping enum validation in the request handler (see e.g.
  -- document-templates' field_type CHECK being the one deliberate
  -- exception, not the rule).
  template_id text NOT NULL DEFAULT 'logo_left',
  -- Falls back to companies.logo_url in the renderer if null -- this column
  -- only needs a value when the firm wants a signature-specific crop
  -- distinct from their main logo.
  logo_url text,
  brand_color text,
  -- Constrained to an email-safe font list in the renderer (Arial,
  -- Helvetica, Georgia, Times New Roman, Verdana) -- most email clients,
  -- including Outlook's Word rendering engine, don't support arbitrary web
  -- fonts, so this is intentionally not a free-text font picker.
  font_family text NOT NULL DEFAULT 'Arial',
  base_font_size int NOT NULL DEFAULT 12,
  company_name text,
  company_address text,
  company_phone text,
  company_website text,
  -- [{ label: string, url: string }, ...] -- LinkedIn, book-a-meeting, etc.
  links jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE company_email_signature_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_email_signature_settings_company_members ON company_email_signature_settings;
CREATE POLICY company_email_signature_settings_company_members ON company_email_signature_settings
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
