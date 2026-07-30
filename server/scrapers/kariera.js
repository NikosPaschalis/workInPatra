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

  const jsonLdRegex =
    /<script type="application\/ld\+json">(.*?)<\/script>/gs;

  let match;

  while ((match = jsonLdRegex.exec(html)) !== null) {

    try {
      const data = JSON.parse(match[1]);

      if (data["@type"] !== "ItemList") {
        continue;
      }

      if (!Array.isArray(data.itemListElement)) {
        continue;
      }

      for (const item of data.itemListElement) {

        if (!item.name || !item.url) {
          continue;
        }

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

    } catch(e) {
      // ignore other JSON-LD blocks
    }
  }

  return jobs;
}


export async function scrape() {

  const res = await fetch(PAGE_URL, {
    headers: HEADERS
  });

  if (!res.ok) {
    throw new Error(
      `Kariera HTML ${res.status}`
    );
  }

  const html = await res.text();

  const jobs = extractJobs(html);

  console.log(
    `[kariera] found ${jobs.length} jobs`
  );

  return jobs;
}
