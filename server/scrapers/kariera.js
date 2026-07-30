import { USER_AGENT } from "./_shared.js";

const BASE_URL = "https://www.kariera.gr";
const PAGE_URL = `${BASE_URL}/jobs/jobs-in-achaia--patra`;

const HEADERS = {
  "User-Agent": USER_AGENT,
  "Accept": "text/html,application/xhtml+xml",
  "Accept-Language": "el-GR,el;q=0.9,en;q=0.8",
};


function extractJobs(html) {
  const jobs = [];
  const seen = new Set();

  const jsonLdRegex =
    /<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs;

  let match;

  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1].trim());

      if (
        data["@type"] !== "ItemList" ||
        !Array.isArray(data.itemListElement)
      ) {
        continue;
      }

      for (const item of data.itemListElement) {

        if (!item.name || !item.url) continue;

        if (seen.has(item.url)) continue;
        seen.add(item.url);

        jobs.push({
          title: item.name.trim(),
          company: "",
          url: item.url,
          source: "kariera",
          dateRaw: "",
          date: null,
          tags: ["Πάτρα"]
        });
      }

    } catch (e) {
      console.log("[kariera] invalid JSON-LD block");
    }
  }

  return jobs;
}


export async function scrape() {

  const res = await fetch(PAGE_URL, {
    headers: HEADERS
  });

  if (!res.ok) {
    throw new Error(`Kariera HTML ${res.status}`);
  }

  const html = await res.text();

  const jobs = extractJobs(html);

  console.log(`[kariera] found ${jobs.length} jobs`);

  return jobs;
}
