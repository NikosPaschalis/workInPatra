// scripts/snapshot.js
// Runs on the 1st of each month via GitHub Actions.
// Reads the current data/jobs.json and writes an aggregated
// snapshot for the PREVIOUS month to data/snapshots/YYYY-MM.json.
// No user data — only job listing statistics.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const SNAPSHOT_DIR = path.join(DATA_DIR, 'snapshots');
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');

// Label = previous month (script runs on 1st of current month)
function getPreviousMonthLabel() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return d.toISOString().slice(0, 7); // "2026-06"
}

function countBy(jobs, key) {
  return jobs.reduce((acc, job) => {
    const val = job[key] || 'unknown';
    acc[val] = (acc[val] || 0) + 1;
    return acc;
  }, {});
}

(async () => {
  if (!existsSync(JOBS_FILE)) {
    console.error('❌ data/jobs.json not found — run scrapers first');
    process.exit(1);
  }

  const { jobs, lastFetched } = JSON.parse(readFileSync(JOBS_FILE, 'utf8'));
  const label = getPreviousMonthLabel();
  const outputFile = path.join(SNAPSHOT_DIR, `${label}.json`);

  if (existsSync(outputFile)) {
    console.log(`⏭  Snapshot for ${label} already exists — skipping`);
    process.exit(0);
  }

  const snapshot = {
    month: label,
    capturedAt: new Date().toISOString(),
    lastFetched,
    total: jobs.length,
    byCategory: countBy(jobs, 'category'),
    bySource: countBy(jobs, 'source'),
  };

  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  writeFileSync(outputFile, JSON.stringify(snapshot, null, 2));

  console.log(`✅ Snapshot saved → data/snapshots/${label}.json`);
  console.log(`   Total jobs : ${snapshot.total}`);
  console.log(
    `   Categories : ${JSON.stringify(snapshot.byCategory, null, 4)}`,
  );
  console.log(`   Sources    : ${JSON.stringify(snapshot.bySource, null, 4)}`);
})();
