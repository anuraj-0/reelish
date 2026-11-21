// Production smoke test against the public site (real pipeline). New videos cost a little AI money;
// repeats come from the cache. Usage: node scripts/smoke-prod.mjs [baseUrl] [--shots dir]
import AxeBuilder from "@axe-core/playwright";
import { chromium, devices, expect } from "@playwright/test";

const BASE = (process.argv[2] ?? "https://deepclean.app/reelish").replace(/\/$/, "");
const SHOTS = process.argv.includes("--shots") ? process.argv[process.argv.indexOf("--shots") + 1] : null;
const SOUP = "https://www.youtube.com/shorts/VTR8vxBFGDY";
const KAJU = "https://www.youtube.com/shorts/s4na199iyag";
const results = [];

/** Auto-waiting assertion (pages restore saved progress after hydration). */
async function waits(fn) {
  try { await fn(); return true; } catch { return false; }
}

function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function axe(page, label) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).analyze();
  check(`${label}: no axe violations`, r.violations.length === 0, r.violations.map((v) => v.id).join(", "));
}

async function noOverflow(page, label) {
  const w = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`${label}: no horizontal overflow`, w <= 0, `${w}px`);
}

async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.jpg`, fullPage: true, type: "jpeg", quality: 70 });
}

async function paste(page, url) {
  await page.goto(`${BASE}`);
  await page.getByLabel("Video link").fill(url);
  const t0 = Date.now();
  await page.getByRole("button", { name: "Get the recipe" }).click();
  await page.waitForURL(/\/(jobs|r)\//, { timeout: 15_000 });
  const viaJob = page.url().includes("/jobs/");
  if (viaJob) await page.waitForURL(/\/r\/|\/jobs\//, { timeout: 5_000 });
  return { viaJob, t0 };
}

async function run(name, deviceOpts) {
  const browser = await chromium.launch({ channel: "chromium" }); // full Chromium, as in playwright.config.ts
  const ctx = await browser.newContext(deviceOpts);
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  const L = (s) => `[${name}] ${s}`;

  const res = await page.goto(BASE);
  check(L("landing loads over HTTPS"), res?.status() === 200 && page.url().startsWith("https://"), `${res?.status()} ${page.url()}`);
  check(L("landing heading"), (await page.getByRole("heading", { level: 1 }).textContent())?.includes("Cook from the video"));
  await axe(page, L("landing"));
  await noOverflow(page, L("landing"));
  await shot(page, `${name}-01-landing`);

  // Invalid links are refused before any job.
  await page.getByLabel("Video link").fill("https://www.tiktok.com/@chef/video/123");
  await page.getByRole("button", { name: "Get the recipe" }).click();
  check(L("TikTok link refused inline"), /YouTube and Instagram/.test((await page.getByRole("alert").first().textContent()) ?? ""));

  // New (or cached) YouTube recipe.
  const { viaJob, t0 } = await paste(page, SOUP);
  if (viaJob) {
    const list = page.getByRole("list", { name: "Progress" });
    await list.waitFor({ timeout: 10_000 }).catch(() => {});
    const stages = await list.getByRole("listitem").count();
    check(L("progress shows 4 stages"), stages === 4, `${stages}`);
    await shot(page, `${name}-02-processing`);
  }
  await page.waitForURL(/\/r\/yt-VTR8vxBFGDY[^/]*$/, { timeout: 120_000 });
  const ms = Date.now() - t0;
  check(L(`soup recipe ready (${viaJob ? "processed" : "cached"})`), true, `${(ms / 1000).toFixed(1)} s`);
  await page.getByRole("heading", { level: 1 }).waitFor();
  check(L("soup: confirmed broth amount shown"), await waits(() => expect(page.getByRole("button", { name: /broth: 4 cups, Confirmed from creator/ })).toBeVisible()));
  await axe(page, L("overview"));
  await noOverflow(page, L("overview"));
  await shot(page, `${name}-03-overview`);

  // Ingredient check-off persists across reload.
  const box = page.getByRole("checkbox", { name: /Olive oil/ });
  if (!(await box.isChecked())) await box.click();
  await page.reload();
  check(L("ingredient check-off persists"), await waits(() => expect(page.getByRole("checkbox", { name: /Olive oil/ })).toBeChecked()));

  // Cook Mode end to end, progress persists.
  await page.getByRole("link", { name: /Start cooking|Resume cooking/ }).first().click();
  await page.waitForURL(/\/cook$/);
  if (await page.getByRole("button", { name: "Start over" }).isVisible().catch(() => false)) await page.getByRole("button", { name: "Start over" }).click();
  const total = Number((await page.getByText(/^Step 1 of \d+$/).textContent())?.match(/of (\d+)/)?.[1]);
  check(L("cook mode opens at step 1"), total > 0, `${total} steps`);
  await axe(page, L("cook mode"));
  await noOverflow(page, L("cook mode"));
  await shot(page, `${name}-04-cook`);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.reload();
  check(L("cook progress survives reload"), await waits(() => expect(page.getByText(`Step 3 of ${total}`, { exact: true })).toBeVisible()));
  for (let i = 3; i < total; i++) await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  check(L("cook mode finishes"), await waits(() => expect(page.getByRole("heading", { name: "That's every step." })).toBeVisible()));
  await page.getByRole("button", { name: "Start over" }).click();

  // Missing amounts stay missing; a user edit is an overlay and can be removed.
  await paste(page, KAJU);
  await page.waitForURL(/\/r\/yt-s4na199iyag[^/]*$/, { timeout: 120_000 });
  await page.getByRole("heading", { level: 1 }).waitFor();
  const missing = await page.getByRole("button", { name: /: Not specified\. Add amount$/ }).count();
  check(L("kaju katli: missing amounts shown as Not specified"), missing > 0, `${missing} not specified`);
  await page.getByRole("button", { name: /: Not specified\. Add amount$/ }).first().click();
  await page.getByRole("dialog").getByLabel("Your amount").fill("2 tbsp");
  await page.getByRole("dialog").getByRole("button", { name: "Save amount" }).click();
  await page.reload();
  check(L("ingredient edit persists after reload"), await waits(() => expect(page.getByRole("button", { name: /: 2 tbsp, Edited by you\. Edit amount$/ })).toHaveCount(1)));
  await page.getByRole("button", { name: /: 2 tbsp, Edited by you\. Edit amount$/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove my amount" }).click();
  check(L("removing the edit restores Not specified"), await waits(() => expect(page.getByRole("button", { name: /: Not specified\. Add amount$/ })).toHaveCount(missing)));
  await axe(page, L("missing-amounts overview"));
  await shot(page, `${name}-05-missing`);

  check(L("no console errors"), errors.length === 0, errors.slice(0, 3).join(" | "));

  // Unknown recipe → real 404 page (the browser logs that 404, so this comes after the console check).
  const nf = await page.goto(`${BASE}/r/yt-doesnotexist`);
  check(L("unknown recipe returns 404"), nf?.status() === 404, `${nf?.status()}`);
  await browser.close();
}

await run("desktop", { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } });
await run("mobile", { ...devices["Pixel 7"] });
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
