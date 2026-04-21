import { withBrowser, parseGreekDate } from "./_shared.js";

const URL = "https://www.jobfind.gr/jobads/all/patra1/gr/theseis_ergasias";

export async function scrape() {
  return withBrowser(async (page) => {
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector("div.jobitem", { timeout: 15000 });

    return page.evaluate(() => {
      return Array.from(document.querySelectorAll("div.jobitem")).map(card => {
        const link = card.querySelector("a[href]");
        return {
          title:   card.querySelector("h3.title")?.innerText?.trim() || "",
          company: card.querySelector("div.company a")?.innerText?.trim()
                   || card.querySelector("div.company")?.innerText?.trim() || "",
          dateRaw: card.querySelector("span.datemob")?.innerText?.trim() || "",
          tags:    [card.querySelector("span.category")?.innerText?.trim(),
                    card.querySelector("div.type")?.innerText?.trim()]
                     .filter(Boolean),
          url:     link ? "https://www.jobfind.gr" + link.getAttribute("href") : "",
          source:  "jobfind",
        };
      });
    }).then(jobs =>
      jobs
        .filter(j => j.title)
        .map(j => ({ ...j, date: parseGreekDate(j.dateRaw) }))
    );
  });
}
