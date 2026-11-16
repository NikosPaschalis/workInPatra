import { withBrowser } from "./_shared.js";

const BASE_URL = "https://www.kariera.gr";
const PAGE_URL = BASE_URL + "/jobs/jobs-in-achaia--patra";

export function extractSourceCategories(html) {
  const categories = {};
  const jobRegex = /\\\"id\\\":(\d+),\\\"title\\\":[\s\S]{0,10000}?\\\"category\\\":\\\"([^\\\"\\]+)\\\"/g;
  let match;
  while ((match = jobRegex.exec(html)) !== null) categories[match[1]] = match[2];
  return categories;
}

function decodeNextDataChunks(html) {
  const chunkRegex = /self\.__next_f\.push\(\[\s*\d+\s*,\s*("(?:\\.|[^"\\])*")\s*\]\s*\)/gs;
  return html.replace(chunkRegex, (original, encodedChunk) => {
    try { return JSON.parse(encodedChunk); } catch { return original; }
  });
}

function extractBalancedArray(text, start) {
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "[") depth++;
    else if (char === "]" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

function extractItemListItems(html) {
  const decoded = decodeNextDataChunks(html);
  const candidates = [decoded, html, html.replace(/\\+"/g, '"')];
  for (const candidate of candidates) {
    const regex = /"@type"\s*:\s*"ItemList"[\s\S]*?"itemListElement"\s*:\s*\[/g;
    let match;
    while ((match = regex.exec(candidate)) !== null) {
      const itemsText = extractBalancedArray(candidate, regex.lastIndex - 1);
      if (!itemsText) continue;
      try { const items = JSON.parse(itemsText); if (Array.isArray(items)) return items; } catch {}
    }
  }
  return [];
}


export function extractDates(html) {
  const dates = {};
  let pendingJobId = null;
  const tokenRegex = /href="\/jobs\/[^"]*\/(\d+)"|<time\b[^>]*\bdatetime="([^"]+)"/gi;
  let match;
  while ((match = tokenRegex.exec(html)) !== null) {
    if (match[1]) {
      pendingJobId = match[1];
      continue;
    }
    if (!pendingJobId || !match[2]) continue;
    const parsed = new Date(match[2]);
    if (!Number.isNaN(parsed.getTime())) dates[pendingJobId] = parsed.toISOString();
    pendingJobId = null;
  }
  return dates;
}

export function extractJobs(html) {
  const jobs = [], seen = new Set(), categories = extractSourceCategories(html);
  for (const item of extractItemListItems(html)) {
    const candidates = [];
    let current = item;
    for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
      candidates.push(current); current = current.item ?? current.job ?? current.mainEntity ?? current.data;
    }
    const title = candidates.map((x) => x.name || x.title || x.headline || x.jobTitle).find((x) => typeof x === "string" && x.trim());
    const rawUrl = candidates.map((x) => x.url || x["@id"] || x.link || x.permalink).find((x) => typeof x === "string" && x.trim() && (/^https?:\/\//i.test(x) || x.startsWith("/")));
    if (!title || !rawUrl) continue;
    const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : BASE_URL + (rawUrl.startsWith("/") ? "" : "/") + rawUrl;
    if (seen.has(url)) continue;
    seen.add(url);
    const id = url.match(/(\d+)\/?(?:\?.*)?$/)?.[1];
    jobs.push({ title: title.trim(), company: "", url, source: "kariera", sourceCategory: id ? categories[id] || "" : "", dateRaw: "", date: null, tags: ["Πάτρα"] });
  }
  return jobs;
}

export async function extractCardJobs(page) {
  return page.locator('[data-slot="card"][class*="group/job-card"]').evaluateAll((cards) =>
    cards.map((card) => {
      const text = (selector) => card.querySelector(selector)?.innerText?.trim() || "";
      const field = (testId) => {
        const icon = card.querySelector('[data-testid="' + testId + '"]');
        return icon?.parentElement?.querySelector("span")?.innerText?.trim() || "";
      };
      const titleLink = card.querySelector("a.job-title-link");
      const time = card.querySelector("time[datetime]");
      const company = card.querySelector('a[aria-label^="Προβολή σελίδας της εταιρείας"] span.text-sm.font-medium.font-accent')?.innerText?.trim() || "";
      const sourceCategory = field("icon-Tag");
      const employmentType = field("icon-Briefcase");
      const experienceLevel = field("icon-LayersIcon");
      const location = field("icon-MapPin");
      const rawUrl = titleLink?.getAttribute("href") || "";
      const dateRaw = time?.getAttribute("datetime") || "";
      return {
        title: text("a.job-title-link h3"), company, location, sourceCategory, employmentType, experienceLevel,
        dateRaw, date: dateRaw ? new Date(dateRaw).toISOString() : null,
        tags: [sourceCategory, employmentType, experienceLevel].filter(Boolean),
        url: rawUrl ? new URL(rawUrl, "https://www.kariera.gr").href : "", source: "kariera",
      };
    })
  );
}

export async function scrape() {
  return withBrowser(async (page) => {
    const response = await page.goto(PAGE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    if (!response) throw new Error("Kariera navigation returned no HTTP response");
    if (!response.ok()) {
      const title = await page.title().catch(() => "");
      const body = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 240);
      throw new Error("Kariera browser request failed: " + response.status() + " " + response.statusText() + " (title: " + (title || "n/a") + "; body: " + (body || "empty") + ")");
    }
    let jobs = await extractCardJobs(page);
    if (!jobs.length) {
      const html = await page.content();
      const dates = extractDates(html);
      jobs = extractJobs(html).map((job) => {
        const id = job.url.match(/(\d+)$/)?.[1];
        const dateRaw = id ? dates[id] || "" : "";
        return {
          ...job,
          dateRaw,
          date: dateRaw ? new Date(dateRaw).toISOString() : null,
        };
      });
    }
    if (!jobs.length) throw new Error("Kariera scraper returned 0 jobs - refusing to overwrite existing data");
    const unique = [...new Map(jobs.map((job) => [job.url, job])).values()];
    const valid = unique.filter((job) => job.title && job.url);
    if (valid.length < Math.min(10, jobs.length)) throw new Error("Kariera returned too few valid job cards: " + valid.length + "/" + jobs.length);
    const categorized = valid.filter((job) => job.sourceCategory).length;
    const companies = valid.filter((job) => job.company).length;
    console.log("[kariera] found " + valid.length + " jobs; source categories " + categorized + "; companies " + companies);
    return valid;
  });
}
