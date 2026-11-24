// scripts/snapshot.js
// Runs on the 1st of each month. The snapshot is an inventory of the
// currently retained listings at capture time, not a count of all jobs
// first published during the previous calendar month.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { corporateStatistics } from '../server/corporate-statistics.js';
import { summarizeJobAge } from '../client-utils.js';
import { CATEGORY_DEFINITIONS } from '../categories.js';
import { auditFiles, compareCoverage } from './data-quality.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = path.join(__dirname, '..', 'data');
const CATEGORY_IDS = CATEGORY_DEFINITIONS.map(({ id }) => id);
const SOURCE_IDS = ['jobfind', 'kariera', 'xe', 'corporate'];
const CATEGORY_ALIASES = { retail: 'sales' };

function getPreviousMonthLabel(now = new Date()) {
  // Use local calendar fields directly; converting local midnight to ISO
  // can move the date into the previous UTC month in non-UTC environments.
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));
  const currentMonth=Number(parts.month),currentYear=Number(parts.year);
  const year = currentMonth === 1 ? currentYear - 1 : currentYear;
  const month = currentMonth === 1 ? 12 : currentMonth - 1;
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

function buildManifest(SNAPSHOT_DIR, now) {
  const MANIFEST_FILE=path.join(SNAPSHOT_DIR,'index.json');
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
    generatedAt: now.toISOString(),
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

export function generateSnapshot({dataDir=DEFAULT_DATA_DIR,now=new Date()}={}) {
  const DATA_DIR=path.resolve(dataDir), SNAPSHOT_DIR=path.join(DATA_DIR,'snapshots'), JOBS_FILE=path.join(DATA_DIR,'jobs.json');
  if (!existsSync(JOBS_FILE)) throw Error('data/jobs.json not found — run scrapers first');

  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const data = JSON.parse(readFileSync(JOBS_FILE, 'utf8'));
  const { jobs, lastFetched } = data;
  if (!Array.isArray(jobs)) {
    throw Error('data/jobs.json does not contain a jobs array');
  }

  const label = getPreviousMonthLabel(now);
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

    const capturedAt = now;
    const corporate = corporateStatistics(data, capturedAt);
    const quality = auditFiles(DATA_DIR,capturedAt);
    if(quality.errors.length)throw Error('Data quality errors: '+JSON.stringify(quality.errors));
    const snapshot = {
      month: label,
      capturedAt: capturedAt.toISOString(),
      lastFetched: lastFetched || null,
      snapshotType: 'active_inventory',
      measurementNote: 'Active listings present in jobs.json at capture time; not a count of all jobs newly posted during the calendar month.',
      total: jobs.length,
      quality: { schemaVersion: quality.schemaVersion, checkedAt:quality.checkedAt, warnings:quality.warnings, bySource:quality.bySource },
      ageWindow: summarizeJobAge(jobs, capturedAt),
      byCategory,
      bySource,
      ...(corporate ? { corporate } : {}),
    };

    const prevFile = readdirSync(SNAPSHOT_DIR).filter(name=>/^\d{4}-\d{2}\.json$/.test(name)&&name<`${label}.json`).sort().at(-1);
    snapshot.comparableCoverage=compareCoverage(prevFile?JSON.parse(readFileSync(path.join(SNAPSHOT_DIR,prevFile),'utf8')):null,snapshot);
    validateSnapshot(snapshot);
    writeFileSync(outputFile, JSON.stringify(snapshot, null, 2) + '\n');
    console.log(`✅ Snapshot saved → data/snapshots/${label}.json`);
    console.log(`   Total jobs: ${snapshot.total}`);
  }

  const snapshots = buildManifest(SNAPSHOT_DIR,now);
  console.log(`✅ Snapshot manifest updated (${snapshots.length} months)`);
  return JSON.parse(readFileSync(outputFile,'utf8'));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{generateSnapshot({dataDir:process.env.SNAPSHOT_DATA_DIR||DEFAULT_DATA_DIR});}
 catch(error){console.error('❌ Snapshot generation failed:',error);process.exitCode=1;}
}
