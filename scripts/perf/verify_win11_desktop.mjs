import { chromium } from "playwright";
import { join } from "path";

const BASE_URL = "http://localhost:3000";
const STORAGE_STATE = join(import.meta.dirname, "auth-state.json");
const VM_ID = process.argv[2];

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ storageState: STORAGE_STATE });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/dashboard/virtual-computers/${VM_ID}`);
  await page.getByRole("button", { name: "Open virtual computer" }).waitFor({ timeout: 30000 });

  const [sessionPage] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("button", { name: "Open virtual computer" }).click(),
  ]);
  sessionPage.on("close", () => console.log("!! session page closed"));
  sessionPage.on("crash", () => console.log("!! session page crashed"));
  await sessionPage.waitForLoadState("domcontentloaded").catch((e) => console.log("load state error:", e.message));
  console.log("session page URL:", sessionPage.url());
  await sessionPage.setViewportSize({ width: 1600, height: 1000 }).catch((e) => console.log("viewport error:", e.message));

  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    if (sessionPage.isClosed()) {
      console.log(`[${i}] session page is closed`);
      break;
    }
    try {
      await sessionPage.screenshot({ path: join(import.meta.dirname, `win11-desktop-${i}.png`) });
      console.log(`[${i}] screenshot saved`);
    } catch (e) {
      console.log(`[${i}] screenshot failed:`, e.message);
    }
  }

  await browser.close().catch(() => {});
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
