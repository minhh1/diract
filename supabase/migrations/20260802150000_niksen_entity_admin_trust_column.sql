SET request.jwt.claim.role = 'service_role';

-- Adds the Trust column to the Niksen Entity Admin board.
--
-- The link itself already exists and is already resolvable: 39 of the 41
-- corporate trustees have an entity_relationships row
-- (relationship_type='Trustee', parent = the trust, child = the trustee),
-- and lib/clientUpdatePageDetail.ts already resolves a field_source
-- 'entity_relation' column straight off it. It was only ever visible by
-- expanding a row into EntityOfficeholdersPanel -- there was no column, so
-- you could not see at a glance which trust a trustee acts for, sort by
-- it, or spot the ones with no trust recorded.
--
-- field_key must be exactly 'trust_link' -- the fields route validates
-- that for the entity_relation source. Inserted at display_order 2, right
-- after Entity Type, shifting the rest down: a trustee's trust belongs
-- next to what kind of entity it is, not at the far right past the bank
-- details.
DO $$
DECLARE
  v_page_id uuid;
BEGIN
  SELECT id INTO v_page_id FROM client_update_pages
   WHERE company_id = '32d4fb0e-007d-41e7-bc5e-638163c28e3d' AND slug = 'niksen-entity-admin';
  IF v_page_id IS NULL THEN
    RAISE EXCEPTION 'niksen-entity-admin page not found';
  END IF;

  IF EXISTS (SELECT 1 FROM client_update_page_fields
              WHERE page_id = v_page_id AND field_source = 'entity_relation' AND field_key = 'trust_link') THEN
    RETURN; -- already added
  END IF;

  UPDATE client_update_page_fields
     SET display_order = display_order + 1
   WHERE page_id = v_page_id AND display_order >= 2;

  INSERT INTO client_update_page_fields (page_id, field_source, field_key, label, display_order, client_visible, field_type)
  VALUES (v_page_id, 'entity_relation', 'trust_link', 'Trust', 2, true, 'text');
END $$;
