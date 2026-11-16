import { withBrowser, parseGreekDate } from "./_shared.js";

const PAGE_URL = "https://www.xe.gr/%CE%B5%CF%81%CE%B3%CE%B1%CF%83%CE%AF%CE%B1/%CE%B8%CE%AD%CF%83%CE%B5%CE%B9%CF%82-%CE%B5%CF%81%CE%B3%CE%B1%CF%83%CE%AF%CE%B1%CF%82-%CF%80%CE%AC%CF%84%CF%81%CE%B1";

export function extractSourceCategory(url) {
  if (!url) return "";

  try {
    const parts = new URL(url, "https://www.xe.gr").pathname
      .split("/")
      .filter(Boolean);

    if (parts.length < 4 || !parts[2]) return "";
    return decodeURIComponent(parts[2]).replace(/-/g, " ").trim();
  } catch {
    return "";
  }
}

const DATE_SEGMENT = /(?:σήμερα|χθες|today|yesterday|πριν από\\s*\\d+\\s*(?:λεπτ|ώρ|μέρ|ημέρ|εβδ|μήν)|\\d+\\s*(?:λεπτ|ώρ|μέρ|ημέρ|εβδ|μήν|day|week|month))/i;
const SALARY_SEGMENT = /(?:€|ευρώ)\\s*(?:\\/|το\\s+)?|\\d[\\d.,\\s]*\\s*(?:€|ευρώ)/i;

export function parseFooter(footer = "") {
  const parts = String(footer)
    .replace(/\\u00a0/g, " ")
    .split(/\\s+-\\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return { company: "", location: "", salaryRaw: "", dateRaw: "" };
  }

  let dateRaw = "";
  if (DATE_SEGMENT.test(parts.at(-1))) dateRaw = parts.pop();

  let salaryRaw = "";
  if (parts.length && SALARY_SEGMENT.test(parts.at(-1))) salaryRaw = parts.pop();

  // The listing is filtered to Patras. A footer with one remaining segment
  // contains only the location, not a company name.
  const location = parts.pop() || "";
  const company = parts.join(" - ");

  return { company, location, salaryRaw, dateRaw };
}

export async function extractJobsFromPage(page) {
  return page.locator("div.result-list-narrow-item-wrapper").evaluateAll((wrappers) =>
    wrappers.map((wrapper) => {
      const text = (selector) =>
        wrapper.querySelector(selector)?.innerText?.trim() || "";
      const link = wrapper.querySelector("a.result-list-narrow-item-link");
      const footer = text("div.result-item-footer");

      return {
        title: text("h2.results-item-title"),
        footer,
        url: link?.href || "",
        source: "xe",
      };
    })
  );
}

export async function scrape() {
  return withBrowser(async (page) => {
    await page.goto(PAGE_URL, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForSelector("div.result-list-narrow-item-wrapper", { timeout: 15000 });

    const cards = await extractJobsFromPage(page);
    const parsedJobs = cards
      .filter((job) => job.title && job.url)
      .map((job) => {
        const { company, location, salaryRaw, dateRaw } = parseFooter(job.footer);
        return {
          title: job.title,
          company,
          location,
          salaryRaw,
          dateRaw,
          tags: [],
          url: job.url,
          source: "xe",
          sourceCategory: extractSourceCategory(job.url),
          date: parseGreekDate(dateRaw),
        };
      });

    const categorizedCount = parsedJobs.filter((job) => job.sourceCategory).length;
    console.log(
      `[xe] source categories found for ${categorizedCount}/${parsedJobs.length} jobs`
    );

    return parsedJobs;
  });
}
