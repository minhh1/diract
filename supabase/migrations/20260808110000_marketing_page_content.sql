-- Dashboard-editable copy for the public marketing site (app/(marketing)/),
-- which is otherwise entirely static code. One table for every page kind
-- (home/audience hero pages now, feature-detail pages and legal pages in
-- later phases) so adding a new editable page never needs its own
-- migration -- just a new row and a new TS content shape.
--
-- This is scoped to exactly one company (a dedicated "Minh Huynh" company,
-- see scripts/createMinhHuynhCompany.ts) and, on top of that, locked to one
-- specific user id in the API layer (app/api/marketing-pages/*) -- RLS below
-- is the normal company-scoped pattern for defense in depth, but the real
-- "only this one person" guarantee can't live in RLS alone, since RLS can't
-- distinguish between two members of the same company.
--
-- published_content stays NULL until a page's first Publish -- the live
-- marketing route (app/(marketing)/page.tsx, .../for/[audience]/page.tsx)
-- falls back to its static code content whenever published_content is NULL,
-- so nothing on the real site changes until a page is deliberately
-- published.

CREATE TABLE IF NOT EXISTS marketing_page_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  page_key text NOT NULL,
  page_kind text NOT NULL CHECK (page_kind IN ('hero-spotlight', 'feature-detail', 'legal')),
  draft_content jsonb NOT NULL,
  published_content jsonb,
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS marketing_page_content_company_key_idx
  ON marketing_page_content(company_id, page_key);

ALTER TABLE marketing_page_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_page_content_company_members ON marketing_page_content;
CREATE POLICY marketing_page_content_company_members ON marketing_page_content
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
