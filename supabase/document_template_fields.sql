-- One row per distinct {{tag}} discovered in a document template. The admin can
-- relabel/type each tag and optionally bind it to an existing custom field so its
-- current value pre-fills instead of asking the client.

CREATE TABLE IF NOT EXISTS document_template_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
  tag_key text NOT NULL,
  label text NOT NULL,
  field_type text NOT NULL DEFAULT 'text' CHECK (field_type IN ('text','date','number','currency','select')),
  select_options jsonb,
  is_required boolean NOT NULL DEFAULT false,
  auto_fill_field_id uuid REFERENCES company_custom_fields(id) ON DELETE SET NULL,
  display_order int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS document_template_fields_template_id_idx ON document_template_fields(template_id);

ALTER TABLE document_template_fields ENABLE ROW LEVEL SECURITY;

-- Company-scoped via join through document_templates.company_id.
DROP POLICY IF EXISTS document_template_fields_company_members ON document_template_fields;
CREATE POLICY document_template_fields_company_members ON document_template_fields
  FOR ALL
  USING (template_id IN (
    SELECT id FROM document_templates
    WHERE company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ))
  WITH CHECK (template_id IN (
    SELECT id FROM document_templates
    WHERE company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ));
