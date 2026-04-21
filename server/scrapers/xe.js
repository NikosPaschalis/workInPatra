import { withBrowser, parseGreekDate } from "./_shared.js";

const URL = "https://www.xe.gr/%CE%B5%CF%81%CE%B3%CE%B1%CF%83%CE%AF%CE%B1/%CE%B8%CE%AD%CF%83%CE%B5%CE%B9%CF%82-%CE%B5%CF%81%CE%B3%CE%B1%CF%83%CE%AF%CE%B1%CF%82-%CF%80%CE%AC%CF%84%CF%81%CE%B1";

export async function scrape() {
  return withBrowser(async (page) => {
    await page.goto(URL, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForSelector("div.result-list-narrow-item-wrapper", { timeout: 15000 });

    return page.evaluate(() => {
      return Array.from(document.querySelectorAll("div.result-list-narrow-item-wrapper")).map(wrapper => {
        const link    = wrapper.querySelector("a.result-list-narrow-item-link");
        const footer  = wrapper.querySelector("div.result-item-footer")?.innerText?.trim() || "";

        // Footer format: "COMPANY - Πάτρα - πριν από X ημέρες"
        const parts   = footer.split(" - ");
        const company = parts[0]?.trim() || "";
        const dateRaw = parts[parts.length - 1]?.trim() || "";

        return {
          title:   wrapper.querySelector("h2.results-item-title")?.innerText?.trim() || "",
          company,
          dateRaw,
          tags:    [],
          url:     link?.href || "",
          source:  "xe",
        };
      });
    }).then(jobs =>
      jobs
        .filter(j => j.title)
        .map(j => ({ ...j, date: parseGreekDate(j.dateRaw) }))
    );
  });
}
