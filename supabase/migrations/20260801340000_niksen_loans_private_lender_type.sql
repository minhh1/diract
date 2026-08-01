SET request.jwt.claim.role = 'service_role';

-- Adds "Private Lender" as its own Lender Type, distinct from Senior/
-- Mezzanine -- private lenders in this portfolio (GAP, La Trobe, Blue
-- Steak, Assetline, Jam Capital, etc.) run shorter terms at materially
-- higher interest than a bank facility, so lumping them under Senior/
-- Mezzanine (as the earlier reclassification pass did) hid that
-- distinction. Existing rows are reclassified in a follow-up data pass,
-- not this migration -- this only widens the two select_options lists
-- that actually gate what value can be chosen.
UPDATE company_table_fields SET select_options = '["Senior","Mezzanine","Private Lender","Money Partner","Other"]'::jsonb
WHERE table_id = (SELECT id FROM company_tables WHERE company_id = '32d4fb0e-007d-41e7-bc5e-638163c28e3d' AND slug = 'finance-model-loans' AND deleted_at IS NULL)
  AND field_key = 'lender_type';

UPDATE client_update_page_fields SET select_options = '["Senior","Mezzanine","Private Lender","Money Partner","Other"]'::jsonb
WHERE page_id = (SELECT id FROM client_update_pages WHERE company_id = '32d4fb0e-007d-41e7-bc5e-638163c28e3d' AND slug = 'niksen-loans')
  AND label = 'Lender Type';
