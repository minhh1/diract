SET request.jwt.claim.role = 'service_role';

-- Moves entities.abn/acn/tfn/bsb/account_number/bank_name/nab_connect_id/
-- trust_deed_date off native hardcoded columns onto the generic
-- company_custom_fields/company_custom_field_values system, for every
-- company (not just Niksen Time Pty Ltd, which is the only company these
-- were previously wired into a board for), then drops the native columns.
-- abn/acn use the new 'abn'/'acn' field types (components/schema/types.ts),
-- which get checksum validation + an ABN Lookup "Verify" button
-- (components/dashboard/FieldValueInput.tsx); the rest stay plain
-- text/date. chk_valid_abn/chk_valid_acn (CHECK (is_valid_abn(abn)) etc.)
-- and is_valid_abn()/is_valid_acn()/is_valid_tfn() were created directly
-- against this database and were never captured in a tracked migration --
-- confirmed live via `supabase db query --linked` before writing this file.
--
-- Live-data check before writing this migration: of these 8 fields, only
-- tfn has real data (50 rows, all in Niksen Time Pty Ltd) -- abn, acn, bsb,
-- account_number, bank_name, nab_connect_id, trust_deed_date are 0/787
-- populated across every company. The data-copy step below still runs for
-- all 8 for correctness/future-proofing.

-- 0. company_custom_fields/company_table_fields/client_update_page_fields
-- each have a live field_type CHECK constraint (created directly against
-- this database, like chk_valid_abn below -- confirmed via
-- `supabase db query --linked`, not present in any tracked migration) that
-- doesn't know about the new 'abn'/'acn' types yet. Widen all three so the
-- new type is usable everywhere a custom field can be defined, not just on
-- entities.
ALTER TABLE company_custom_fields DROP CONSTRAINT IF EXISTS company_custom_fields_field_type_check;
ALTER TABLE company_custom_fields ADD CONSTRAINT company_custom_fields_field_type_check
  CHECK (field_type = ANY (ARRAY['text','number','date','boolean','select','auto_id','email','url','currency','link','property','entity','abn','acn']));

ALTER TABLE company_table_fields DROP CONSTRAINT IF EXISTS company_table_fields_field_type_check;
ALTER TABLE company_table_fields ADD CONSTRAINT company_table_fields_field_type_check
  CHECK (field_type = ANY (ARRAY['text','number','date','boolean','select','email','url','currency','auto_id','property','entity','project','table_relation','abn','acn']));

ALTER TABLE client_update_page_fields DROP CONSTRAINT IF EXISTS client_update_page_fields_field_type_check;
ALTER TABLE client_update_page_fields ADD CONSTRAINT client_update_page_fields_field_type_check
  CHECK (field_type = ANY (ARRAY['text','select','date','number','currency','boolean','abn','acn']));

-- 1. New custom fields, per company (guarded so re-running this file, or a
-- company that already had one of these keys some other way, is a no-op).
INSERT INTO company_custom_fields (company_id, table_name, field_key, label, field_type, select_options, display_order)
SELECT c.id, 'entities', v.field_key, v.label, v.field_type, NULL::jsonb,
  base.max_order + ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY v.ord)
FROM companies c
CROSS JOIN (VALUES
  ('abn',             'ABN',                 'abn',  1),
  ('acn',             'ACN',                 'acn',  2),
  ('tfn',             'TFN',                 'text', 3),
  ('trust_deed_date', 'Trust Deed Date',     'date', 4),
  ('bank_name',       'Bank (Institution)',  'text', 5),
  ('bsb',             'Bank BSB',            'text', 6),
  ('account_number',  'Bank Account Number', 'text', 7),
  ('nab_connect_id',  'NAB Connect Linked',  'text', 8)
) AS v(field_key, label, field_type, ord)
JOIN LATERAL (
  SELECT COALESCE(MAX(display_order), 0) AS max_order
  FROM company_custom_fields WHERE company_id = c.id AND table_name = 'entities'
) base ON true
WHERE NOT EXISTS (
  SELECT 1 FROM company_custom_fields x
  WHERE x.company_id = c.id AND x.table_name = 'entities' AND x.field_key = v.field_key AND x.deleted_at IS NULL
);

-- 2. Copy any existing native-column data into company_custom_field_values
-- before the columns are dropped (in practice this only moves real data for
-- tfn -- see the live-data check above -- but runs for all 8 either way).
INSERT INTO company_custom_field_values (company_id, table_name, record_id, field_id, value_text)
SELECT e.company_id, 'entities', e.id, f.id, e.abn
FROM entities e
JOIN company_custom_fields f ON f.company_id = e.company_id AND f.table_name = 'entities' AND f.field_key = 'abn' AND f.deleted_at IS NULL
WHERE e.abn IS NOT NULL AND e.abn <> ''
ON CONFLICT (field_id, record_id) DO UPDATE SET value_text = EXCLUDED.value_text;

INSERT INTO company_custom_field_values (company_id, table_name, record_id, field_id, value_text)
SELECT e.company_id, 'entities', e.id, f.id, e.acn
FROM entities e
JOIN company_custom_fields f ON f.company_id = e.company_id AND f.table_name = 'entities' AND f.field_key = 'acn' AND f.deleted_at IS NULL
WHERE e.acn IS NOT NULL AND e.acn <> ''
ON CONFLICT (field_id, record_id) DO UPDATE SET value_text = EXCLUDED.value_text;

INSERT INTO company_custom_field_values (company_id, table_name, record_id, field_id, value_text)
SELECT e.company_id, 'entities', e.id, f.id, e.tfn
FROM entities e
JOIN company_custom_fields f ON f.company_id = e.company_id AND f.table_name = 'entities' AND f.field_key = 'tfn' AND f.deleted_at IS NULL
WHERE e.tfn IS NOT NULL AND e.tfn <> ''
ON CONFLICT (field_id, record_id) DO UPDATE SET value_text = EXCLUDED.value_text;

INSERT INTO company_custom_field_values (company_id, table_name, record_id, field_id, value_text)
SELECT e.company_id, 'entities', e.id, f.id, e.bsb
FROM entities e
JOIN company_custom_fields f ON f.company_id = e.company_id AND f.table_name = 'entities' AND f.field_key = 'bsb' AND f.deleted_at IS NULL
WHERE e.bsb IS NOT NULL AND e.bsb <> ''
ON CONFLICT (field_id, record_id) DO UPDATE SET value_text = EXCLUDED.value_text;

INSERT INTO company_custom_field_values (company_id, table_name, record_id, field_id, value_text)
SELECT e.company_id, 'entities', e.id, f.id, e.account_number
FROM entities e
JOIN company_custom_fields f ON f.company_id = e.company_id AND f.table_name = 'entities' AND f.field_key = 'account_number' AND f.deleted_at IS NULL
WHERE e.account_number IS NOT NULL AND e.account_number <> ''
ON CONFLICT (field_id, record_id) DO UPDATE SET value_text = EXCLUDED.value_text;

INSERT INTO company_custom_field_values (company_id, table_name, record_id, field_id, value_text)
SELECT e.company_id, 'entities', e.id, f.id, e.bank_name
FROM entities e
JOIN company_custom_fields f ON f.company_id = e.company_id AND f.table_name = 'entities' AND f.field_key = 'bank_name' AND f.deleted_at IS NULL
WHERE e.bank_name IS NOT NULL AND e.bank_name <> ''
ON CONFLICT (field_id, record_id) DO UPDATE SET value_text = EXCLUDED.value_text;

INSERT INTO company_custom_field_values (company_id, table_name, record_id, field_id, value_text)
SELECT e.company_id, 'entities', e.id, f.id, e.nab_connect_id
FROM entities e
JOIN company_custom_fields f ON f.company_id = e.company_id AND f.table_name = 'entities' AND f.field_key = 'nab_connect_id' AND f.deleted_at IS NULL
WHERE e.nab_connect_id IS NOT NULL AND e.nab_connect_id <> ''
ON CONFLICT (field_id, record_id) DO UPDATE SET value_text = EXCLUDED.value_text;

INSERT INTO company_custom_field_values (company_id, table_name, record_id, field_id, value_date)
SELECT e.company_id, 'entities', e.id, f.id, e.trust_deed_date
FROM entities e
JOIN company_custom_fields f ON f.company_id = e.company_id AND f.table_name = 'entities' AND f.field_key = 'trust_deed_date' AND f.deleted_at IS NULL
WHERE e.trust_deed_date IS NOT NULL
ON CONFLICT (field_id, record_id) DO UPDATE SET value_date = EXCLUDED.value_date;

-- 3. Repoint the "Invalid TFN" irregularity rule (auto_fed_rules) off the
-- native column onto the new custom field. auto_fed_recompute() executes
-- condition_sql as `SELECT (%s) FROM entities r WHERE r.id = $1` for a
-- system-table registry, so `r` below is still the entities row.
-- target_field_key is repointed too (not just condition_sql) -- it's what
-- auto_fed_upsert_item() copies onto *newly created* irregularity items'
-- own target_field_key value, and what app/api/client-update-pages/[id]/
-- items/[itemId]/fix/route.ts reads to know whether to edit a native column
-- or a company_custom_fields.id.
UPDATE auto_fed_rules
SET condition_sql = $sql$EXISTS (
  SELECT 1 FROM company_custom_field_values v
  JOIN company_custom_fields f ON f.id = v.field_id
  WHERE f.table_name = 'entities' AND f.field_key = 'tfn' AND f.company_id = r.company_id
    AND v.record_id = r.id
    AND v.value_text IS NOT NULL AND btrim(v.value_text) <> '' AND NOT is_valid_tfn(v.value_text)
)$sql$,
    target_field_key = (
      SELECT f.id::text FROM company_custom_fields f
      JOIN auto_fed_registries reg ON reg.company_id = f.company_id
      WHERE reg.id = auto_fed_rules.registry_id AND f.table_name = 'entities' AND f.field_key = 'tfn' AND f.deleted_at IS NULL
    )
WHERE id = '9a8753e1-fb3c-48df-9c46-fa2be97e7063';

-- 3b. Existing (already-open) "Invalid TFN" irregularity items were created
-- with target_field_key = 'tfn' baked into their own company_table_values
-- row (auto_fed_upsert_item only ever sets it once, at creation -- it won't
-- retroactively pick up the auto_fed_rules change above). Repoint those too,
-- so the fix-route resolves them correctly instead of hitting the dropped
-- native column.
UPDATE company_table_values v
SET value_text = f.id::text
FROM company_table_fields tf, company_custom_fields f
WHERE tf.id = v.field_id AND tf.field_key = 'target_field_key' AND tf.deleted_at IS NULL
  AND v.value_text = 'tfn'
  AND f.company_id = v.company_id AND f.table_name = 'entities' AND f.field_key = 'tfn' AND f.deleted_at IS NULL;

-- 4. Repoint Niksen Time Pty Ltd's entity-admin board columns (added by
-- 20260729100000_niksen_entity_admin_board.sql) from field_source='base'
-- (native column name in field_key) to field_source='custom' (the
-- company_custom_fields.id, as text, in field_key -- same convention every
-- other custom-field board column already uses).
UPDATE client_update_page_fields cupf
SET field_source = 'custom',
    field_key = f.id::text,
    field_type = f.field_type
FROM company_custom_fields f
WHERE cupf.page_id = 'bf97f02a-04e2-46ac-b64b-19ba4a3baf27'
  AND cupf.field_source = 'base'
  AND f.company_id = '32d4fb0e-007d-41e7-bc5e-638163c28e3d'
  AND f.table_name = 'entities'
  AND f.field_key = cupf.field_key
  AND f.deleted_at IS NULL;

-- 5. Rewrite find_entity_duplicates() to resolve abn/acn from the new
-- custom-field storage instead of the (about to be dropped) native columns.
-- Output shape unchanged (abn1/acn1/abn2/acn2) so app/dashboard/settings/
-- page.tsx needs no change.
CREATE OR REPLACE FUNCTION public.find_entity_duplicates(similarity_threshold double precision, target_company_id uuid)
 RETURNS TABLE(id1 uuid, name1 text, type1 text, abn1 text, acn1 text, id2 uuid, name2 text, type2 text, abn2 text, acn2 text, match_score integer, match_reason text)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    WITH abn_field AS (
      SELECT id FROM company_custom_fields WHERE company_id = target_company_id AND table_name = 'entities' AND field_key = 'abn' AND deleted_at IS NULL
    ), acn_field AS (
      SELECT id FROM company_custom_fields WHERE company_id = target_company_id AND table_name = 'entities' AND field_key = 'acn' AND deleted_at IS NULL
    ), entity_ids AS (
      SELECT e.id, e.name, e.entity_type,
        (SELECT v.value_text FROM company_custom_field_values v WHERE v.field_id = (SELECT id FROM abn_field) AND v.record_id = e.id) AS abn,
        (SELECT v.value_text FROM company_custom_field_values v WHERE v.field_id = (SELECT id FROM acn_field) AND v.record_id = e.id) AS acn
      FROM entities e
      WHERE e.company_id = target_company_id AND e.deleted_at IS NULL
    )
    SELECT
        a.id as id1, a.name as name1, a.entity_type as type1, a.abn as abn1, a.acn as acn1,
        b.id as id2, b.name as name2, b.entity_type as type2, b.abn as abn2, b.acn as acn2,
        (
          (CASE WHEN similarity(a.name, b.name) > similarity_threshold THEN 1 ELSE 0 END) +
          (CASE WHEN a.abn = b.abn AND a.abn IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN a.acn = b.acn AND a.acn IS NOT NULL THEN 1 ELSE 0 END)
        ) as match_score,
        concat_ws(', ',
            CASE WHEN similarity(a.name, b.name) > similarity_threshold THEN 'Name similarity' ELSE NULL END,
            CASE WHEN a.abn = b.abn THEN 'ABN match' ELSE NULL END,
            CASE WHEN a.acn = b.acn THEN 'ACN match' ELSE NULL END
        ) as match_reason
    FROM entity_ids a
    JOIN entity_ids b ON a.id < b.id
    WHERE (
        (CASE WHEN similarity(a.name, b.name) > similarity_threshold THEN 1 ELSE 0 END) +
        (CASE WHEN a.abn = b.abn AND a.abn IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN a.acn = b.acn AND a.acn IS NOT NULL THEN 1 ELSE 0 END)
    ) >= 1
    ORDER BY match_score DESC;
END;
$function$;

-- 6. Drop the CHECK constraints (only enforceable while the columns exist)
-- and the native columns themselves. is_valid_abn()/is_valid_acn()/
-- is_valid_tfn() are left in place -- is_valid_tfn is still used by the
-- repointed rule above, and all three remain available for reuse.
ALTER TABLE entities DROP CONSTRAINT IF EXISTS chk_valid_abn;
ALTER TABLE entities DROP CONSTRAINT IF EXISTS chk_valid_acn;

ALTER TABLE entities
  DROP COLUMN IF EXISTS abn,
  DROP COLUMN IF EXISTS acn,
  DROP COLUMN IF EXISTS tfn,
  DROP COLUMN IF EXISTS bsb,
  DROP COLUMN IF EXISTS account_number,
  DROP COLUMN IF EXISTS bank_name,
  DROP COLUMN IF EXISTS nab_connect_id,
  DROP COLUMN IF EXISTS trust_deed_date;
