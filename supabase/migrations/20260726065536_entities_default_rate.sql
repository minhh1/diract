-- Per-entity default billing rate. Time & Fee Entries' "Staff" field points
-- at entities (filtered to the signed-in user's own linked_profile_id row --
-- see supabase/entities_contact_fields.sql), not at profiles directly, and
-- a rate is inherently per-company (the same person could bill differently
-- at a different company), so this lives on entities rather than the
-- cross-company profiles table. GST is NOT baked in here -- Time & Fee
-- Entries already computes GST as 10% of Amount via its own formula field
-- (see the "GST" field's formula_type = 'percentage_of'), so this stores
-- the same pre-GST base the Rate field itself holds.
ALTER TABLE entities ADD COLUMN IF NOT EXISTS default_rate numeric;

-- Backfill for Huynh Lawyers. Only Minh had a Staff entity linked to his
-- profile at all (see the "Huynh, Minh" row below) -- Jason/Hoang/Huy/Tommy
-- had no entities row with linked_profile_id set, meaning the Staff field
-- (restricted to "signed-in user only") had no candidate to auto-select for
-- any of them. Naming matches the existing "Lastname, Firstname" convention
-- already used for "Huynh, Minh".
DO $$
DECLARE
  v_company_id uuid := 'a49b484d-100d-4c3e-b3b6-69c1a18cc783'; -- Huynh Lawyers
BEGIN
  UPDATE entities SET default_rate = 350
    WHERE id = '03981eff-cfe3-4ccb-8fdf-16e16735ce95'; -- Huynh, Minh

  INSERT INTO entities (company_id, name, entity_type, linked_profile_id, default_rate)
  VALUES
    (v_company_id, 'Cao, Jason', 'Person', 'cc777329-c02a-4fb0-a852-877e33874303', 350),  -- Jason Cao
    (v_company_id, 'Chau, Hoang', 'Person', '82724151-2a57-423f-a8fe-8e873aa1d4da', 150),  -- Hoang Chau
    (v_company_id, 'Pham, Huy', 'Person', '83c2ebbf-7c33-4dcf-9451-cc69f1c0ae0f', 150),   -- Huy Pham
    (v_company_id, 'Ha, Tommy', 'Person', 'a127b96e-4993-49a9-86bc-2f305f9121ca', 150);   -- Tommy Ha
END $$;
