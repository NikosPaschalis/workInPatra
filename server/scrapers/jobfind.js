import { withBrowser, parseGreekDate } from "./_shared.js";

const URL = "https://www.jobfind.gr/jobads/all/patra1/gr/theseis_ergasias";

export async function extractJobsFromPage(page) {
  return page.locator("div.jobitem").evaluateAll((cards) =>
    cards.map((card) => {
      const text = (selector) =>
        card.querySelector(selector)?.innerText?.trim() || "";
      const link = card.querySelector("h3.title a[href]");
      const sourceCategory = text("span.category");
      const employmentType = text("div.type");
      const location = text("div.city");
      const salaryRaw = text("div.salary");

      return {
        title: text("h3.title"),
        // JobFind currently renders an empty company container on the listing page.
        // Do not treat its placeholder or neighbouring location as an employer.
        company: text("div.company a"),
        location,
        employmentType,
        salaryRaw,
        dateRaw: text("span.datemob"),
        sourceCategory,
        tags: [sourceCategory, employmentType].filter(Boolean),
        url: link ? new URL(link.getAttribute("href"), "https://www.jobfind.gr").href : "",
        source: "jobfind",
      };
    })
  );
}

export async function scrape() {
  return withBrowser(async (page) => {
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector("div.jobitem", { timeout: 15000 });

    const jobs = await extractJobsFromPage(page);
    return jobs
      .filter((job) => job.title && job.url)
      .map((job) => ({ ...job, date: parseGreekDate(job.dateRaw) }));
  });
}
