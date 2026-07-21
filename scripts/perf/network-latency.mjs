#!/usr/bin/env node
// scripts/perf/network-latency.mjs
// Tier 1 of the VM performance test suite (see scripts/perf/README.md):
// raw TCP connect time to the Guacamole gateway and to a given VM's own
// remote-desktop port, with no browser/session overhead at all. This is
// the same measurement style used to first diagnose the region-latency
// problem (see lib/vmProviders/regions.ts's latencyTier comment) --
// formalized here so it can be re-run and compared over time instead of
// one-off curl commands.
import { connect } from "net";
import { writeFileSync } from "fs";
import { join } from "path";

const GUACAMOLE_HOST = process.env.NEXT_PUBLIC_GUACAMOLE_URL
  ? new URL(process.env.NEXT_PUBLIC_GUACAMOLE_URL).hostname
  : "diract-guacamole-syd.fly.dev";

function tcpConnectMs(host, port, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const start = performance.now();
    const socket = connect({ host, port, timeout: timeoutMs });
    socket.on("connect", () => {
      const ms = performance.now() - start;
      socket.destroy();
      resolve({ ok: true, ms: Math.round(ms * 100) / 100 });
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ ok: false, error: "timeout" });
    });
    socket.on("error", (err) => {
      resolve({ ok: false, error: err.message });
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const vmIp = args.find((a) => a.startsWith("--vm-ip="))?.split("=")[1];
  const vmPort = args.find((a) => a.startsWith("--vm-port="))?.split("=")[1];
  const label = args.find((a) => a.startsWith("--label="))?.split("=")[1] || "unlabeled";

  const targets = [
    { name: "guacamole-gateway", host: GUACAMOLE_HOST, port: 443 },
    // Reference points for each provider's region endpoints -- not the
    // VM's own traffic path, but a useful proxy for how far this machine
    // is from a given cloud region in general.
    { name: "digitalocean-api", host: "api.digitalocean.com", port: 443 },
    { name: "aws-us-east-1", host: "ec2.us-east-1.amazonaws.com", port: 443 },
    { name: "aws-ap-southeast-2", host: "ec2.ap-southeast-2.amazonaws.com", port: 443 },
  ];
  if (vmIp) targets.push({ name: "vm-remote-desktop-port", host: vmIp, port: Number(vmPort) || 3389 });

  const results = { label, timestamp: new Date().toISOString(), measurements: [] };
  for (const t of targets) {
    // 3 samples per target -- TCP connect time is noisy on a single try.
    const samples = [];
    for (let i = 0; i < 3; i++) samples.push(await tcpConnectMs(t.host, t.port));
    const okSamples = samples.filter((s) => s.ok).map((s) => s.ms);
    results.measurements.push({
      ...t,
      samplesMs: samples.map((s) => (s.ok ? s.ms : null)),
      medianMs: okSamples.length ? okSamples.sort((a, b) => a - b)[Math.floor(okSamples.length / 2)] : null,
    });
  }

  console.log(JSON.stringify(results, null, 2));
  const outPath = join(import.meta.dirname, "results", `network-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.error(`\nSaved to ${outPath}`);
}

main();
