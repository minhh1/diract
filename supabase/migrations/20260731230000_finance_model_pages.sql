SET request.jwt.claim.role = 'service_role';

-- Public, shareable link for one entity's Finance Model -- mirrors
-- document_fill_pages/public_task_pages' shape (access-code-gated, admin
-- creates/revokes via an authenticated route, viewed unauthenticated via
-- app/public/finance-model/[pageId]). See lib/documentFillPageGate.ts for
-- the equivalent gating this table's public route follows
-- (lib/financeModelPageGate.ts).
CREATE TABLE finance_model_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  title text NOT NULL,
  access_code text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX finance_model_pages_entity_idx ON finance_model_pages (entity_id);

ALTER TABLE finance_model_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_model_pages_company ON finance_model_pages
  FOR ALL USING (company_id = active_company_id());
