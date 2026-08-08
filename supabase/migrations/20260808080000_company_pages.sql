-- AI-authored content pages ("Pages" -> Content pages sub-tab, see
-- components/settings/ContentPagesTab.tsx). Distinct from document_fill_pages/
-- client_update_pages/finance_model_pages/residual_land_solver_pages -- this
-- is a generic, freeform page a firm can ask the AI to draft (service info,
-- policy pages, matter-specific explainers), not tied to a fixed record
-- template.
--
-- visibility is a REAL, enforced per-page setting, not an accident of URL
-- obscurity like the other page tables above -- 'company' pages are only
-- ever reachable through the authenticated RLS policy below; the public API
-- route (app/api/pages/public/[slug]/route.ts) explicitly refuses to serve
-- them. 'client' behaves like client_update_pages' access_code gate;
-- 'public' has no gate at all.
--
-- blocks is a jsonb array of typed content blocks (see lib/pages/blockTypes.ts)
-- from a small fixed vocabulary, never raw HTML -- the actual code-injection
-- defense is that nothing in this app ever parses `blocks` as markup (see
-- lib/pages/validateBlocks.ts and components/pages/PageBlockRenderer.tsx),
-- not a sanitizer run over untrusted HTML.
-- slug is globally unique (not company-scoped) -- matches client_update_pages'
-- convention, since the public URL (/public/pages/[slug]) addresses a page by
-- slug alone with no company id in the path.
CREATE TABLE IF NOT EXISTS company_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL,
  visibility text NOT NULL DEFAULT 'company' CHECK (visibility IN ('company', 'client', 'public')),
  access_code text,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  blocks jsonb NOT NULL DEFAULT '[]',
  ai_prompt text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS company_pages_company_id_idx ON company_pages(company_id) WHERE deleted_at IS NULL;

ALTER TABLE company_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_pages_company_members ON company_pages;
CREATE POLICY company_pages_company_members ON company_pages
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
