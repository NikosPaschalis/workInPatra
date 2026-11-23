import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LocalStore } from "../apps/desktop-scraper/src/main/local-store.js";
import { classifyAccess } from "../apps/desktop-scraper/src/worker/access-policy.js";
import { resolveBrowserExecutable } from "../apps/desktop-scraper/src/worker/browser-path.js";
import { createInitialState } from "../apps/desktop-scraper/src/shared/state.js";
import { ScrapeController } from "../apps/desktop-scraper/src/main/scrape-controller.js";
import { EventEmitter } from "node:events";

const root = path.dirname(fileURLToPath(import.meta.url));
const fixture = (source) => path.join(root, "fixtures", "desktop", `${source}.html`);

test("local persistence atomically restores approved drafts and resets interrupted scans", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "workinpatra-store-"));
  const store = new LocalStore(directory);
  const state = createInitialState();
  state.scanRunning = true;
  state.sources.xe.status = "running";
  state.results = [{ id: "xe:1", approved: true, manuallyVerifiedAt: "2026-11-20T10:00:00Z" }];
  await store.save(state);
  await assert.doesNotReject(async () => JSON.parse(await readFile(store.filePath, "utf8")));
  const restored = await store.load();
  assert.equal(restored.scanRunning, false);
  assert.equal(restored.sources.xe.status, "cancelled");
  assert.equal(restored.results[0].approved, true);
  await Promise.all([
    store.save({ ...restored, lastScanAt: "2026-11-20T10:00:00Z" }),
    store.save({ ...restored, lastScanAt: "2026-11-20T11:00:00Z" }),
    store.save({ ...restored, lastScanAt: "2026-11-20T12:00:00Z" }),
  ]);
  assert.equal((await store.load()).lastScanAt, "2026-11-20T12:00:00Z");
});

test("access policy stops 403 and challenge pages without retry", () => {
  assert.deepEqual(classifyAccess({ status: 403 }), { allowed: false, blocked: true, reason: "Access denied with HTTP 403" });
  assert.equal(classifyAccess({ status: 200, title: "Verify you are human" }).blocked, true);
  assert.equal(classifyAccess({ status: 500 }).blocked, false);
});

test("packaged browser paths resolve from ASAR to the unpacked runtime", () => {
  const packed = "C:\\app\\resources\\app.asar\\node_modules\\playwright-core\\.local-browsers\\chrome.exe";
  assert.equal(
    resolveBrowserExecutable(packed, (candidate) => candidate.includes("app.asar.unpacked")),
    packed.replace("app.asar", "app.asar.unpacked")
  );
  assert.equal(resolveBrowserExecutable("C:\\repo\\node_modules\\chrome.exe", () => false), "C:\\repo\\node_modules\\chrome.exe");
});

test("fixture-backed source workers extract all three adapters independently", async () => {
  const controller = new ScrapeController({ timeoutMs: 30_000 });
  const results = [];
  controller.on("results", (event) => results.push(event));
  const settled = await controller.run(["kariera", "jobfind", "xe"], {
    kariera: { fixturePath: fixture("kariera") },
    jobfind: { fixturePath: fixture("jobfind") },
    xe: { fixturePath: fixture("xe") },
  });
  assert.equal(settled.every((entry) => entry.status === "fulfilled" && entry.value.status === "success"), true);
  assert.deepEqual(results.map((entry) => entry.source).sort(), ["jobfind", "kariera", "xe"]);
  assert.equal(results.find((entry) => entry.source === "xe").jobs[0].dateRaw, "πριν από 2 ημέρες");
});

test("one failed fixture does not discard successful source results", async () => {
  const controller = new ScrapeController({ timeoutMs: 30_000 });
  const settled = await controller.run(["jobfind", "xe"], {
    jobfind: { fixturePath: fixture("jobfind") },
    xe: { fixturePath: path.join(root, "fixtures", "desktop", "missing.html") },
  });
  assert.deepEqual(settled.map((entry) => entry.value.status).sort(), ["failed", "success"]);
});

test("active source workers can be cancelled", async () => {
  class FakeChild extends EventEmitter {
    send() {}
    kill() { queueMicrotask(() => this.emit("exit", 0)); }
  }
  const controller = new ScrapeController({ forkImpl: () => new FakeChild(), timeoutMs: 30_000 });
  const run = controller.run(["xe"]);
  assert.equal(controller.cancel(), true);
  const settled = await run;
  assert.equal(settled[0].value.status, "cancelled");
  assert.equal(controller.running, false);
});
