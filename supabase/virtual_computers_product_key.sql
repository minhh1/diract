-- Lets an admin record the Windows product key activated inside a given VM
-- (see AdminVirtualComputersTab.tsx). Windows-on-DigitalOcean starts on
-- Microsoft's free evaluation license (see windowsCloudInitScript's own
-- comment in lib/vmProviders/digitalocean.ts) -- whoever's assigned still
-- has to activate it with a real key themselves, this just gives the admin
-- somewhere to track which key went where, including on already-destroyed
-- rows (deliberately never cleared on destroy) so it can be suggested again
-- next time a VM is created for the same person.
ALTER TABLE virtual_computers ADD COLUMN IF NOT EXISTS windows_product_key text;
