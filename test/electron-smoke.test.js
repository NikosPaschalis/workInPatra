import test from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electronPath from "electron";
import { _electron as electron } from "playwright";

const enabled = process.env.RUN_ELECTRON_SMOKE === "1";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Electron launches the sandboxed desktop review UI", { skip: !enabled }, async () => {
  const localData = path.join(root, ".electron-smoke-data", String(process.pid));
  await mkdir(localData, { recursive: true });
  const launchEnv = {
    ...process.env,
    APPDATA: localData,
    LOCALAPPDATA: localData,
    PLAYWRIGHT_BROWSERS_PATH: "0",
    WORKINPATRA_USER_DATA_DIR: localData,
  };
  delete launchEnv.ELECTRON_RUN_AS_NODE;
  const packagedExecutable = process.env.PACKAGED_ELECTRON_EXE || "";
  const application = await electron.launch({
    executablePath: packagedExecutable || electronPath,
    args: packagedExecutable ? [] : [root],
    cwd: root,
    env: launchEnv,
    timeout: 30_000,
  });
  try {
    const page = await application.firstWindow();
    await page.waitForSelector("#run-button");
    assert.equal(await page.title(), "WorkInPatra Desktop Scraper");
    assert.match(await page.locator("body").innerText(), /Run selected scrapers/);
    assert.equal(await page.evaluate(() => typeof window.require), "undefined");
    assert.equal(await page.evaluate(() => typeof window.workInPatra?.startScan), "function");
    const preferences = await application.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      return window.webContents.getLastWebPreferences();
    });
    assert.equal(preferences.contextIsolation, true);
    assert.equal(preferences.nodeIntegration, false);
    assert.equal(preferences.sandbox, true);
    if (process.env.WORKINPATRA_FIXTURE_DIR) {
      await page.evaluate(() => window.workInPatra.startScan(["kariera", "jobfind", "xe"]));
      let scanned;
      const deadline = Date.now() + 45_000;
      do {
        scanned = await page.evaluate(() => window.workInPatra.getState());
        if (!scanned.scanRunning &&
            Object.values(scanned.sources).every((source) => source.status !== "running") &&
            scanned.results.length === 3) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      } while (Date.now() < deadline);
      assert.deepEqual(Object.values(scanned.sources).map((source) => source.status), ["success", "success", "success"]);
      assert.equal(scanned.results.length, 3);
    }
  } finally {
    await application.close();
  }
});
