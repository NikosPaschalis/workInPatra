import { USER_AGENT } from "./_shared.js";

const BASE_URL = "https://www.kariera.gr";
const PAGE_URL = `${BASE_URL}/jobs/jobs-in-achaia--patra`;

const HEADERS = {
  "User-Agent": USER_AGENT,
  "Accept": "text/html,application/xhtml+xml",
  "Accept-Language": "el-GR,el;q=0.9,en-US;q=0.8,en;q=0.7",
};


// Extract jobs from ItemList JSON-LD
function extractJobs(html) {
  const jobs = [];
  const seen = new Set();

  /*
    Kariera uses Next.js and embeds JSON-LD inside
    self.__next_f.push(...) instead of a normal script tag.
    We search the HTML for the ItemList structure.
  */

  const itemListRegex =
    /\\"@type\\":\\"ItemList\\"[\s\S]*?\\"itemListElement\\":\[(.*?)\]\}/;

  const match = html.match(itemListRegex);

  if (!match) {
    return [];
  }


  const itemsText = `[${match[1]}]`;

  let items;

  try {
    items = JSON.parse(
      itemsText
        .replace(/\\"/g, '"')
    );
  } catch (e) {
    console.log("[kariera] failed parsing ItemList JSON");
    return [];
  }


  for (const item of items) {

    if (!item.name || !item.url) {
      continue;
    }

    if (seen.has(item.url)) {
      continue;
    }

    seen.add(item.url);

    jobs.push({
      title: item.name.trim(),
      company: "",
      url: item.url.startsWith("http")
        ? item.url
        : `${BASE_URL}${item.url}`,
      source: "kariera",
      dateRaw: "",
      date: null,
      tags: ["Πάτρα"]
    });
  }


  return jobs;
}


// Extract dates from job cards
function extractDates(html) {

  const dates = {};

  /*
    Example:
    href="/jobs/.../327557"
    ...
    dateTime="2026-07-30T01:01:03.474Z"
  */

  const regex =
    /href="\/jobs\/[^"]*\/(\d+)"[\s\S]{0,3000}?dateTime="([^"]+)"/g;


  let match;

  while ((match = regex.exec(html)) !== null) {

    const id = match[1];
    const date = match[2];

    dates[id] = date;
  }


  return dates;
}



export async function scrape() {

  const res = await fetch(PAGE_URL, {
    headers: HEADERS
  });


  if (!res.ok) {

    throw new Error(
      `Kariera HTML request failed: ${res.status}`
    );

  }


  const html = await res.text();


  const jobs = extractJobs(html);


  /*
    Safety check:
    If Kariera changes structure or blocks us,
    do NOT return empty data.
    The main scraper should fail and keep old database.
  */

  if (jobs.length === 0) {

    throw new Error(
      "Kariera scraper returned 0 jobs - refusing to overwrite existing data"
    );

  }


  const dates = extractDates(html);


  const enrichedJobs = jobs.map(job => {

    const id = job.url.match(/(\d+)$/)?.[1];

    const dateRaw = dates[id] || "";


    return {
      ...job,
      dateRaw,
      date: dateRaw
        ? new Date(dateRaw).toISOString()
        : null
    };

  });


  console.log(
    `[kariera] found ${enrichedJobs.length} jobs`
  );


  return enrichedJobs;
}
