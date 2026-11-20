import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { categorizeJob } from "../../../../server/categorize.js";
import { parseGreekDate } from "../../../../server/scrapers/_shared.js";
import {
  PAGE_URL as KARIERA_URL,
  extractCardJobs as extractKarieraCards,
  extractDates as extractKarieraDates,
  extractJobs as extractKarieraHtml,
} from "../../../../server/scrapers/kariera.js";
import {
  PAGE_URL as JOBFIND_URL,
  extractJobsFromPage as extractJobfind,
} from "../../../../server/scrapers/jobfind.js";
import {
  PAGE_URL as XE_URL,
  extractJobsFromPage as extractXeCards,
  extractSourceCategory,
  parseFooter,
} from "../../../../server/scrapers/xe.js";
import { classifyAccess } from "./access-policy.js";

const source = process.argv[2];
let browser;

function send(message) {
  if (process.send) process.send(message);
}

function blockedError(message, status = null) {
  const error = new Error(message);
  error.code = "BLOCKED";
  error.httpStatus = status;
  return error;
}

async function assertAllowed(page, response) {
  const status = response?.status?.() || 0;
  const title = await page.title().catch(() => "");
  const body = await page.locator("body").innerText().catch(() => "");
  const policy = classifyAccess({ status, title, body });
  if (policy.allowed) return;
  if (policy.blocked) throw blockedError(policy.reason, status || null);
  throw new Error(policy.reason);
}

async function parseSource(page, selectedSource) {
  if (selectedSource === "kariera") {
    let jobs = await extractKarieraCards(page);
    if (!jobs.length) {
      const html = await page.content();
      const dates = extractKarieraDates(html);
      jobs = extractKarieraHtml(html).map((job) => {
        const id = job.url.match(/(\d+)\/?(?:\?.*)?$/)?.[1];
        const dateRaw = id ? dates[id] || "" : "";
        return { ...job, dateRaw, date: dateRaw ? new Date(dateRaw).toISOString() : null };
      });
    }
    return jobs;
  }
  if (selectedSource === "jobfind") {
    const jobs = await extractJobfind(page);
    return jobs.map((job) => ({ ...job, date: parseGreekDate(job.dateRaw) }));
  }
  if (selectedSource === "xe") {
    const cards = await extractXeCards(page);
    return cards.map((job) => {
      const fields = parseFooter(job.footer);
      const sourceCategory = extractSourceCategory(job.url);
      return {
        title: job.title,
        ...fields,
        tags: [sourceCategory].filter(Boolean),
        url: job.url,
        source: "xe",
        sourceCategory,
        date: parseGreekDate(fields.dateRaw),
      };
    });
  }
  throw new Error(`Unsupported source: ${selectedSource}`);
}

async function run({ fixturePath = null } = {}) {
  const urls = { kariera: KARIERA_URL, jobfind: JOBFIND_URL, xe: XE_URL };
  if (!urls[source]) throw new Error(`Unknown source ${source}`);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: "el-GR" });
  const page = await context.newPage();
  if (fixturePath) {
    await page.setContent(await readFile(fixturePath, "utf8"), { waitUntil: "domcontentloaded" });
  } else {
    const response = await page.goto(urls[source], { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (!response) throw new Error("Navigation returned no HTTP response");
    await assertAllowed(page, response);
    const selector = source === "kariera"
      ? '[data-slot="card"][class*="group/job-card"], a.job-title-link'
      : source === "jobfind" ? "div.jobitem" : "div.result-list-narrow-item-wrapper";
    await page.waitForSelector(selector, { timeout: 15_000 });
  }
  const jobs = (await parseSource(page, source))
    .filter((job) => job.title && job.url)
    .map((job) => ({ ...job, category: categorizeJob(job) }));
  if (!jobs.length) throw new Error("Source returned no valid individual listings");
  return jobs;
}

process.on("message", async (message) => {
  if (message?.type !== "start") return;
  try {
    const jobs = await run(message.options || {});
    send({ type: "success", jobs });
  } catch (error) {
    send({
      type: "error",
      error: {
        code: error?.code === "BLOCKED" ? "BLOCKED" : "FAILED",
        message: String(error?.message || error),
        httpStatus: error?.httpStatus || null,
      },
    });
  } finally {
    await browser?.close().catch(() => {});
    process.exit();
  }
});

process.on("SIGTERM", async () => {
  await browser?.close().catch(() => {});
  process.exit(0);
});
