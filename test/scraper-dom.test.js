import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { extractJobsFromPage } from "../server/scrapers/jobfind.js";
import { extractCardJobs } from "../server/scrapers/kariera.js";

async function withPage(html, fn) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html);
    return await fn(page);
  } finally {
    await browser.close();
  }
}

test("JobFind extracts location and employment type without inventing an employer", async () => {
  const jobs = await withPage(
    '<div class="jobitem">' +
      '<h3 class="title"><a href="/JobAd/View/GR/Theseis_Ergasias/abc/">Picker</a></h3>' +
      '<span class="category">Logistics - Αποθήκη - Μεταφορές</span>' +
      '<div class="company"></div>' +
      '<div class="city">ΠΑΤΡΑ ΚΕΝΤΡΟ | ΠΑΤΡΑ</div>' +
      '<div class="type">Πλήρης απασχόληση</div>' +
      '<div class="salary"></div><span class="datemob">16/11/2026</span>' +
    '</div>',
    extractJobsFromPage
  );

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].company, "");
  assert.equal(jobs[0].location, "ΠΑΤΡΑ ΚΕΝΤΡΟ | ΠΑΤΡΑ");
  assert.equal(jobs[0].employmentType, "Πλήρης απασχόληση");
  assert.equal(jobs[0].sourceCategory, "Logistics - Αποθήκη - Μεταφορές");
  assert.equal(jobs[0].url, "https://www.jobfind.gr/JobAd/View/GR/Theseis_Ergasias/abc/");
});

test("Kariera extracts employer, category, location, employment, experience and date from cards", async () => {
  const jobs = await withPage(
    '<div data-slot="card" class="group/job-card">' +
      '<a aria-label="Προβολή σελίδας της εταιρείας Example SA"><span class="text-sm font-medium font-accent">Example SA</span></a>' +
      '<a class="job-title-link" href="/jobs/sales-jobs/123"><h3>Sales Advisor</h3></a>' +
      '<div><svg data-testid="icon-MapPin"></svg><span>Πάτρα</span></div>' +
      '<div><svg data-testid="icon-Tag"></svg><span>Λιανεμπόριο</span></div>' +
      '<div><svg data-testid="icon-Briefcase"></svg><span>Πλήρης απασχόληση</span></div>' +
      '<div><svg data-testid="icon-LayersIcon"></svg><span>Entry / Αρχάριος</span></div>' +
      '<time datetime="2026-11-14T14:00:10.792Z"></time>' +
    '</div>',
    extractCardJobs
  );

  assert.equal(jobs.length, 1);
  assert.deepEqual(
    {
      title: jobs[0].title,
      company: jobs[0].company,
      location: jobs[0].location,
      sourceCategory: jobs[0].sourceCategory,
      employmentType: jobs[0].employmentType,
      experienceLevel: jobs[0].experienceLevel,
      date: jobs[0].date,
      url: jobs[0].url,
    },
    {
      title: "Sales Advisor",
      company: "Example SA",
      location: "Πάτρα",
      sourceCategory: "Λιανεμπόριο",
      employmentType: "Πλήρης απασχόληση",
      experienceLevel: "Entry / Αρχάριος",
      date: "2026-11-14T14:00:10.792Z",
      url: "https://www.kariera.gr/jobs/sales-jobs/123",
    }
  );
});
