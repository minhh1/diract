-- Server-side auto-numbering for company_custom_fields (system-table
-- fields: projects/entities/properties -- e.g. Matter Number), mirroring
-- company_table_field_sequences.sql's proven design for custom-table
-- fields exactly (same column names/semantics, same SECURITY DEFINER
-- counter function), just against a different field table. Deliberately a
-- separate counter table rather than reusing company_table_field_sequences
-- -- that one's field_id FKs to company_table_fields, a different table
-- entirely, and company_custom_fields.id values could collide with
-- company_table_fields.id values (both are independent uuid sequences).
--
-- NOTE: company_custom_fields already has a dormant, unrelated
-- auto_generate/auto_generate_type/auto_generate_prefix trio (gated behind
-- field_type = 'auto_id' in the schema UI) that no creation path anywhere
-- reads -- this is a separate, actually-wired mechanism for ordinary
-- field_type = 'text' fields, matching the company_table_fields UX exactly
-- rather than reviving that dead stub.
ALTER TABLE company_custom_fields ADD COLUMN IF NOT EXISTS auto_number_prefix text;
ALTER TABLE company_custom_fields ADD COLUMN IF NOT EXISTS auto_number_start bigint;
ALTER TABLE company_custom_fields ADD COLUMN IF NOT EXISTS auto_number_pad int;

CREATE TABLE IF NOT EXISTS company_custom_field_sequences (
  field_id uuid PRIMARY KEY REFERENCES company_custom_fields(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  next_value bigint NOT NULL DEFAULT 1
);

-- No client policies on purpose, same as company_table_field_sequences --
-- RLS enabled with no policy denies all direct access; the counter is only
-- readable/writable through the SECURITY DEFINER function below.
ALTER TABLE company_custom_field_sequences ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION next_custom_field_sequence(p_field_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  p_actor uuid := auth.uid();
  v_field company_custom_fields%ROWTYPE;
  v_seq bigint;
  v_pad int;
  v_prefix text;
BEGIN
  SELECT * INTO v_field FROM company_custom_fields WHERE id = p_field_id;
  IF NOT FOUND OR v_field.auto_number_prefix IS NULL THEN
    RAISE EXCEPTION 'field is not auto-numbered';
  END IF;

  -- service_role bypasses the membership check (same precedent as
  -- archive_requests.sql's approve path) -- this RPC is called from four
  -- creation surfaces, two of which (the Teams/WhatsApp bot, the Gmail
  -- add-on) run server-side under the service role with no real auth.uid()
  -- to check against; the other two (the web "New Matter" modal, CSV
  -- import) run under a real signed-in session and still get the full
  -- membership check.
  IF auth.role() <> 'service_role' AND (p_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM company_memberships WHERE company_id = v_field.company_id AND user_id = p_actor
  )) THEN
    RAISE EXCEPTION 'not a member of this company';
  END IF;

  -- GREATEST applies auto_number_start as a floor on the conflict path too,
  -- so raising the start after numbers have been issued jumps the sequence
  -- forward instead of being silently ignored.
  INSERT INTO company_custom_field_sequences (field_id, company_id, next_value)
    VALUES (p_field_id, v_field.company_id, COALESCE(v_field.auto_number_start, 1) + 1)
  ON CONFLICT (field_id) DO UPDATE
    SET next_value = GREATEST(company_custom_field_sequences.next_value, COALESCE(v_field.auto_number_start, 1)) + 1
  RETURNING next_value - 1 INTO v_seq;

  v_prefix := replace(replace(replace(v_field.auto_number_prefix,
    '{YYYY}', to_char(now(), 'YYYY')),
    '{YY}',   to_char(now(), 'YY')),
    '{MM}',   to_char(now(), 'MM'));

  -- GREATEST with the number's own length so a small pad never truncates
  -- (lpad cuts text when the target length is shorter than the input).
  v_pad := COALESCE(v_field.auto_number_pad, 6);
  RETURN v_prefix || lpad(v_seq::text, GREATEST(v_pad, length(v_seq::text)), '0');
END;
$$;
