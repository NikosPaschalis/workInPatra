import { withBrowser, parseGreekDate } from "./_shared.js";

const URL = "https://gr.indeed.com/jobs?q=&l=%CE%A0%CE%AC%CF%84%CF%81%CE%B1&sort=date";

export async function scrape() {
  return withBrowser(async (page) => {
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.waitForSelector("div.job_seen_beacon", { timeout: 15000 });

    return page.evaluate(() => {
      return Array.from(document.querySelectorAll("div.job_seen_beacon")).map(card => {
        const titleEl = card.querySelector("h2.jobTitle a, a.jcs-JobTitle");
        const jk      = titleEl?.getAttribute("data-jk") || "";

        // Date: Indeed shows "1 μέρα", "2 μέρες", "Σήμερα", "30+ μέρες"
        const dateEl = card.querySelector(
          "[class*='date'], [data-testid*='date'], span.css-qvloho, span.css-zydy3i ~ span, [class*='ago']"
        );

        // Fallback: scan all spans for date-like text
        const dateRaw = dateEl?.innerText?.trim() || (() => {
          const spans = Array.from(card.querySelectorAll("span"));
          return spans.find(s =>
            /μέρα|μέρες|ώρα|ώρες|σήμερα|χθες|πριν/i.test(s.innerText)
          )?.innerText?.trim() || "";
        })();

        return {
          title:   card.querySelector("h2.jobTitle")?.innerText?.trim() || "",
          company: card.querySelector("span[class*='EmployerName'], .css-19eicqx")?.innerText?.trim() || "",
          dateRaw: dateRaw || "Σήμερα", // Indeed hides dates on cards — treat as today
          tags: [
            card.querySelector("[class*='salary'], [class*='Salary']")?.innerText?.trim(),
            card.querySelector(".css-zydy3i")?.innerText?.trim(),
          ].filter(Boolean),
          url:    jk ? `https://gr.indeed.com/viewjob?jk=${jk}` : titleEl?.href || "",
          source: "indeed",
        };
      });
    }).then(jobs =>
      jobs
        .filter(j => j.title)
        .map(j => ({ ...j, date: parseGreekDate(j.dateRaw) }))
    );
  });
}
