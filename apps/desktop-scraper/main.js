import { app, BrowserWindow, dialog, ipcMain, safeStorage, session, shell } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeJobUrl } from "../../scripts/job-identity.js";
import { classifyManualCandidates, validateSourceUrl } from "../../scripts/manual-queue.js";
import { CredentialStore } from "./src/main/credential-store.js";
import { GitHubClient, readGitHubBaseline, uploadApprovedJobs } from "./src/main/github-client.js";
import { isAllowedKarieraSnapshotUrl, isAllowedKarieraUrl, KARIERA_PATRAS_URL } from "./src/main/kariera-browser-policy.js";
import { LocalStore } from "./src/main/local-store.js";
import { karieraSnapshotDirectory, resolveProjectRoot } from "./src/main/project-paths.js";
import { ScrapeController } from "./src/main/scrape-controller.js";
import { dashboardCounts, publicState, SOURCES } from "./src/shared/state.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (process.env.WORKINPATRA_USER_DATA_DIR) {
  app.setPath("userData", path.resolve(process.env.WORKINPATRA_USER_DATA_DIR));
}
const CHANNELS = new Set([
  "state:get", "scan:start", "scan:cancel", "review:set", "results:export",
  "history:clear", "github:authenticate", "github:disconnect", "github:upload",
  "external:open", "diagnostics:export", "kariera:open", "kariera:snapshot",
]);

let window;
let karieraWindow;
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

function reclassifyCurrentResults() {
  if (!state.results.length) return;
  const previous = state.results;
  const classified = classifyManualCandidates(previous, baseline);
  state.results = attachIds(classified, previous).map((job) => {
    const reviewable = ["new", "review", "suspected_duplicate"].includes(job.validationStatus);
    return reviewable ? job : { ...job, approved: false, rejected: false, manuallyVerifiedAt: null };
  });
}

async function refreshBaselineFromGitHub(client) {
  const remote = await readGitHubBaseline(client);
  baseline = {
    ...baseline,
    published: remote.published,
    karieraPending: remote.karieraPending,
    manualPending: remote.manualPending,
  };
  reclassifyCurrentResults();
  state.lastBaselineRefresh = {
    at: new Date().toISOString(),
    published: remote.published.length,
    queued: remote.karieraPending.length + remote.manualPending.length,
  };
  log(`Refreshed GitHub baseline: ${remote.published.length} published, ${state.lastBaselineRefresh.queued} queued`);
  if (remote.manualPendingMissing) log("GitHub manual queue does not exist yet; it will be created by the first approved upload", "warning");
  return remote;
}

function openKarieraWindow() {
  if (karieraWindow && !karieraWindow.isDestroyed()) {
    karieraWindow.show();
    karieraWindow.focus();
    return { opened: true, reused: true };
  }

  karieraWindow = new BrowserWindow({
    parent: window,
    width: 1280,
    height: 900,
    minWidth: 900,
    minHeight: 650,
    title: "Kariera - Patra jobs",
    backgroundColor: "#ffffff",
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  karieraWindow.removeMenu();

  karieraWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedKarieraUrl(url)) {
      queueMicrotask(() => {
        if (karieraWindow && !karieraWindow.isDestroyed()) void karieraWindow.loadURL(url).catch(() => {});
      });
    }
    return { action: "deny" };
  });
  karieraWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedKarieraUrl(url)) event.preventDefault();
  });
  karieraWindow.webContents.on("will-redirect", (event, url) => {
    if (!isAllowedKarieraUrl(url)) event.preventDefault();
  });
  karieraWindow.webContents.on("did-navigate", (_event, url, statusCode) => {
    log(`Kariera window navigation: HTTP ${statusCode} ${new URL(url).pathname}`);
    void persistAndBroadcast();
  });
  karieraWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    log(`Kariera window failed to load: ${errorDescription} (${errorCode})`, "error");
    void persistAndBroadcast();
  });
  karieraWindow.on("closed", () => { karieraWindow = null; });
  karieraWindow.once("ready-to-show", () => karieraWindow?.show());

  log("Opening Kariera Patra jobs in an isolated Electron window");
  log("Complete any Cloudflare verification manually before saving and processing the snapshot", "warning");
  void persistAndBroadcast();
  void karieraWindow.loadURL(KARIERA_PATRAS_URL).catch((error) => {
    log(`Kariera window navigation failed: ${error.message}`, "error");
    void persistAndBroadcast();
  });
  return { opened: true, reused: false };
}

async function saveKarieraSnapshot() {
  if (!karieraWindow || karieraWindow.isDestroyed()) throw new Error("Open the Kariera window first");
  if (state.scanRunning || controller.running) throw new Error("Wait for the active scan to finish before processing a snapshot");
  const sourceUrl = karieraWindow.webContents.getURL();
  if (!isAllowedKarieraSnapshotUrl(sourceUrl)) throw new Error("Navigate to the Kariera Patra jobs page before saving a snapshot");
  if (karieraWindow.webContents.isLoadingMainFrame()) throw new Error("Wait for the Kariera page to finish loading");
  if (/just a moment|verify (?:you are )?human|checking your browser|cloudflare/i.test(karieraWindow.webContents.getTitle())) {
    throw new Error("Complete the Cloudflare verification manually before saving the snapshot");
  }

  const projectRoot = resolveProjectRoot({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    execPath: process.execPath,
    override: process.env.WORKINPATRA_PROJECT_ROOT || "",
  });
  const snapshotDirectory = karieraSnapshotDirectory(projectRoot);
  await mkdir(snapshotDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(snapshotDirectory, `kariera-patra-${timestamp}.html`);
  await karieraWindow.webContents.savePage(filePath, "HTMLOnly");
  log(`Saved Kariera HTML snapshot: ${filePath}`);
  const githubToken = await credentials.get();
  if (githubToken) {
    try {
      await refreshBaselineFromGitHub(createClient(githubToken));
    } catch (error) {
      log(`Could not refresh GitHub baseline; upload will still recheck duplicates: ${error.message}`, "warning");
    }
  } else {
    log("GitHub is not authenticated; using the packaged duplicate baseline until upload revalidation", "warning");
  }
  log("Processing the saved Kariera snapshot locally with no network request");
  state.scanRunning = true;
  state.lastScanAt = new Date().toISOString();
  await persistAndBroadcast();

  let settled;
  try {
    settled = await controller.run(["kariera"], { kariera: { fixturePath: filePath } });
  } finally {
    state.scanRunning = false;
  }
  const parsed = settled?.[0]?.status === "fulfilled" ? settled[0].value : null;
  if (!parsed || parsed.status !== "success") {
    const detail = parsed?.detail || settled?.[0]?.reason?.message || "Unknown local parsing error";
    log(`Kariera snapshot processing failed: ${detail}`, "error");
    await persistAndBroadcast();
    throw new Error(`Snapshot saved at ${filePath}, but local processing failed: ${detail}`);
  }
  state.sources.kariera = { status: "success", detail: `Processed local snapshot: ${path.basename(filePath)}`, count: parsed.jobs.length };
  log(`Processed ${parsed.jobs.length} Kariera listings from the local snapshot`);
  await persistAndBroadcast();
  return { saved: true, processed: true, count: parsed.jobs.length, filePath, sourceUrl };
}

function registerIpc() {
  const handle = (channel, fn) => {
    if (!CHANNELS.has(channel)) throw new Error(`Unapproved IPC channel: ${channel}`);
    ipcMain.handle(channel, async (_event, payload) => {
      try {
        return await fn(payload);
      } catch (error) {
        const message = redact(error?.message || error);
        log(`${channel} failed: ${message}`, "error");
        await persistAndBroadcast().catch(() => {});
        throw new Error(message);
      }
    });
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
    const normalizedToken = typeof token === "string" ? token.trim() : "";
    if (normalizedToken.length < 20) throw new Error("Enter a valid fine-grained GitHub token");
    const client = createClient(normalizedToken);
    let access;
    try {
      access = await client.verifyAccess();
    } catch (error) {
      throw new Error(`GitHub authentication failed: ${error.message}`);
    }
    if (access.permissions?.push === false) throw new Error("GitHub token does not have repository Contents read/write access");
    try {
      await refreshBaselineFromGitHub(client);
    } catch (error) {
      throw new Error(`GitHub token was accepted, but required repository files could not be read: ${error.message}. Check Contents read/write permission.`);
    }
    try {
      await credentials.set(normalizedToken, { persist: Boolean(persist) });
    } catch (error) {
      throw new Error(`GitHub access was verified, but credential storage failed: ${error.message}`);
    }
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
      const client = createClient(token);
      const result = await uploadApprovedJobs(client, approved);
      if (result.commitSha) {
        state.lastSuccessfulCommit = { sha: result.commitSha, url: result.commitUrl, at: new Date().toISOString(), count: result.uploaded };
      }
      log(result.duplicateOnly ? "No upload needed; all approved listings already exist" : `Verified GitHub commit ${result.commitSha}`);
      try {
        await refreshBaselineFromGitHub(client);
      } catch (refreshError) {
        log(`Upload succeeded, but the review baseline could not be refreshed: ${refreshError.message}`, "warning");
      }
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
  handle("kariera:open", () => openKarieraWindow());
  handle("kariera:snapshot", () => saveKarieraSnapshot());
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
