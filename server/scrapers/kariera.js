// server/scrapers/kariera.js
// Parses the Kariera.gr SSR HTML page directly — no API needed.
// The v2 API returned 404 after a Kariera backend update (July 2026).

import { parseGreekDate, USER_AGENT } from "./_shared.js";

const BASE_URL  = "https://www.kariera.gr";
const PAGE_URL  = `${BASE_URL}/jobs/jobs-in-achaia--patra`;
const MAX_PAGES = 4;

const HEADERS = {
  "User-Agent": USER_AGENT,
  "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "el-GR,el;q=0.9,en-US;q=0.8,en;q=0.7",
};

// Extract jobs from the raw HTML of a Kariera results page.
// Job links look like: /jobs/some-category-jobs/123456
function parseJobsFromHtml(html) {
  const jobs = [];
  const seen = new Set();

  // Match every job anchor: ### [Title](/jobs/category/id)
  const jobRegex = /###\s+\[([^\]]+)\]\((\/jobs\/[^)]+\/(\d+))\)/g;
  let match;

  while ((match = jobRegex.exec(html)) !== null) {
    const title  = match[1].trim();
    const path   = match[2];
    const id     = match[3];

    if (seen.has(id)) continue;
    seen.add(id);

    const url = `${BASE_URL}${path}`;

    // Try to grab the company name that appears just before the job link.
    // Pattern: [COMPANY NAME](/companies/slug)\n\n### [Job Title]
    const companyRegex = new RegExp(
      `\\[([^\\]]+)\\]\\(\\/companies\\/[^)]+\\)\\s*\\n+###\\s+\\[${escapeRegex(title)}\\]`
    );
    const companyMatch = companyRegex.exec(html);
    const company = companyMatch ? companyMatch[1].trim() : "";

    // Try to extract location
    const locationRegex = new RegExp(
      `${escapeRegex(title)}[\\s\\S]{0,300}?(Πάτρα|Achaia|Αχαΐα)`,
      "i"
    );
    const locationMatch = locationRegex.exec(html);
    const location = locationMatch ? locationMatch[1] : "Πάτρα";

    jobs.push({
      title,
      company,
      url,
      source:   "kariera",
      dateRaw:  "",
      date:     null,
      tags:     [location],
    });
  }

  return jobs;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function scrape() {
  const all  = [];
  const seen = new Set();

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = page === 0
      ? PAGE_URL
      : `${PAGE_URL}?page=${page}`;

    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
      throw new Error(`kariera HTML ${res.status} ${res.statusText} on page ${page}`);
    }

    const html = await res.text();

    // Log structure on first page for debugging
    if (page === 0) {
      const jobCount = (html.match(/\/jobs\/[^)]+\/\d+/g) || []).length;
      console.log(`  [kariera] page 0 — found ~${jobCount} job links in HTML`);
    }

    const jobs = parseJobsFromHtml(html);
    if (jobs.length === 0) break;

    let newJobs = 0;
    for (const job of jobs) {
      if (seen.has(job.url)) continue;
      seen.add(job.url);
      all.push(job);
      newJobs++;
    }

    // If no new jobs on this page, stop paginating
    if (newJobs === 0) break;

    // Kariera typically shows all jobs on one page for regional searches
    // Only paginate if we got a full page (50+)
    if (jobs.length < 50) break;
  }

  console.log(`  [kariera] total parsed: ${all.length} jobs`);
  return all.filter(j => j.title && j.url);
}
