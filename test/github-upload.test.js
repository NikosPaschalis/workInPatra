import test from "node:test";
import assert from "node:assert/strict";
import { GitHubClient, GitHubError, readGitHubBaseline, uploadApprovedJobs } from "../apps/desktop-scraper/src/main/github-client.js";

const job = (overrides = {}) => ({
  title: "Accountant", company: "Example", location: "Πάτρα", source: "jobfind",
  url: "https://www.jobfind.gr/JobAd/View/GR/Theseis_Ergasias/test-id/",
  category: "admin", sourceCategory: "Οικονομικά", date: null, dateRaw: "",
  manuallyVerifiedAt: "2026-11-20T10:00:00.000Z", approved: true, ...overrides,
});

class FakeClient {
  constructor({ conflict = false, verifyFailure = false, existing = [], manualMissing = false } = {}) {
    this.owner = "NikosPaschalis";
    this.repo = "workInPatra";
    this.conflict = conflict;
    this.verifyFailure = verifyFailure;
    this.existing = existing;
    this.manualMissing = manualMissing;
    this.lastSha = undefined;
    this.puts = 0;
    this.reads = 0;
  }
  async getJsonFile(filePath) {
    this.reads++;
    if (filePath === "data/jobs.json") return { value: { jobs: [] }, sha: "jobs" };
    if (filePath === "data/kariera-pending.json") return { value: { jobs: [] }, sha: "kariera" };
    if (this.manualMissing) throw new GitHubError("Not Found", 404, {});
    return { value: { jobs: this.existing }, sha: `manual-${this.reads}` };
  }
  async putJsonFile(_path, value, sha) {
    this.puts++;
    this.lastSha = sha;
    if (this.conflict && this.puts === 1) throw new GitHubError("sha conflict", 409, {});
    this.existing = value.jobs;
    this.manualMissing = false;
    return { commit: { sha: "commit-sha", html_url: "https://github.com/commit-sha" } };
  }
  async verifyCommit() {
    if (this.verifyFailure) throw new Error("verification interrupted");
    return { sha: "commit-sha" };
  }
}

test("GitHub client keeps authentication in request headers and targets the fixed repository", async () => {
  let request;
  const client = new GitHubClient({ token: "secret-token", fetchImpl: async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ full_name: "NikosPaschalis/workInPatra", permissions: { push: true } }) };
  } });
  await client.verifyAccess();
  assert.equal(request.url, "https://api.github.com/repos/NikosPaschalis/workInPatra");
  assert.equal(request.options.headers.Authorization, "Bearer secret-token");
});

test("upload writes only manual-pending and verifies the resulting commit", async () => {
  const client = new FakeClient();
  const result = await uploadApprovedJobs(client, [job()]);
  assert.equal(result.uploaded, 1);
  assert.equal(result.commitSha, "commit-sha");
  assert.equal(client.puts, 1);
});

test("live baseline reads published and both pending queues", async () => {
  const client = new FakeClient({ existing: [job()] });
  const baseline = await readGitHubBaseline(client);
  assert.equal(baseline.published.length, 0);
  assert.equal(baseline.karieraPending.length, 0);
  assert.equal(baseline.manualPending.length, 1);
  assert.equal(client.reads, 3);
});

test("missing manual queue is treated as empty and created on first upload", async () => {
  const client = new FakeClient({ manualMissing: true });
  const baseline = await readGitHubBaseline(client);
  assert.equal(baseline.manualPendingMissing, true);
  assert.deepEqual(baseline.manualPending, []);
  const result = await uploadApprovedJobs(client, [job()]);
  assert.equal(result.uploaded, 1);
  assert.equal(client.lastSha, null);
  assert.equal(client.puts, 1);
});

test("GitHub file creation omits a null SHA", async () => {
  let requestBody;
  const client = new GitHubClient({ token: "secret", fetchImpl: async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return { ok: true, json: async () => ({ commit: { sha: "created" } }) };
  } });
  await client.putJsonFile("data/manual-pending.json", { jobs: [] }, null, "create queue");
  assert.equal(Object.hasOwn(requestBody, "sha"), false);
});

test("SHA conflicts trigger a bounded reread and retry", async () => {
  const client = new FakeClient({ conflict: true });
  const result = await uploadApprovedJobs(client, [job()]);
  assert.equal(result.uploaded, 1);
  assert.equal(client.puts, 2);
  assert.equal(client.reads, 6);
});

test("idempotent upload skips an already queued listing", async () => {
  const client = new FakeClient({ existing: [job()] });
  const result = await uploadApprovedJobs(client, [job()]);
  assert.equal(result.duplicateOnly, true);
  assert.equal(client.puts, 0);
});

test("interrupted verification rejects without claiming local success", async () => {
  const client = new FakeClient({ verifyFailure: true });
  await assert.rejects(() => uploadApprovedJobs(client, [job()]), /verification interrupted/);
});
