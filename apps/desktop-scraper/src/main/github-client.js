import { canonicalizeJobUrl, titleCompanyIdentity } from "../../../../scripts/job-identity.js";
import { validateManualJob } from "../../../../scripts/manual-queue.js";

const API = "https://api.github.com";

export class GitHubError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "GitHubError";
    this.status = status;
    this.body = body;
  }
}

export class GitHubClient {
  constructor({ token, owner = "NikosPaschalis", repo = "workInPatra", branch = "main", fetchImpl = fetch }) {
    this.token = token;
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
    this.fetch = fetchImpl;
  }

  async request(pathname, options = {}) {
    const response = await this.fetch(`${API}${pathname}`, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "WorkInPatra-Desktop-Scraper",
        ...options.headers,
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new GitHubError(body.message || `GitHub request failed (${response.status})`, response.status, body);
    return body;
  }

  async verifyAccess() {
    const repository = await this.request(`/repos/${this.owner}/${this.repo}`);
    return { fullName: repository.full_name, permissions: repository.permissions || {} };
  }

  async getJsonFile(filePath) {
    const data = await this.request(`/repos/${this.owner}/${this.repo}/contents/${filePath}?ref=${encodeURIComponent(this.branch)}`);
    const text = Buffer.from(String(data.content || "").replace(/\n/g, ""), "base64").toString("utf8");
    return { value: JSON.parse(text), sha: data.sha };
  }

  async putJsonFile(filePath, value, sha, message) {
    return this.request(`/repos/${this.owner}/${this.repo}/contents/${filePath}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        content: Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8").toString("base64"),
        sha,
        branch: this.branch,
      }),
    });
  }

  async verifyCommit(sha) {
    return this.request(`/repos/${this.owner}/${this.repo}/git/commits/${sha}`);
  }
}

function cleanForQueue(job) {
  const {
    id, approved, rejected, validationStatus, validationReasons, canonicalUrl,
    dateProvenance, ...clean
  } = job;
  return { ...clean, url: canonicalUrl || canonicalizeJobUrl(job.url) };
}

export async function uploadApprovedJobs(client, approvedJobs, { maxAttempts = 2 } = {}) {
  if (!approvedJobs.length) throw new Error("No approved listings are ready for upload");
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const [publishedFile, karieraFile, manualFile] = await Promise.all([
      client.getJsonFile("data/jobs.json"),
      client.getJsonFile("data/kariera-pending.json"),
      client.getJsonFile("data/manual-pending.json"),
    ]);
    const published = publishedFile.value.jobs || [];
    const queued = [...(karieraFile.value.jobs || []), ...(manualFile.value.jobs || [])];
    const urls = new Set([...published, ...queued].map((job) => canonicalizeJobUrl(job.url)).filter(Boolean));
    const names = new Set([...published, ...queued].map(titleCompanyIdentity).filter(Boolean));
    const additions = [];
    for (const approved of approvedJobs) {
      const job = cleanForQueue(approved);
      const validation = validateManualJob(job);
      if (!validation.valid || !validation.eligible) continue;
      const name = titleCompanyIdentity(job);
      if (urls.has(validation.canonicalUrl) || (name && names.has(name))) continue;
      urls.add(validation.canonicalUrl);
      if (name) names.add(name);
      additions.push({ ...job, url: validation.canonicalUrl, ...validation.publication });
    }
    if (!additions.length) return { uploaded: 0, duplicateOnly: true, commitUrl: null, commitSha: null };
    try {
      const response = await client.putJsonFile(
        "data/manual-pending.json",
        { jobs: [...(manualFile.value.jobs || []), ...additions] },
        manualFile.sha,
        `chore: queue ${additions.length} desktop-approved job${additions.length === 1 ? "" : "s"}`
      );
      const commitSha = response.commit?.sha;
      if (!commitSha) throw new Error("GitHub did not return a commit SHA");
      await client.verifyCommit(commitSha);
      return {
        uploaded: additions.length,
        duplicateOnly: false,
        commitSha,
        commitUrl: response.commit?.html_url || `https://github.com/${client.owner}/${client.repo}/commit/${commitSha}`,
      };
    } catch (error) {
      if (attempt < maxAttempts && error instanceof GitHubError && [409, 422].includes(error.status)) continue;
      throw error;
    }
  }
  throw new Error("Upload retry limit reached");
}
