-- AI-classified field grouping, scoped per company+table (NOT per record).
-- Every record of the same table shares one company's classification, since
-- the field SET is identical across records of a table -- classifying it
-- separately per record (the original record_tab_fields.section design)
-- meant every single new record a user opened re-ran the AI call, which is
-- both wasteful and slow. This is computed once and reused forever (until
-- a field is added that isn't covered yet).
CREATE TABLE IF NOT EXISTS company_table_field_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  table_name text NOT NULL,
  field_key text NOT NULL,
  section text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, table_name, field_key)
);

CREATE INDEX IF NOT EXISTS company_table_field_sections_lookup_idx
  ON company_table_field_sections(company_id, table_name);

ALTER TABLE company_table_field_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_table_field_sections_company_members ON company_table_field_sections;
CREATE POLICY company_table_field_sections_company_members ON company_table_field_sections
  FOR SELECT USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));

-- Superseded by the table above -- was scoped per-record (per tab_id),
-- which is what caused the redundant per-record classification calls.
ALTER TABLE record_tab_fields DROP COLUMN IF EXISTS section;
