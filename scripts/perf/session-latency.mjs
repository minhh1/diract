#!/usr/bin/env node
// scripts/perf/session-latency.mjs
// Tiers 2 (session connect time) and 3 (click-to-visible-response time,
// approximated) of the VM performance test suite -- see
// scripts/perf/README.md for one-time setup (an authenticated Playwright
// storage state) and how to run this.
//
// Screenshot-polling approximation, deliberately: instead of decoding PNG
// pixels (no image library is installed in this repo), "has the screen
// changed" is approximated by PNG byte size -- a mostly-blank/loading
// screen compresses to a few KB, a rendered desktop or an open context
// menu compresses to tens of KB. Rough, not frame-perfect, but cheap,
// dependency-free, and good enough to compare configurations against each
// other (e.g. near vs. far region, before/after an RDP tuning change).
import { chromium } from "playwright";
import { writeFileSync, existsSync } from "fs";
import { join } from "path";

const BLANK_SCREENSHOT_BYTES_THRESHOLD = 8000; // heuristic -- see header comment
const POLL_INTERVAL_MS = 100;
const CONNECT_TIMEOUT_MS = 60000;
const CLICK_RESPONSE_TIMEOUT_MS = 5000;
const CLICK_TRIALS = 5;

function arg(name, fallback) {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split("=").slice(1).join("=") : fallback;
}

async function pollUntilChanged(page, clip, baselineBytes, timeoutMs) {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    const buf = await page.screenshot({ clip }).catch(() => null);
    if (buf && Math.abs(buf.length - baselineBytes) > BLANK_SCREENSHOT_BYTES_THRESHOLD) {
      return performance.now() - start;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return null; // timed out -- no visible change detected
}

async function main() {
  const baseUrl = arg("url", "http://localhost:3000");
  const vmId = arg("vm-id");
  const storageStatePath = arg("storage-state", join(import.meta.dirname, "auth-state.json"));
  const label = arg("label", "unlabeled");

  if (!vmId) {
    console.error("Usage: node session-latency.mjs --vm-id=<id> [--url=...] [--storage-state=...] [--label=...]");
    process.exit(1);
  }
  if (!existsSync(storageStatePath)) {
    console.error(`No storage state file at ${storageStatePath} -- see scripts/perf/README.md's one-time setup step.`);
    process.exit(1);
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ storageState: storageStatePath });
  const page = await context.newPage();

  const result = { label, vmId, timestamp: new Date().toISOString() };

  await page.goto(`${baseUrl}/dashboard/virtual-computers/${vmId}`);
  await page.getByRole("button", { name: "Open virtual computer" }).waitFor({ timeout: 30000 });

  const clickStart = performance.now();
  const [sessionPage] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("button", { name: "Open virtual computer" }).click(),
  ]);
  await sessionPage.waitForLoadState("domcontentloaded");

  const baselineBuf = await sessionPage.screenshot().catch(() => null);
  const baselineBytes = baselineBuf ? baselineBuf.length : 0;
  const connectMs = await pollUntilChanged(
    sessionPage,
    undefined,
    baselineBytes,
    CONNECT_TIMEOUT_MS
  );
  result.sessionConnectMs = connectMs !== null ? Math.round(connectMs) : null;
  if (connectMs === null) {
    console.error("Timed out waiting for the session to visibly connect -- skipping click-response trials.");
    result.clickResponseMsSamples = [];
    result.clickResponseMsMedian = null;
    await browser.close();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Give the desktop a moment to fully settle after first paint before
  // starting click trials, so the first trial isn't measuring residual
  // connection-time rendering.
  await new Promise((r) => setTimeout(r, 2000));

  const clip = { x: 100, y: 100, width: 400, height: 400 };
  const samples = [];
  for (let i = 0; i < CLICK_TRIALS; i++) {
    const preClickBuf = await sessionPage.screenshot({ clip }).catch(() => null);
    const preClickBytes = preClickBuf ? preClickBuf.length : 0;
    // Right-click on empty desktop -- reliably produces a large, unambiguous
    // visual change (a context menu), unlike a left-click which may do
    // nothing visible if it misses an icon.
    await sessionPage.mouse.click(250, 250, { button: "right" });
    const ms = await pollUntilChanged(sessionPage, clip, preClickBytes, CLICK_RESPONSE_TIMEOUT_MS);
    if (ms !== null) samples.push(Math.round(ms));
    await sessionPage.keyboard.press("Escape");
    await new Promise((r) => setTimeout(r, 500));
  }

  result.clickResponseMsSamples = samples;
  result.clickResponseMsMedian = samples.length
    ? samples.slice().sort((a, b) => a - b)[Math.floor(samples.length / 2)]
    : null;

  await browser.close();

  console.log(JSON.stringify(result, null, 2));
  const outPath = join(import.meta.dirname, "results", `session-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.error(`\nSaved to ${outPath}`);
}

main();
