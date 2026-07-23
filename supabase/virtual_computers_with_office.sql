-- Marks DigitalOcean Linux/RDP virtual computers that also run a hidden
-- dockur/windows guest with Microsoft Office, projected onto the GNOME
-- desktop as individual app windows via WinApps/FreeRDP RemoteApp (see
-- lib/vmProviders/digitalocean.ts). Only ever true for os = 'linux' rows --
-- Windows VMs get Office installed directly instead.
ALTER TABLE virtual_computers ADD COLUMN IF NOT EXISTS with_office boolean NOT NULL DEFAULT false;
