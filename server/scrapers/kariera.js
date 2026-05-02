import { parseGreekDate } from "./_shared.js";

const API = "https://www.kariera.gr/api/v2/jobseeker/jobs";
const PAGE_URL = "https://www.kariera.gr/jobs/jobs-in-achaia--patra";
const LIMIT = 50;
const MAX_PAGES = 4;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "el-GR,el;q=0.9,en-US;q=0.8,en;q=0.7",
  "Origin": "https://www.kariera.gr",
  "Referer": PAGE_URL,
};

// Defensive accessor — tries each path until a non-empty value is found
function pick(obj, ...paths) {
  for (const p of paths) {
    const v = p.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
    if (v != null && v !== "") return v;
  }
  return undefined;
}

function normalizeJob(raw) {
  const title = pick(raw, "title", "jobTitle", "name") || "";
  const company =
    pick(raw, "company.name", "companyName", "employer.name", "employer") || "";

  const slug = pick(raw, "slug", "url", "permalink", "seoUrl");
  const id = pick(raw, "id", "jobId", "_id");
  const url = slug
    ? (String(slug).startsWith("http") ? slug : `https://www.kariera.gr${String(slug).startsWith("/") ? "" : "/"}${slug}`)
    : (id ? `https://www.kariera.gr/jobs/${id}` : "");

  const dateRaw =
    pick(raw, "publishedAt", "createdAt", "datePosted", "postedAt", "publicationDate", "date") || "";

  const tags = [];
  const empType = pick(raw, "employmentType", "jobType", "type");
  if (empType) tags.push(typeof empType === "string" ? empType : empType.name || empType.label);
  const remote = pick(raw, "remote", "isRemote");
  if (remote === true) tags.push("Remote");
  const cats = pick(raw, "categories", "tags", "skills");
  if (Array.isArray(cats)) {
    for (const c of cats) {
      const t = typeof c === "string" ? c : (c?.name || c?.label || "");
      if (t && tags.length < 6) tags.push(t);
    }
  }

  return {
    title: String(title).trim(),
    company: String(company).trim(),
    dateRaw: String(dateRaw),
    tags: tags.filter(Boolean).map(t => String(t).trim()).filter(t => t.length < 40),
    url,
    source: "kariera",
  };
}

function extractJobsArray(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["jobs", "results", "data", "items", "content", "hits"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  if (Array.isArray(payload?.data?.jobs)) return payload.data.jobs;
  if (Array.isArray(payload?.data?.results)) return payload.data.results;
  return [];
}

export async function scrape() {
  const all = [];
  let loggedShape = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${API}?locationQ=achaia--patra&page=${page}&limit=${LIMIT}`;
    const res = await fetch(url, { headers: HEADERS });

    if (!res.ok) {
      throw new Error(`kariera API ${res.status} ${res.statusText} on page ${page}`);
    }

    const payload = await res.json();
    if (!loggedShape) {
      const topKeys = payload && typeof payload === "object" ? Object.keys(payload).slice(0, 10) : [];
      console.log(`  [kariera] response keys: ${JSON.stringify(topKeys)}`);
      loggedShape = true;
    }

    const rawJobs = extractJobsArray(payload);
    if (rawJobs.length === 0) break;

    for (const r of rawJobs) all.push(normalizeJob(r));
    if (rawJobs.length < LIMIT) break;
  }

  return all
    .filter(j => j.title)
    .map(j => ({ ...j, date: parseDate(j.dateRaw) }));
}

function parseDate(raw) {
  if (!raw) return null;
  // ISO 8601 (e.g. "2026-04-30T12:00:00Z" or "2026-04-30") — what the API returns
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const d = new Date(raw);
    if (!isNaN(d)) {
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
    }
  }
  // Fallback for Greek relative strings ("πριν 2 μέρες" etc.) in case the API uses them
  return parseGreekDate(raw);
}
