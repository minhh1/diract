import { chromium } from "playwright";
import { join } from "path";

const BASE_URL = "http://localhost:3000";
const STORAGE_STATE = join(import.meta.dirname, "auth-state.json");
const VM_ID = process.argv[2];

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ storageState: STORAGE_STATE });
  const res = await context.request.post(`${BASE_URL}/api/virtual-computers/${VM_ID}/session`, {
    data: { screenWidth: 1600, screenHeight: 1000, devicePixelRatio: 1 },
  });
  console.log("status:", res.status());
  console.log("body:", JSON.stringify(await res.json().catch(() => ({}))));
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
