import { app, BrowserWindow, dialog, ipcMain, safeStorage, session, shell } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeJobUrl } from "../../scripts/job-identity.js";
import { classifyManualCandidates, validateSourceUrl } from "../../scripts/manual-queue.js";
import { CredentialStore } from "./src/main/credential-store.js";
import { GitHubClient, uploadApprovedJobs } from "./src/main/github-client.js";
import { LocalStore } from "./src/main/local-store.js";
import { ScrapeController } from "./src/main/scrape-controller.js";
import { dashboardCounts, publicState, SOURCES } from "./src/shared/state.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (process.env.WORKINPATRA_USER_DATA_DIR) {
  app.setPath("userData", path.resolve(process.env.WORKINPATRA_USER_DATA_DIR));
}
const CHANNELS = new Set([
  "state:get", "scan:start", "scan:cancel", "review:set", "results:export",
  "history:clear", "github:authenticate", "github:disconnect", "github:upload",
  "external:open", "diagnostics:export",
]);

let window;
let store;
let credentials;
let controller;
let state;
let baseline = { published: [], karieraPending: [], manualPending: [], history: [] };

function redact(value) {
  return String(value || "")
    .replace(/(?:github_pat_|ghp_)[A-Za-z0-9_]+/g, "[REDACTED_TOKEN]")
    .replace(/authorization:\s*bearer\s+\S+/gi, "authorization: [REDACTED]");
}

function log(message, level = "info") {
  state.activity.push({ at: new Date().toISOString(), level, message: redact(message).slice(0, 1000) });
  state.activity = state.activity.slice(-500);
}

async function persistAndBroadcast() {
  await store.save(state);
  const github = { authenticated: await credentials.has().catch(() => false) };
  const payload = publicState({ ...state, dashboard: dashboardCounts(state.results, state.sources) }, github);
  if (window && !window.isDestroyed()) window.webContents.send("desktop:state", payload);
  return payload;
}

async function readJson(relativePath, fallback) {
  try {
    return JSON.parse(await readFile(path.join(app.getAppPath(), relativePath), "utf8"));
  } catch {
    return fallback;
  }
}

async function loadBaseline() {
  const [published, kariera, manual] = await Promise.all([
    readJson("data/jobs.json", { jobs: [] }),
    readJson("data/kariera-pending.json", { jobs: [] }),
    readJson("data/manual-pending.json", { jobs: [] }),
  ]);
  let history = [];
  try {
    const observations = await readFile(path.join(app.getAppPath(), "data/observations.jsonl"), "utf8");
    history = observations.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)).map((item) => ({
      source: item.source, url: item.url, title: item.title, company: item.company,
    }));
  } catch {}
  baseline = {
    published: published.jobs || [],
    karieraPending: kariera.jobs || [],
    manualPending: manual.jobs || [],
    history,
  };
}

function attachIds(jobs, oldResults = []) {
  const old = new Map(oldResults.map((job) => [job.canonicalUrl || canonicalizeJobUrl(job.url), job]));
  return jobs.map((job, index) => {
    const key = job.canonicalUrl || canonicalizeJobUrl(job.url);
    const previous = old.get(key);
    return {
      ...job,
      id: `${job.source}:${key || index}`,
      approved: Boolean(previous?.approved),
      rejected: Boolean(previous?.rejected),
      manuallyVerifiedAt: previous?.manuallyVerifiedAt || null,
      locationVerified: Boolean(previous?.locationVerified),
    };
  });
}

function updateSource(event) {
  state.sources[event.source] = { status: event.status, count: event.count || 0, detail: redact(event.detail) };
  log(`${event.source}: ${event.status}${event.detail ? ` — ${event.detail}` : ""}`, event.status === "failed" ? "error" : "info");
  void persistAndBroadcast();
}

function addResults({ source, jobs }) {
  const prior = state.results.filter((job) => job.source === source);
  const classified = classifyManualCandidates(jobs, baseline);
  state.results = [
    ...state.results.filter((job) => job.source !== source),
    ...attachIds(classified, prior),
  ];
  void persistAndBroadcast();
}

function assertObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid request payload");
  return value;
}

function createClient(token) {
  return new GitHubClient({ token });
}

function registerIpc() {
  const handle = (channel, fn) => {
    if (!CHANNELS.has(channel)) throw new Error(`Unapproved IPC channel: ${channel}`);
    ipcMain.handle(channel, async (_event, payload) => fn(payload));
  };

  handle("state:get", () => persistAndBroadcast());
  handle("scan:start", async (payload) => {
    const sources = assertObject(payload).sources;
    if (!Array.isArray(sources) || sources.some((source) => !SOURCES.includes(source))) throw new Error("Invalid source selection");
    if (state.scanRunning) throw new Error("A scan is already running");
    state.selectedSources = [...new Set(sources)];
    state.scanRunning = true;
    state.lastScanAt = new Date().toISOString();
    log(`Starting manual scan: ${state.selectedSources.join(", ")}`);
    await persistAndBroadcast();
    const fixtureDirectory = process.env.WORKINPATRA_FIXTURE_DIR;
    const sourceOptions = fixtureDirectory
      ? Object.fromEntries(state.selectedSources.map((source) => [source, { fixturePath: path.join(fixtureDirectory, `${source}.html`) }]))
      : {};
    void controller.run(state.selectedSources, sourceOptions).then(async (settled) => {
      for (const entry of settled) {
        if (entry.status !== "fulfilled") continue;
        const { source, status, detail, jobs } = entry.value;
        state.sources[source] = { status, detail: redact(detail), count: jobs.length };
      }
      state.scanRunning = false;
      log("Manual scan finished");
      await persistAndBroadcast();
    }).catch(async (error) => {
      state.scanRunning = false;
      log(`Manual scan failed: ${error.message}`, "error");
      await persistAndBroadcast();
    });
    return { started: true };
  });
  handle("scan:cancel", async () => {
    const cancelled = controller.cancel();
    state.scanRunning = false;
    if (cancelled) log("Scan cancellation requested", "warning");
    await persistAndBroadcast();
    return { cancelled };
  });
  handle("review:set", async (payload) => {
    const { ids, decision } = assertObject(payload);
    if (!Array.isArray(ids) || !["approve", "reject", "reset"].includes(decision)) throw new Error("Invalid review request");
    const now = new Date().toISOString();
    for (const result of state.results) {
      if (!ids.includes(result.id)) continue;
      if (decision === "approve") {
        if (!["new", "review", "suspected_duplicate"].includes(result.validationStatus)) continue;
        result.approved = true;
        result.rejected = false;
        result.manuallyVerifiedAt = now;
        if (result.validationStatus === "review" && result.validationReasons.includes("unclear_location")) result.locationVerified = true;
      } else if (decision === "reject") {
        result.approved = false;
        result.rejected = true;
        result.manuallyVerifiedAt = null;
      } else {
        result.approved = false;
        result.rejected = false;
        result.manuallyVerifiedAt = null;
      }
    }
    log(`${decision} applied to ${ids.length} listing(s)`);
    return persistAndBroadcast();
  });
  handle("results:export", async () => {
    const result = await dialog.showSaveDialog(window, { defaultPath: `workinpatra-results-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: "JSON", extensions: ["json"] }] });
    if (result.canceled || !result.filePath) return { saved: false };
    await writeFile(result.filePath, JSON.stringify({ exportedAt: new Date().toISOString(), jobs: state.results }, null, 2), "utf8");
    log(`Exported ${state.results.length} listings`);
    await persistAndBroadcast();
    return { saved: true };
  });
  handle("history:clear", async () => {
    if (state.scanRunning) throw new Error("Cancel the active scan before clearing local history");
    state.results = [];
    state.activity = [];
    for (const source of SOURCES) state.sources[source] = { status: "idle", count: 0, detail: "" };
    return persistAndBroadcast();
  });
  handle("github:authenticate", async (payload) => {
    const { token, persist = true } = assertObject(payload);
    if (typeof token !== "string" || token.length < 20) throw new Error("Enter a valid fine-grained GitHub token");
    const access = await createClient(token).verifyAccess();
    await credentials.set(token, { persist: Boolean(persist) });
    log(`Authenticated to ${access.fullName}`);
    return persistAndBroadcast();
  });
  handle("github:disconnect", async () => {
    await credentials.clear();
    log("GitHub credential removed");
    return persistAndBroadcast();
  });
  handle("github:upload", async () => {
    const token = await credentials.get();
    if (!token) throw new Error("Authenticate with GitHub first");
    const approved = state.results.filter((job) => job.approved && !job.rejected);
    state.lastUploadError = null;
    log(`Revalidating ${approved.length} approved listing(s) against GitHub`);
    await persistAndBroadcast();
    try {
      const result = await uploadApprovedJobs(createClient(token), approved);
      if (result.commitSha) {
        state.lastSuccessfulCommit = { sha: result.commitSha, url: result.commitUrl, at: new Date().toISOString(), count: result.uploaded };
        const uploadedUrls = new Set(approved.map((job) => canonicalizeJobUrl(job.url)));
        for (const job of state.results) {
          if (uploadedUrls.has(canonicalizeJobUrl(job.url))) {
            job.approved = false;
            job.validationStatus = "queued";
          }
        }
      }
      log(result.duplicateOnly ? "No upload needed; all approved listings already exist" : `Verified GitHub commit ${result.commitSha}`);
      await loadBaseline();
      await persistAndBroadcast();
      return result;
    } catch (error) {
      state.lastUploadError = redact(error.message);
      log(`GitHub upload failed: ${error.message}`, "error");
      await persistAndBroadcast();
      throw error;
    }
  });
  handle("external:open", async (payload) => {
    const { id } = assertObject(payload);
    const result = state.results.find((job) => job.id === id);
    if (!result || !validateSourceUrl(result.source, result.url).valid) throw new Error("Untrusted external URL");
    await shell.openExternal(result.canonicalUrl || canonicalizeJobUrl(result.url));
    return { opened: true };
  });
  handle("diagnostics:export", async () => {
    const result = await dialog.showSaveDialog(window, { defaultPath: "workinpatra-diagnostics.json", filters: [{ name: "JSON", extensions: ["json"] }] });
    if (result.canceled || !result.filePath) return { saved: false };
    await writeFile(result.filePath, JSON.stringify({ exportedAt: new Date().toISOString(), sources: state.sources, activity: state.activity }, null, 2), "utf8");
    return { saved: true };
  });
}

function createWindow() {
  window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1050,
    minHeight: 700,
    backgroundColor: "#101214",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  window.removeMenu();
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault();
  });
  window.loadFile(path.join(__dirname, "src/renderer/index.html"));
  window.once("ready-to-show", () => window.show());
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  store = new LocalStore(path.join(app.getPath("userData"), "desktop-scraper"));
  credentials = new CredentialStore(path.join(app.getPath("userData"), "desktop-scraper"), safeStorage);
  state = await store.load();
  await loadBaseline();
  controller = new ScrapeController();
  controller.on("status", updateSource);
  controller.on("results", addResults);
  registerIpc();
  createWindow();
  log("Desktop scraper ready");
  await persistAndBroadcast();
});

app.on("window-all-closed", () => {
  controller?.cancel();
  app.quit();
});
