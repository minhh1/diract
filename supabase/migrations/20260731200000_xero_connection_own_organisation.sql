SET request.jwt.claim.role = 'service_role';

-- Some companies only use Xero for their own firm's invoicing/accounting,
-- not to track individual client entities (see
-- components/admin/AdminXeroTab.tsx's "Link entities to a Xero
-- organisation" section, which previously only offered client `entities`
-- rows as link targets). Lets one connected Xero organisation per company
-- be marked as representing the company itself instead.
ALTER TABLE company_xero_connections ADD COLUMN IF NOT EXISTS is_own_organisation boolean NOT NULL DEFAULT false;

-- At most one "own organisation" connection per company -- enforced here
-- rather than only in application code so a race between two admins can't
-- leave two connections both marked as the company's own.
CREATE UNIQUE INDEX IF NOT EXISTS company_xero_connections_one_own_org_per_company
  ON company_xero_connections (company_id) WHERE is_own_organisation;
