import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import test from "node:test";
import { chromium } from "playwright";

const origin = "https://www.workinpatras.gr";
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const example = "/reports/2026-10/3m/";

async function offline(page) {
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    const requestPath = url.pathname.endsWith("/") ? url.pathname + "index.html" : url.pathname;
    const file = resolve("." + requestPath);
    if (!file.startsWith(process.cwd() + sep)) return route.abort();
    try {
      const body = await readFile(file);
      return route.fulfill({ body, contentType: types[extname(file)] ?? "application/octet-stream" });
    } catch {
      return route.fulfill({ status: 404, body: "Not found" });
    }
  });
}

test("report archive supports historical browsing and keyboard-accessible report controls", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await offline(page);
    await page.goto(origin + "/report.html");
    await page.getByLabel("Διάρκεια").selectOption("6");
    assert.equal(await page.locator("#archive-list > li:visible").count(), 0);
    assert.equal(await page.getByRole("status").isVisible(), true);
    await page.getByLabel("Διάρκεια").selectOption("3");
    assert.ok(await page.locator("#archive-list > li:visible").count() >= 3);
    await page.locator(`#archive-list a[href="${example}"]`).click();
    assert.equal(new URL(page.url()).pathname, example);
    assert.match(await page.getByRole("heading", { name: "Σύνοψη" }).textContent(), /Σύνοψη/);
    assert.match(await page.locator(".executive").textContent(), /73 σε 81/);
    assert.match(await page.locator("#method").textContent(), /Δεν είναι διαθέσιμη σύγκριση/);
    const firstBar = page.locator("#inventory .bar-point").first();
    await firstBar.focus();
    assert.match(await firstBar.getAttribute("aria-label"), /73 αγγελίες/);
    assert.equal(await firstBar.locator(".tooltip").isVisible(), true);
    await page.getByLabel("Κλάδος", { exact: true }).selectOption("sales");
    assert.equal(await page.locator("#sector-table tbody tr:visible").count(), 1);
    assert.equal(await page.locator('[data-sector-chart="sales"]').isVisible(), true);
    await page.getByLabel("Μονάδα μεταβολής").selectOption("relative");
    assert.equal(await page.locator('#sector-table th[data-unit="absolute"]').isVisible(), false);
    assert.equal(await page.locator('#sector-table th[data-unit="relative"]').first().isVisible(), true);
    assert.deepEqual(errors, []);

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, javaScriptEnabled: false });
    await offline(mobile);
    await mobile.goto(origin + example);
    assert.equal(await mobile.getByRole("heading", { name: "Σύνοψη" }).isVisible(), true);
    assert.equal(await mobile.locator("#sector-table tbody tr:visible").count(), 11);
    assert.equal(await mobile.locator("#sector-controls").isVisible(), false);
    await mobile.goto(origin + "/report.html");
    assert.equal(await mobile.locator(`#archive-list a[href="${example}"]`).isVisible(), true);
    await mobile.goto(origin + example);

    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await offline(phone);
    await phone.goto(origin + example);
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await phone.emulateMedia({ media: "print" });
    assert.equal(await phone.locator(".site-header").isVisible(), false);
    assert.equal(await phone.locator("#sector-table").isVisible(), true);

    const screenshots = process.env.WORKINPATRA_REPORT_SCREENSHOTS;
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await page.reload();
      await page.screenshot({ path: resolve(screenshots, "desktop.png"), fullPage: true });
      await mobile.screenshot({ path: resolve(screenshots, "mobile.png"), fullPage: true });
    }
  } finally {
    await browser.close();
  }
});
