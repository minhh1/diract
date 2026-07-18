// lib/vmProviders/digitalocean.ts
// DigitalOcean Droplets adapter -- Phase 1's only provisionable provider
// (see lib/vmProviders/registry.ts). Talks to DO's plain bearer-token REST
// API directly, mirroring the fetch-wrapper style in lib/gotenberg.ts
// (try/catch around fetch, res.ok check, truncated error body).
import type {
  CreateInstanceParams,
  CreateInstanceResult,
  InstanceStatus,
  ProviderCredentials,
  VmProtocol,
  VmProvider,
} from "./types";

const DO_API_URL = "https://api.digitalocean.com/v2";
const DROPLET_IMAGE = "ubuntu-22-04-x64";

// cloud-init user_data that installs a desktop + the requested remote
// protocol's server, plus a baseline of everyday apps (browser, office
// suite, text editor) so a fresh VM is actually usable, not just a bare
// desktop shell. guacd connects straight to the VM's VNC/RDP port over
// TCP -- no websocket proxy needed on the VM side, Guacamole handles that.
//
// Ordering matters here: our status polling marks a VM "running" as soon
// as the provider's hypervisor reports the droplet booted (tens of
// seconds), not when cloud-init actually finishes. So the desktop + VNC/RDP
// server MUST be installed and started first -- if the browser/office apps
// install first, a user hitting Connect right after "running" gets nothing
// listening on the VNC/RDP port yet, which Guacamole reports as "An
// internal error has occurred ... connection has been terminated" (this
// was a real regression the first time these apps were added). The extra
// apps install afterwards, in the background, once the session is usable.
//
// Firefox is installed from Mozilla's own APT repo rather than `apt-get
// install firefox` -- as of Ubuntu 22.04, the archive package is a
// transitional snap stub, and installing snaps from cloud-init is slow and
// flaky (snapd needs to initialize first). The pinning step ensures our
// repo's Firefox wins over any Ubuntu-provided package of the same name.
function cloudInitScript(protocol: VmProtocol, username: string, password: string): string {
  const escapedPassword = password.replace(/'/g, "'\\''");
  const escapedUsername = username.replace(/'/g, "'\\''");
  const userSetup = `#cloud-config
users:
  - name: ${escapedUsername}
    groups: sudo
    shell: /bin/bash
    lock_passwd: false
runcmd:
  - echo '${escapedUsername}:${escapedPassword}' | chpasswd
  - apt-get update`;

  const extraApps = `  - install -d -m 0755 /etc/apt/keyrings
  - wget -q https://packages.mozilla.org/apt/repo-signing-key.gpg -O /etc/apt/keyrings/packages.mozilla.org.asc
  - sh -c 'echo "deb [signed-by=/etc/apt/keyrings/packages.mozilla.org.asc] https://packages.mozilla.org/apt mozilla main" > /etc/apt/sources.list.d/mozilla.list'
  - sh -c 'printf "Package: *\\nPin: origin packages.mozilla.org\\nPin-Priority: 1000\\n" > /etc/apt/preferences.d/mozilla'
  - apt-get update
  - DEBIAN_FRONTEND=noninteractive apt-get install -y firefox libreoffice-writer libreoffice-calc libreoffice-impress mousepad`;

  if (protocol === "vnc") {
    return `${userSetup}
  - DEBIAN_FRONTEND=noninteractive apt-get install -y xfce4 xfce4-goodies tigervnc-standalone-server
  - su - ${escapedUsername} -c "mkdir -p ~/.vnc"
  - su - ${escapedUsername} -c "echo '${escapedPassword}' | vncpasswd -f > ~/.vnc/passwd"
  - su - ${escapedUsername} -c "chmod 600 ~/.vnc/passwd"
  - su - ${escapedUsername} -c "printf '#!/bin/sh\\nstartxfce4 &\\n' > ~/.vnc/xstartup"
  - su - ${escapedUsername} -c "chmod +x ~/.vnc/xstartup"
  - su - ${escapedUsername} -c "vncserver -localhost no :1"
${extraApps}
`;
  }

  return `${userSetup}
  - DEBIAN_FRONTEND=noninteractive apt-get install -y xfce4 xfce4-goodies xrdp
  - echo xfce4-session > /home/${escapedUsername}/.xsession
  - chown ${escapedUsername}:${escapedUsername} /home/${escapedUsername}/.xsession
  - adduser xrdp ssl-cert
  - systemctl enable --now xrdp
${extraApps}
`;
}

async function doFetch(credentials: ProviderCredentials, path: string, init?: RequestInit): Promise<Response> {
  const token = credentials.api_token;
  if (!token) throw new Error("Missing DigitalOcean api_token credential.");
  try {
    return await fetch(`${DO_API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...init?.headers,
      },
    });
  } catch {
    throw new Error(`Could not reach the DigitalOcean API at ${DO_API_URL}.`);
  }
}

async function throwIfNotOk(res: Response, action: string): Promise<void> {
  if (res.ok) return;
  const text = await res.text().catch(() => "");
  throw new Error(`DigitalOcean ${action} failed (${res.status}): ${text.slice(0, 200) || "unknown error"}`);
}

// DigitalOcean's droplet `name` must be a valid hostname (letters, digits,
// `.` and `-` only) -- our own `name` field is an arbitrary display name
// (e.g. "Minh's Virtual Computer") that admins type freely, so it has to be
// slugified before being sent, not passed through as-is (this previously
// caused real 422s: "Only valid hostname characters are allowed").
function toDropletHostname(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
  return slug || `vm-${Date.now()}`;
}

export const digitalOceanProvider: VmProvider = {
  id: "digitalocean",

  async createInstance(params: CreateInstanceParams): Promise<CreateInstanceResult> {
    const res = await doFetch(params.credentials, "/droplets", {
      method: "POST",
      body: JSON.stringify({
        name: toDropletHostname(params.name),
        region: params.region,
        size: params.sizeSlug,
        image: DROPLET_IMAGE,
        user_data: cloudInitScript(params.protocol, params.remoteUsername, params.remotePassword),
        ipv6: false,
      }),
    });
    await throwIfNotOk(res, "droplet creation");
    const data = await res.json();
    return { providerInstanceId: String(data.droplet.id), ipAddress: null };
  },

  async getInstance(credentials: ProviderCredentials, providerInstanceId: string): Promise<InstanceStatus> {
    const res = await doFetch(credentials, `/droplets/${providerInstanceId}`);
    await throwIfNotOk(res, "droplet lookup");
    const data = await res.json();
    const droplet = data.droplet;
    const networks: Array<{ type: string; ip_address: string }> = droplet.networks?.v4 ?? [];
    const publicIp = networks.find((n) => n.type === "public");
    return {
      providerInstanceId,
      status: droplet.status === "active" ? "running" : droplet.status === "errored" ? "error" : "provisioning",
      ipAddress: publicIp?.ip_address ?? null,
    };
  },

  async destroyInstance(credentials: ProviderCredentials, providerInstanceId: string): Promise<void> {
    const res = await doFetch(credentials, `/droplets/${providerInstanceId}`, { method: "DELETE" });
    if (res.status === 404) return;
    await throwIfNotOk(res, "droplet deletion");
  },
};
