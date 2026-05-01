import { withBrowser, parseGreekDate } from "./_shared.js";

const URL = "https://www.kariera.gr/jobs/jobs-in-achaia--patra";

export async function scrape() {
  return withBrowser(async (page) => {
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Detect Cloudflare JS challenge / IP block before waiting for job cards
    const title = await page.title();
    if (/just a moment|attention required|access denied|cloudflare/i.test(title)) {
      throw new Error(`kariera.gr blocked by Cloudflare (page title: "${title}") — datacenter IP likely flagged`);
    }

    await page.waitForSelector("[class*='BaseJobCard_root']", { timeout: 20000 });

    return page.evaluate(() => {
      return Array.from(document.querySelectorAll("[class*='BaseJobCard_root']")).map(card => {
        const titleEl  = card.querySelector("[class*='BaseJobCard_jobTitle']");
        const infoEl   = card.querySelector("[class*='JobInfoTagsSection_compWrap']");

        // Info section children: location | date | salary | type
        const infoItems = infoEl
          ? Array.from(infoEl.children).map(c => c.innerText?.trim()).filter(Boolean)
          : [];

        const dateRaw = infoItems.find(s =>
          /πριν|χθες|σήμερα|ημέρ|εβδ|μήν/i.test(s)
        ) || "";

        const tags = infoItems.filter(s =>
          !/πριν|χθες|σήμερα|ημέρ|εβδ|μήν|πάτρ|αχαΐ|N\/A/i.test(s)
          && s.length < 40
        );

        return {
          title:   titleEl?.innerText?.trim() || "",
          company: card.querySelector("[class*='JobCompanyName_company']")?.innerText?.trim() || "",
          dateRaw,
          tags,
          url:     titleEl?.href || card.querySelector("a[href]")?.href || "",
          source:  "kariera",
        };
      });
    }).then(jobs =>
      jobs
        .filter(j => j.title)
        .map(j => ({ ...j, date: parseGreekDate(j.dateRaw) }))
    );
  });
}
