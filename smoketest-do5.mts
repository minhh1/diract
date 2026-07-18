// Diagnostic: same script as the real (fixed) VNC cloud-init, plus an SSH
// key, so we can watch what's actually happening instead of blind-polling
// the VNC port from outside.
import fs from "fs";

const DO_API_URL = "https://api.digitalocean.com/v2";
const token = process.env.DIGITALOCEAN_PLATFORM_API_TOKEN!;
const pubKey = fs.readFileSync("/tmp/do_diag_key.pub", "utf8").trim();
const username = "vcuser";
const password = "Test1234";

const userData = `#cloud-config
users:
  - name: ${username}
    groups: sudo
    shell: /bin/bash
    lock_passwd: false
    ssh_authorized_keys:
      - ${pubKey}
runcmd:
  - echo '${username}:${password}' | chpasswd
  - apt-get update
  - DEBIAN_FRONTEND=noninteractive apt-get install -y xfce4 xfce4-goodies tigervnc-standalone-server
  - su - ${username} -c "mkdir -p ~/.vnc"
  - su - ${username} -c "echo '${password}' | vncpasswd -f > ~/.vnc/passwd"
  - su - ${username} -c "chmod 600 ~/.vnc/passwd"
  - su - ${username} -c "printf '#!/bin/sh\\nstartxfce4 &\\n' > ~/.vnc/xstartup"
  - su - ${username} -c "chmod +x ~/.vnc/xstartup"
  - su - ${username} -c "vncserver -localhost no :1"
  - touch /tmp/vnc-step-done
`;

async function main() {
  const createRes = await fetch(`${DO_API_URL}/droplets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: "niksen-flow-smoketest5",
      region: "syd1",
      size: "s-2vcpu-4gb",
      image: "ubuntu-22-04-x64",
      user_data: userData,
      ipv6: false,
    }),
  });
  const createData = await createRes.json();
  if (!createRes.ok) throw new Error(JSON.stringify(createData));
  const dropletId = createData.droplet.id;
  console.log("Created droplet:", dropletId);

  let ip: string | null = null;
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${DO_API_URL}/droplets/${dropletId}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    const status = data.droplet.status;
    const publicIp = (data.droplet.networks?.v4 ?? []).find((n: any) => n.type === "public")?.ip_address ?? null;
    console.log(`[poll ${i}] status=${status} ip=${publicIp}`);
    if (status === "active" && publicIp) { ip = publicIp; break; }
    await new Promise((r) => setTimeout(r, 5000));
  }
  if (!ip) throw new Error("never active");
  console.log(`DROPLET_ID=${dropletId} IP=${ip}`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
