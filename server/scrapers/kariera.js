import { withBrowser } from "./_shared.js";

const BASE_URL = "https://www.kariera.gr";
const PAGE_URL = `${BASE_URL}/jobs/jobs-in-achaia--patra`;

export function extractSourceCategories(html) {
  const categories = {};
  const jobRegex =
    /\\\\\"id\\\\\":(\\d+),\\\\\"title\\\\\":[\\s\\S]{0,10000}?\\\\\"category\\\\\":\\\\\"([^\\\\\"\\\\\\\\]+)\\\\\"/g;

  let match;
  while ((match = jobRegex.exec(html)) !== null) {
    categories[match[1]] = match[2];
  }

  return categories;
}

function decodeNextDataChunks(html) {
  const chunkRegex =
    /self\\.__next_f\\.push\\(\\[\\s*\\d+\\s*,\\s*("(?:\\\\.|[^"\\\\])*")\\s*\\]\\s*\\)/gs;

  return html.replace(chunkRegex, (original, encodedChunk) => {
    try {
      return JSON.parse(encodedChunk);
    } catch {
      return original;
    }
  });
}

function extractBalancedArray(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "[") depth++;
    else if (char === "]") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function extractItemListItems(html) {
  const decodedHtml = decodeNextDataChunks(html);
  const candidates = [decodedHtml, html, html.replace(/\\\\+"/g, '"')];

  for (const candidate of candidates) {
    const itemListRegex =
      /"@type"\\s*:\\s*"ItemList"[\\s\\S]*?"itemListElement"\\s*:\\s*\\[/g;
    let match;
    while ((match = itemListRegex.exec(candidate)) !== null) {
      const arrayStart = itemListRegex.lastIndex - 1;
      const itemsText = extractBalancedArray(candidate, arrayStart);
      if (!itemsText) continue;
      try {
        const items = JSON.parse(itemsText);
        if (Array.isArray(items)) return items;
      } catch {
        // Try another candidate representation.
      }
    }
  }
  return [];
}

export function extractJobs(html) {
  const jobs = [];
  const seen = new Set();
  const sourceCategories = extractSourceCategories(html);
  const items = extractItemListItems(html);

  for (const item of items) {
    const candidates = [];
    let current = item;
    for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
      candidates.push(current);
      current = current.item ?? current.job ?? current.mainEntity ?? current.data;
    }

    const title = candidates
      .map((candidate) => candidate.name || candidate.title || candidate.headline || candidate.jobTitle)
      .find((value) => typeof value === "string" && value.trim());
    const rawUrl = candidates
      .map((candidate) => candidate.url || candidate["@id"] || candidate.link || candidate.permalink)
      .find((value) =>
        typeof value === "string" &&
        value.trim() &&
        (/^https?:\\/\\//i.test(value) || value.startsWith("/"))
      );

    if (!title || !rawUrl) continue;
    const url = /^https?:\\/\\//i.test(rawUrl)
      ? rawUrl
      : `${BASE_URL}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`;
    if (seen.has(url)) continue;
    seen.add(url);

    const id = url.match(/(\\d+)\\/?(?:\\?.*)?$/)?.[1];
    jobs.push({
      title: title.trim(),
      company: "",
      url,
      source: "kariera",
      sourceCategory: id ? sourceCategories[id] || "" : "",
      dateRaw: "",
      date: null,
      tags: ["Πάτρα"],
    });
  }
  return jobs;
}

export async function extractCardJobs(page) {
  return page.locator('[data-slot="card"][class*="group/job-card"]').evaluateAll((cards) =>
    cards.map((card) => {
      const text = (selector) =>
        card.querySelector(selector)?.innerText?.trim() || "";
      const field = (testId) => {
        const icon = card.querySelector(`[data-testid="${testId}"]`);
        return icon?.parentElement?.querySelector("span")?.innerText?.trim() || "";
      };
      const titleLink = card.querySelector("a.job-title-link");
      const time = card.querySelector("time[datetime]");
      const company = card.querySelector(
        'a[aria-label^="Προβολή σελίδας της εταιρείας"] span.text-sm.font-medium.font-accent'
      )?.innerText?.trim() || "";
      const sourceCategory = field("icon-Tag");
      const employmentType = field("icon-Briefcase");
      const experienceLevel = field("icon-LayersIcon");
      const location = field("icon-MapPin");
      const rawUrl = titleLink?.getAttribute("href") || "";

      return {
        title: text("a.job-title-link h3"),
        company,
        location,
        sourceCategory,
        employmentType,
        experienceLevel,
        dateRaw: time?.getAttribute("datetime") || "",
        date: time?.getAttribute("datetime")
          ? new Date(time.getAttribute("datetime")).toISOString()
          : null,
        tags: [sourceCategory, employmentType, experienceLevel].filter(Boolean),
        url: rawUrl ? new URL(rawUrl, "https://www.kariera.gr").href : "",
        source: "kariera",
      };
    })
  );
}

export async function scrape() {
  return withBrowser(async (page) => {
    const response = await page.goto(PAGE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    if (!response) throw new Error("Kariera navigation returned no HTTP response");

    if (!response.ok()) {
      const title = await page.title().catch(() => "");
      const bodyPreview = (await page.locator("body").innerText().catch(() => ""))
        .replace(/\\s+/g, " ")
        .slice(0, 240);
      throw new Error(
        `Kariera browser request failed: ${response.status()} ${response.statusText()} (title: ${title || "n/a"}; body: ${bodyPreview || "empty"})`
      );
    }

    let jobs = await extractCardJobs(page);
    if (jobs.length === 0) {
      jobs = extractJobs(await page.content());
    }

    if (jobs.length === 0) {
      throw new Error("Kariera scraper returned 0 jobs - refusing to overwrite existing data");
    }

    const uniqueJobs = [...new Map(jobs.map((job) => [job.url, job])).values()];
    const validJobs = uniqueJobs.filter((job) => job.title && job.url);

    if (validJobs.length < Math.min(10, jobs.length)) {
      throw new Error(
        `Kariera returned too few valid job cards: ${validJobs.length}/${jobs.length}`
      );
    }

    const categorizedCount = validJobs.filter((job) => job.sourceCategory).length;
    const companyCount = validJobs.filter((job) => job.company).length;
    console.log(
      `[kariera] found ${validJobs.length} jobs; source categories ${categorizedCount}; companies ${companyCount}`
    );

    return validJobs;
  });
}
