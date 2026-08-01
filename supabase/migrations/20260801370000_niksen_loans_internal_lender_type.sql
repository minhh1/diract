SET request.jwt.claim.role = 'service_role';

-- Syncs the Niksen Loans board's own Lender Type column back to the
-- underlying schema's select_options -- client_update_page_fields
-- snapshots select_options at add-time (so display doesn't need a second
-- lookup per render, see fields/route.ts's own comment on this), so
-- editing the source company_table_fields row's options (as done here to
-- add "Internal" via the Schema Config UI) doesn't propagate to a page
-- that already added the column. No generic auto-sync exists for this --
-- a one-off catch-up like the earlier Private Lender addition.
UPDATE client_update_page_fields cupf
SET select_options = ctf.select_options
FROM company_table_fields ctf
WHERE cupf.page_id = (SELECT id FROM client_update_pages WHERE company_id = '32d4fb0e-007d-41e7-bc5e-638163c28e3d' AND slug = 'niksen-loans')
  AND cupf.field_source = 'base' AND cupf.label = 'Lender Type'
  AND ctf.id::text = cupf.field_key;
