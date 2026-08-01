SET request.jwt.claim.role = 'service_role';

-- A single unauthenticated link that shows a company's public boards,
-- Finance Model pages and Residual Land Solver pages together in one
-- tabbed page (app/public/demo/[token], served by
-- app/api/public-demo/[token]/route.ts) -- built for demoing the product
-- to a prospect who shouldn't have to create an account first.
--
-- SECURITY POSTURE, STATED PLAINLY: this is security by obscurity. The
-- row id IS the bearer token in the URL; anyone who has the link sees
-- everything the hub exposes, and a forwarded link cannot be
-- distinguished from the intended recipient. That is a deliberate
-- trade-off for a time-boxed sales demo, NOT a general sharing feature,
-- which is why two guard rails are mandatory rather than optional:
--   * expires_at is NOT NULL -- every hub dies on its own, so a link
--     that leaks has a bounded blast radius even if nobody remembers to
--     revoke it. The API refuses an expired hub.
--   * is_active allows instant manual revocation.
-- Everything reached through a hub is READ-ONLY: it renders the existing
-- public components, whose anonymous paths are already view-only (a
-- client-update board gives read + notes, the Finance Model page gives
-- Budget vs Actual only). The hub adds no write path of its own.
CREATE TABLE IF NOT EXISTS public_demo_hubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz NOT NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS public_demo_hubs_company_idx ON public_demo_hubs (company_id);

ALTER TABLE public_demo_hubs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS public_demo_hubs_company ON public_demo_hubs;
CREATE POLICY public_demo_hubs_company ON public_demo_hubs
  FOR ALL USING (company_id = active_company_id());
