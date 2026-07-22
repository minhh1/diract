-- Counts automatic destroy+recreate retries triggered by a failed post-
-- install RDP login check on Windows-on-DigitalOcean VMs (see
-- lib/vmProviders/windowsLoginCheck.ts and reconcileProvisioningVm in
-- app/api/virtual-computers/_lib.ts). dockur/windows occasionally leaves the
-- guest's Administrator account unable to log in after a from-scratch
-- install with no way to fix it post-hoc, so the only real remedy is
-- retrying the whole install -- capped here so a VM that keeps failing
-- doesn't retry forever.
ALTER TABLE virtual_computers ADD COLUMN IF NOT EXISTS windows_verify_attempts integer NOT NULL DEFAULT 0;
