import { USER_AGENT } from "./_shared.js";

const BASE_URL = "https://www.kariera.gr";
const PAGE_URL = `${BASE_URL}/jobs/jobs-in-achaia--patra`;

const HEADERS = {
  "User-Agent": USER_AGENT,
  "Accept": "text/html,application/xhtml+xml",
  "Accept-Language": "el-GR,el;q=0.9,en-US;q=0.8,en;q=0.7",
};


// Extract the source category from Kariera's embedded job records. The
// ItemList used below only contains a job's name and URL, while the richer
// Next.js payload also includes its category.
export function extractSourceCategories(html) {
  const categories = {};
  const jobRegex =
    /\\\"id\\\":(\d+),\\\"title\\\":[\s\S]{0,10000}?\\\"category\\\":\\\"([^\\"\\]+)\\\"/g;

  let match;
  while ((match = jobRegex.exec(html)) !== null) {
    categories[match[1]] = match[2];
  }

  return categories;
}

// Next.js Flight embeds page data inside JavaScript string literals. Decode
// those literals before parsing the JSON they contain.
function decodeNextDataChunks(html) {
  const chunkRegex =
    /self\.__next_f\.push\(\[\s*\d+\s*,\s*("(?:\\.|[^"\\])*")\s*\]\s*\)/gs;

  return html.replace(chunkRegex, (original, encodedChunk) => {
    try {
      return JSON.parse(encodedChunk);
    } catch {
      return original;
    }
  });
}

// Read an array with balanced brackets instead of stopping at the first "]}",
// which can also occur inside nested objects/arrays within a job record.
function extractBalancedArray(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;

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
    else if (char === "]") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

function extractItemListItems(html) {
  const decodedHtml = decodeNextDataChunks(html);
  const candidates = [
    decodedHtml,
    html,
    html.replace(/\\+"/g, '"'),
  ];

  for (const candidate of candidates) {
    const itemListRegex =
      /"@type"\s*:\s*"ItemList"[\s\S]*?"itemListElement"\s*:\s*\[/g;

    let match;
    while ((match = itemListRegex.exec(candidate)) !== null) {
      const arrayStart = itemListRegex.lastIndex - 1;
      const itemsText = extractBalancedArray(candidate, arrayStart);
      if (!itemsText) continue;

      try {
        const items = JSON.parse(itemsText);
        if (Array.isArray(items)) return items;
      } catch {
        // Try the next ItemList/candidate instead of failing on a partial match.
      }
    }
  }

  return [];
}

// Extract jobs from ItemList JSON-LD. ItemList entries may be direct
// {name, url} records or Schema.org ListItems containing a nested JobPosting.
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
        (/^https?:\/\//i.test(value) || value.startsWith("/"))
      );

    if (!title || !rawUrl) continue;

    const url = /^https?:\/\//i.test(rawUrl)
      ? rawUrl
      : `${BASE_URL}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`;

    if (seen.has(url)) continue;
    seen.add(url);

    const id = url.match(/(\d+)\/?(?:\?.*)?$/)?.[1];

    jobs.push({
      title: title.trim(),
      company: "",
      url,
      source: "kariera",
      sourceCategory: id ? sourceCategories[id] || "" : "",
      dateRaw: "",
      date: null,
      tags: ["Πάτρα"]
    });
  }

  return jobs;
}


// Extract dates without relying on the amount of markup between a job link and
// its <time> element. Kariera's cards can grow beyond any fixed-size window.
export function extractDates(html) {
  const dates = {};
  let pendingJobId = null;

  const tokenRegex =
    /href="\/jobs\/[^"]*\/(\d+)"|<time\b[^>]*\bdatetime="([^"]+)"/gi;

  let match;
  while ((match = tokenRegex.exec(html)) !== null) {
    if (match[1]) {
      pendingJobId = match[1];
      continue;
    }

    if (!pendingJobId || !match[2]) continue;

    const parsed = new Date(match[2]);
    if (!Number.isNaN(parsed.getTime())) {
      dates[pendingJobId] = parsed.toISOString();
    }
    pendingJobId = null;
  }

  return dates;
}



export async function scrape() {
  const res = await fetch(PAGE_URL, { headers: HEADERS });

  if (!res.ok) {
    throw new Error(`Kariera HTML request failed: ${res.status}`);
  }

  const html = await res.text();
  const jobs = extractJobs(html);

  // If Kariera changes structure or blocks us, do NOT return empty data.
  if (jobs.length === 0) {
    throw new Error(
      "Kariera scraper returned 0 jobs - refusing to overwrite existing data"
    );
  }

  const dates = extractDates(html);
  const enrichedJobs = jobs.map((job) => {
    const id = job.url.match(/(\d+)$/)?.[1];
    const dateRaw = dates[id] || "";

    return {
      ...job,
      dateRaw,
      date: dateRaw ? new Date(dateRaw).toISOString() : null
    };
  });

  console.log(`[kariera] found ${enrichedJobs.length} jobs`);
  const categorizedCount = enrichedJobs.filter((job) => job.sourceCategory).length;
  console.log(
    `[kariera] source categories found for ${categorizedCount}/${enrichedJobs.length} jobs`
  );

  return enrichedJobs;
}
