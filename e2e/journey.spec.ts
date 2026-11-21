import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const SHOTS = process.env.SCREENSHOT_DIR;

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.jpg`, fullPage: true, type: "jpeg", quality: 70 });
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(summary, summary.join("\n")).toEqual([]);
}

async function startExample(page: Page, title: string) {
  await page.goto("/");
  await page.getByRole("button", { name: new RegExp(title) }).click();
  await expect(page).toHaveURL(/\/jobs\//);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
});

test("landing page validates links before starting", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cook from the video, not around it.");
  await expectAccessible(page);
  await shot(page, "01-landing");

  const input = page.getByLabel("Video link");
  await page.getByRole("button", { name: "Get the recipe" }).click();
  await expect(page.getByRole("alert").first()).toHaveText(/Paste a link/);

  await input.fill("https://www.tiktok.com/@chef/video/123");
  await page.getByRole("button", { name: "Get the recipe" }).click();
  await expect(page.getByRole("alert").first()).toHaveText(/YouTube and Instagram/);
  await expect(input).toHaveAttribute("aria-invalid", "true");

  await input.fill("https://www.youtube.com/@themodernnonna");
  await page.getByRole("button", { name: "Get the recipe" }).click();
  await expect(page.getByRole("alert").first()).toHaveText(/isn't a single video/);
  await expect(page).toHaveURL("/");
});

test("complete recipe: processing → overview → cook mode → finish", async ({ page }) => {
  await startExample(page, "Creamy Vegetable Soup");
  await expect(page.getByRole("heading", { name: "Getting your recipe ready" })).toBeVisible();
  // Stages complete in order: done…, at most one in progress, then not started. Never out of order.
  const progress = page.getByRole("list", { name: "Progress" });
  await expect(progress.getByRole("listitem")).toHaveCount(4);
  const states = (await progress.getByRole("listitem").allTextContents()).map((t) => t.match(/\((done|in progress|not started|failed)\)/)?.[1]);
  expect(states.join(",")).toMatch(/^(done,)*(in progress,)?(not started,?)*$|^(done,?)+$/);
  await expectAccessible(page);
  await shot(page, "02-processing");

  await expect(page).toHaveURL("/r/yt-VTR8vxBFGDY", { timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Creamy Vegetable Soup" })).toBeVisible();
  await expect(page.getByText("The creator didn't give")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Chicken broth: 4 cups, Confirmed from creator. Edit amount" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Watch at 0:06/ })).toHaveAttribute("href", "https://www.youtube.com/watch?v=VTR8vxBFGDY&t=6s");
  await expect(page.getByRole("link", { name: "at themodernnonna.com" })).toBeVisible();
  await expectAccessible(page);
  await shot(page, "03-overview-complete");

  // Checking off survives a reload.
  await page.getByRole("checkbox", { name: /Olive oil/ }).click();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: /Olive oil/ })).toBeChecked();

  await page.getByRole("link", { name: "Start cooking" }).click();
  await expect(page).toHaveURL("/r/yt-VTR8vxBFGDY/cook");
  await expect(page.getByText("Step 1 of 7", { exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Heat the olive oil");
  await expect(page.getByRole("button", { name: "Back", exact: true })).toBeDisabled();
  await expectAccessible(page);
  await shot(page, "04-cook-step1");

  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Step 3 of 7", { exact: true })).toBeVisible();

  // Progress is kept when leaving and coming back.
  await page.getByRole("link", { name: /Leave Cook Mode/ }).click();
  await expect(page.getByRole("link", { name: "Resume cooking · step 3 of 7" })).toBeVisible();
  await page.getByRole("link", { name: /Resume cooking/ }).click();
  await expect(page.getByText("Step 3 of 7", { exact: true })).toBeVisible();

  // Keyboard navigation.
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByText("Step 2 of 7", { exact: true })).toBeVisible();
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Step 7 of 7", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(page.getByRole("heading", { name: "That's every step." })).toBeVisible();
  await shot(page, "05-cook-finished");
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.getByText("Step 1 of 7", { exact: true })).toBeVisible();
});

test("missing quantities: user edit flows into Cook Mode and can be reverted", async ({ page }) => {
  await page.goto("/r/ig-DPeUV0GjQnF");
  await expect(page.getByText("The creator didn't give amounts for 6 ingredients.")).toBeVisible();
  await expect(page.getByText("Servings and cooking times weren't given.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Not given by the creator" })).toBeVisible();
  await expectAccessible(page);
  await shot(page, "06-overview-missing");

  await page.getByRole("button", { name: "Butter, softened: Not specified. Add amount" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("The creator didn't say how much.");
  await expectAccessible(page);
  await shot(page, "07-edit-dialog");
  await dialog.getByRole("button", { name: "Save amount" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(/Enter an amount/);
  await dialog.getByLabel("Your amount").fill("1 stick");
  await dialog.getByRole("button", { name: "Save amount" }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByRole("button", { name: "Butter, softened: 1 stick, Edited by you. Edit amount" })).toBeVisible();
  await expect(page.getByText("The creator didn't give amounts for 5 ingredients.")).toBeVisible();

  // The original extraction is untouched: only an overlay is stored.
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("reelish:v1:recipe:ig-DPeUV0GjQnF") ?? "{}"));
  expect(stored.edits.quantities["butter-rub"]).toMatchObject({ raw: "1 stick", amount: 1, unit: "stick" });

  // Step 1 and step 3 both use the softened butter.
  await page.getByRole("link", { name: "Start cooking" }).click();
  await expect(page.getByText("Step 1 of 9", { exact: true })).toBeVisible();
  const forStep = page.getByRole("region", { name: "For this step" });
  await expect(forStep.getByRole("button", { name: "Butter, softened: 1 stick, Edited by you. Edit amount" })).toBeVisible();
  await expect(forStep.getByRole("button", { name: "Seasonings: Not specified. Add amount" })).toBeVisible();
  await expectAccessible(page);
  await shot(page, "08-cook-edited");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Step 3 of 9", { exact: true })).toBeVisible();
  await expect(forStep.getByRole("button", { name: /Butter, softened: 1 stick, Edited by you/ })).toBeVisible();
  // Instagram can't jump to a moment; we say roughly where the step is instead.
  await expect(page.getByRole("link", { name: /Open the video on Instagram \(this step is around 0:12\)/ })).toBeVisible();

  // Editing in Cook Mode also works, and reverting restores "Not specified".
  await forStep.getByRole("button", { name: /Butter, softened: 1 stick/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove my amount" }).click();
  await expect(forStep.getByRole("button", { name: "Butter, softened: Not specified. Add amount" })).toBeVisible();
  await page.getByRole("link", { name: /Leave Cook Mode/ }).click();
  await expect(page.getByText("The creator didn't give amounts for 6 ingredients.")).toBeVisible();
});

test("editing a confirmed amount keeps the creator's original available", async ({ page }) => {
  await page.goto("/r/ig-DWZqrugEacU");
  await expect(page.getByRole("heading", { name: "Crispy pasta", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Pasta shells: 150 g, Confirmed from creator/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("From the video or creator: 150 g (Confirmed from creator).");
  await dialog.getByLabel("Your amount").fill("200 g");
  await dialog.getByRole("button", { name: "Save amount" }).click();
  await page.getByRole("button", { name: /Pasta shells: 200 g, Edited by you/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Use the original (150 g)" }).click();
  await expect(page.getByRole("button", { name: /Pasta shells: 150 g, Confirmed from creator/ })).toBeVisible();
  await shot(page, "09-overview-caption");
});

test("silent video with no amounts at all", async ({ page }) => {
  await page.goto("/r/yt-s4na199iyag");
  await expect(page.getByText("The creator didn't give any amounts.")).toBeVisible();
  await expectAccessible(page);
});

test("unknown recipe links return a real 404", async ({ page }) => {
  for (const path of ["/r/yt-does-not-exist", "/r/yt-does-not-exist/cook"]) {
    const res = await page.goto(path);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "We can't find that recipe" })).toBeVisible();
  }
  expect((await page.goto("/r/yt-VTR8vxBFGDY"))?.status()).toBe(200);
});

test("failure states are clear and honest", async ({ page }) => {
  await startExample(page, "A private video");
  await expect(page.getByRole("heading", { name: "We can't open this video" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("list", { name: "Progress" }).getByRole("listitem").first()).toContainText("(failed)");
  await expect(page.getByRole("list", { name: "Progress" }).getByRole("listitem").nth(1)).toContainText("(not started)");
  await expectAccessible(page);
  await shot(page, "10-failed");

  await page.goto("/");
  await page.getByLabel("Video link").fill("https://www.instagram.com/reel/AnotherReel9/");
  await page.getByRole("button", { name: "Get the recipe" }).click();
  await expect(page.getByRole("heading", { name: "Live processing isn't switched on yet" })).toBeVisible({ timeout: 10_000 });

  await page.goto("/jobs/does-not-exist");
  await expect(page.getByRole("heading", { name: "We can't find this request" })).toBeVisible();

  await page.goto("/r/nope");
  await expect(page.getByRole("heading", { name: "We can't find that recipe" })).toBeVisible();
});

test("cook mode: jump to any step from the steps list; progress survives a refresh", async ({ page }) => {
  await page.goto("/r/yt-VTR8vxBFGDY/cook");
  // Phones: a "Steps" button opens a sheet. Wide screens: the list is always visible beside the step.
  const wide = test.info().project.name === "desktop";
  if (wide) await expect(page.getByRole("button", { name: "Steps" })).toBeHidden();
  else await page.getByRole("button", { name: "Steps" }).click();
  const list = wide ? page.getByRole("navigation", { name: "All steps" }) : page.getByRole("dialog", { name: "All steps" });
  await expect(list.getByRole("button", { name: /^Step 1 \(current\):/ })).toHaveAttribute("aria-current", "step");
  await expectAccessible(page);
  await shot(page, wide ? "11-cook-steps-rail" : "11-cook-steps-sheet");
  await list.getByRole("button", { name: /^Step 5:/ }).click();
  if (!wide) await expect(list).toBeHidden();
  await expect(page.getByText("Step 5 of 7", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Step 5 of 7", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Lower the heat");
});

test("small phone: a step's amounts are visible above the controls without scrolling", async ({ browser, baseURL }) => {
  test.skip(test.info().project.name !== "mobile", "viewport-specific check");
  const ctx = await browser.newContext({ baseURL, viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto("/r/yt-VTR8vxBFGDY/cook");
  await expect(page.getByText("Step 1 of 7", { exact: true })).toBeVisible();
  const controlsTop = await page.getByRole("button", { name: "Next", exact: true }).evaluate((el) => el.parentElement!.getBoundingClientRect().top);
  const rowBottoms = await page
    .getByRole("region", { name: "For this step" })
    .getByRole("listitem")
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().bottom));
  const fullyVisible = rowBottoms.filter((b) => b <= controlsTop).length;
  expect(rowBottoms.length).toBe(5);
  expect(fullyVisible, `${fullyVisible} of 5 ingredient rows visible above the controls`).toBeGreaterThanOrEqual(4);
  await page.screenshot({ path: process.env.SCREENSHOT_DIR ? `${process.env.SCREENSHOT_DIR}/se-cook-step1.jpg` : undefined, type: "jpeg", quality: 70 });
  await ctx.close();
});

test("wide screens use two columns; narrower screens keep the single column", async ({ page }) => {
  const wide = test.info().project.name === "desktop";
  await page.goto("/r/yt-VTR8vxBFGDY");
  const ingredients = await page.getByRole("region", { name: "Ingredients" }).boundingBox();
  const steps = await page.getByRole("region", { name: "Steps" }).boundingBox();
  if (wide) {
    expect(steps!.x, "steps sit to the right of ingredients").toBeGreaterThan(ingredients!.x + ingredients!.width);
    expect(Math.abs(steps!.y - ingredients!.y), "columns start level").toBeLessThan(40);
    await expect(page.getByRole("link", { name: "Start cooking" })).toBeVisible(); // in the header, not a bottom bar
  } else {
    expect(steps!.y, "steps follow ingredients").toBeGreaterThan(ingredients!.y + ingredients!.height);
  }
  await page.goto("/r/yt-VTR8vxBFGDY/cook");
  const rail = page.getByRole("navigation", { name: "All steps" });
  if (wide) {
    await expect(rail).toBeVisible();
    await expect(page.getByRole("button", { name: "Steps" })).toBeHidden();
  } else {
    await expect(rail).toBeHidden();
    await expect(page.getByRole("button", { name: "Steps" })).toBeVisible();
  }
});
