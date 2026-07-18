import { digitalOceanProvider } from "./lib/vmProviders/digitalocean";

async function main() {
  const credentials = { api_token: process.env.DIGITALOCEAN_PLATFORM_API_TOKEN! };

  console.log("Creating droplet (VNC)...");
  const created = await digitalOceanProvider.createInstance({
    credentials,
    name: "niksen-flow-smoketest4",
    sizeSlug: "s-2vcpu-4gb",
    region: "syd1",
    protocol: "vnc",
    remoteUsername: "vcuser",
    remotePassword: "Test1234",
  });
  console.log("Created:", created);

  let ip: string | null = null;
  for (let i = 0; i < 20; i++) {
    const status = await digitalOceanProvider.getInstance(credentials, created.providerInstanceId);
    console.log(`[poll ${i}]`, status);
    if (status.status !== "provisioning") { ip = status.ipAddress; break; }
    await new Promise((r) => setTimeout(r, 5000));
  }
  if (!ip) throw new Error("never got an IP");

  console.log(`Droplet active at ${ip}. Checking VNC port 5901 reachability every 5s (this is the real regression test -- should succeed within ~60-90s, not several minutes)...`);
  const net = await import("net");
  const checkPort = () =>
    new Promise<boolean>((resolve) => {
      const sock = net.createConnection({ host: ip!, port: 5901, timeout: 3000 });
      sock.on("connect", () => { sock.destroy(); resolve(true); });
      sock.on("error", () => resolve(false));
      sock.on("timeout", () => { sock.destroy(); resolve(false); });
    });

  const start = Date.now();
  for (let i = 0; i < 40; i++) {
    const open = await checkPort();
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`[t=${elapsed}s] port 5901 ${open ? "OPEN" : "closed"}`);
    if (open) {
      console.log(`SUCCESS: VNC reachable after ${elapsed}s`);
      break;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }

  console.log(`DROPLET_ID=${created.providerInstanceId}`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
