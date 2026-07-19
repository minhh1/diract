#!/usr/bin/env node
// scripts/perf/save-auth-state.mjs
// One-time setup for the perf test suite: opens a real (headed) browser,
// lets you log in by hand (Google OAuth isn't scriptable without real
// credentials), then saves the authenticated session so
// session-latency.mjs can reuse it without logging in every run.
import { chromium } from "playwright";
import { createInterface } from "readline";
import { join } from "path";

function arg(name, fallback) {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split("=").slice(1).join("=") : fallback;
}

async function waitForEnter(prompt) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((resolve) => rl.question(prompt, resolve));
  rl.close();
}

async function main() {
  const baseUrl = arg("url", "http://localhost:3000");
  const outPath = arg("out", join(import.meta.dirname, "auth-state.json"));

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`);

  await waitForEnter("Log in in the opened browser window, then press Enter here once you're on the dashboard...\n");

  await context.storageState({ path: outPath });
  await browser.close();
  console.log(`Saved authenticated session to ${outPath}`);
}

main();
