// scripts/snapshot.js
// Runs on the 1st of each month. The snapshot is an inventory of the
// currently retained listings at capture time, not a count of all jobs
// first published during the previous calendar month.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { CATEGORY_DEFINITIONS } from '../categories.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const SNAPSHOT_DIR = path.join(DATA_DIR, 'snapshots');
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');
const MANIFEST_FILE = path.join(SNAPSHOT_DIR, 'index.json');
const CATEGORY_IDS = CATEGORY_DEFINITIONS.map(({ id }) => id);
const SOURCE_IDS = ['jobfind', 'kariera', 'xe'];
const CATEGORY_ALIASES = { retail: 'sales' };

function getPreviousMonthLabel(now = new Date()) {
  // Use local calendar fields directly; converting local midnight to ISO
  // can move the date into the previous UTC month in non-UTC environments.
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 12 : now.getMonth();
  return `${year}-${String(month).padStart(2, '0')}`;
}

function countBy(jobs, key, knownIds = []) {
  const counts = Object.fromEntries(knownIds.map(id => [id, 0]));
  for (const job of jobs) {
    const raw = job?.[key];
    const value = raw ? String(raw) : 'unknown';
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function normalizeCategory(category) {
  const normalized = CATEGORY_ALIASES[category] || category;
  return CATEGORY_IDS.includes(normalized) ? normalized : 'other';
}

function buildManifest() {
  const files = readdirSync(SNAPSHOT_DIR)
    .filter(name => /^\d{4}-\d{2}\.json$/.test(name))
    .sort();

  const snapshots = files.map(file => {
    const snapshot = JSON.parse(readFileSync(path.join(SNAPSHOT_DIR, file), 'utf8'));
    return {
      month: snapshot.month || file.slice(0, 7),
      file,
      capturedAt: snapshot.capturedAt || null,
      lastFetched: snapshot.lastFetched || null,
      total: Number(snapshot.total) || 0,
    };
  });

  const manifest = {
    generatedAt: new Date().toISOString(),
    snapshotType: 'active_inventory',
    measurementNote: 'Counts describe active listings present in jobs.json at capture time; they are not a count of all jobs newly posted during the calendar month.',
    snapshots,
  };
  writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2) + '\n');
  return snapshots;
}

function validateSnapshot(snapshot) {
  const categoryTotal = Object.values(snapshot.byCategory).reduce((sum, value) => sum + value, 0);
  const sourceTotal = Object.values(snapshot.bySource).reduce((sum, value) => sum + value, 0);
  if (categoryTotal !== snapshot.total || sourceTotal !== snapshot.total) {
    throw new Error(`Snapshot totals do not reconcile (total=${snapshot.total}, categories=${categoryTotal}, sources=${sourceTotal})`);
  }
}

(async () => {
  if (!existsSync(JOBS_FILE)) {
    console.error('❌ data/jobs.json not found — run scrapers first');
    process.exit(1);
  }

  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const { jobs, lastFetched } = JSON.parse(readFileSync(JOBS_FILE, 'utf8'));
  if (!Array.isArray(jobs)) {
    console.error('❌ data/jobs.json does not contain a jobs array');
    process.exit(1);
  }

  const label = getPreviousMonthLabel();
  const outputFile = path.join(SNAPSHOT_DIR, `${label}.json`);

  if (existsSync(outputFile)) {
    console.log(`⏭ Snapshot for ${label} already exists — keeping the historical record`);
  } else {
    const byCategory = Object.fromEntries(CATEGORY_IDS.map(id => [id, 0]));
    const bySource = Object.fromEntries(SOURCE_IDS.map(id => [id, 0]));
    bySource.unknown = 0;

    for (const job of jobs) {
      const category = normalizeCategory(job?.category);
      byCategory[category] += 1;
      const source = SOURCE_IDS.includes(job?.source) ? job.source : 'unknown';
      bySource[source] += 1;
      if (job?.category && category !== job.category && !CATEGORY_ALIASES[job.category]) {
        console.warn(`⚠️ Unknown category "${job.category}" mapped to "other"`);
      }
    }

    const snapshot = {
      month: label,
      capturedAt: new Date().toISOString(),
      lastFetched: lastFetched || null,
      snapshotType: 'active_inventory',
      measurementNote: 'Active listings present in jobs.json at capture time; not a count of all jobs newly posted during the calendar month.',
      total: jobs.length,
      byCategory,
      bySource,
    };

    validateSnapshot(snapshot);
    writeFileSync(outputFile, JSON.stringify(snapshot, null, 2) + '\n');
    console.log(`✅ Snapshot saved → data/snapshots/${label}.json`);
    console.log(`   Total jobs: ${snapshot.total}`);
  }

  const snapshots = buildManifest();
  console.log(`✅ Snapshot manifest updated (${snapshots.length} months)`);
})().catch(error => {
  console.error('❌ Snapshot generation failed:', error);
  process.exitCode = 1;
});
