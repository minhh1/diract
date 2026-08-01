SET request.jwt.claim.role = 'service_role';

-- Public, shareable link for the Residual Land Value Solver -- mirrors
-- finance_model_pages' shape (access-code-gated, admin creates/revokes via
-- an authenticated route, viewed unauthenticated via
-- app/public/residual-land-solver/[pageId]). Unlike the plain ungated
-- /public/residual-land-solver calculator, a shared page lets the customer
-- SAVE named calculations and come back to them later -- which is exactly
-- why it needs the page-id + access-code gate: saves are server-side
-- writes, so they only exist behind a link the company deliberately issued.
CREATE TABLE residual_land_solver_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  access_code text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX residual_land_solver_pages_project_idx ON residual_land_solver_pages (project_id);

ALTER TABLE residual_land_solver_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY residual_land_solver_pages_company ON residual_land_solver_pages
  FOR ALL USING (company_id = active_company_id());

-- One saved calculation per (page, name) -- the customer's own named
-- what-ifs. inputs is the FeasibilityInputs shape as jsonb, sanitized to
-- known numeric keys by the public route before it ever gets here (see
-- app/api/residual-land-solver-pages/public/[pageId]/route.ts). Saving an
-- existing name overwrites it (the route updates rather than erroring on
-- the unique constraint). company_id denormalized from the page so the
-- company RLS policy doesn't need a join.
CREATE TABLE residual_land_solver_saved_calcs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES residual_land_solver_pages(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  inputs jsonb NOT NULL,
  state text,
  gst_method text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, name)
);

CREATE INDEX residual_land_solver_saved_calcs_page_idx ON residual_land_solver_saved_calcs (page_id);

ALTER TABLE residual_land_solver_saved_calcs ENABLE ROW LEVEL SECURITY;
CREATE POLICY residual_land_solver_saved_calcs_company ON residual_land_solver_saved_calcs
  FOR ALL USING (company_id = active_company_id());
