-- Auto-provisioned virtual computers (remote desktop VMs), streamed into the
-- app via Apache Guacamole (see lib/guacamole.ts). Admin-assigned, not
-- self-service: a company_admin creates a VM (choosing provider, size,
-- protocol, region, and which company_cloud_credentials row to bill) and
-- assigns it to exactly one company member via assigned_user_id. Only that
-- member (or an admin) may view/connect to it -- enforced in the API layer,
-- not RLS, matching this codebase's existing admin-enforcement convention.
--
-- remote_username/remote_password are the credentials Guacamole uses to log
-- into the VM's desktop session (VNC/RDP), generated at provisioning time.

CREATE TABLE IF NOT EXISTS virtual_computers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  assigned_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  name text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('digitalocean', 'aws', 'gcp')),
  protocol text NOT NULL CHECK (protocol IN ('vnc', 'rdp')),
  size_slug text NOT NULL,
  region text NOT NULL,
  credential_id uuid REFERENCES company_cloud_credentials(id) ON DELETE SET NULL,
  provider_instance_id text,
  ip_address text,
  remote_username text,
  remote_password text,
  hourly_usd_at_creation numeric,
  status text NOT NULL DEFAULT 'provisioning'
    CHECK (status IN ('provisioning', 'running', 'error', 'destroying', 'destroyed')),
  error_message text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  destroyed_at timestamptz
);

CREATE INDEX IF NOT EXISTS virtual_computers_company_id_idx ON virtual_computers(company_id);
CREATE INDEX IF NOT EXISTS virtual_computers_assigned_user_id_idx ON virtual_computers(assigned_user_id);

ALTER TABLE virtual_computers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS virtual_computers_company_members ON virtual_computers;
CREATE POLICY virtual_computers_company_members ON virtual_computers
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
