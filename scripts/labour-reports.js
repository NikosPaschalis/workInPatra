import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { calculateReport, DURATIONS, MONTH, METHODOLOGY_VERSION, selectPeriod, validateSnapshot } from "./labour-report-metrics.js";
import { archiveSummary, ORIGIN, renderArchive, renderEdition, TEMPLATE_VERSION } from "./labour-report-template.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifestVersion = 1;
const isoDay = /^\d{4}-\d{2}-\d{2}$/;
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const readText = file => readFileSync(file, "utf8").replaceAll("\r\n", "\n");
const dateIsValid = date => {
  if (!isoDay.test(date)) return false;
  const time = new Date(date);
  return Number.isFinite(time.getTime()) && time.toISOString().slice(0, 10) === date;
};
const json = value => JSON.stringify(value, null, 2) + "\n";
const readJson = file => JSON.parse(readFileSync(file, "utf8"));
const editionUrl = (end, duration, revision) => `/reports/${end}/${duration}m/${revision === 1 ? "" : `r${revision}/`}`;

function readSnapshots(dataDir) {
  const dir = path.join(dataDir, "snapshots");
  const manifest = readJson(path.join(dir, "index.json"));
  const files = readdirSync(dir).filter(file => /^\d{4}-\d{2}\.json$/.test(file)).sort();
  if (manifest.snapshotType !== "active_inventory" || !Array.isArray(manifest.snapshots) ||
      JSON.stringify(manifest.snapshots.map(entry => entry.file)) !== JSON.stringify(files)) {
    throw new Error("Snapshot manifest must list every inventory file once, in chronological order");
  }
  return manifest.snapshots.map(entry => {
    const contents = readText(path.join(dir, entry.file));
    const snapshot = JSON.parse(contents);
    const month = entry.file.slice(0, 7);
    validateSnapshot(snapshot, month);
    if (entry.month !== month || entry.total !== snapshot.total || entry.capturedAt !== snapshot.capturedAt ||
        (entry.lastFetched ?? null) !== (snapshot.lastFetched ?? null)) throw new Error(`Manifest mismatch for ${month}`);
    return { ...snapshot, provenance: { month, file: `data/snapshots/${entry.file}`, sha256: sha256(contents) } };
  });
}

function readArchive(file, outputDir) {
  if (!existsSync(file)) return [];
  const manifest = readJson(file);
  if (manifest.schemaVersion !== manifestVersion || !Array.isArray(manifest.entries)) throw new Error("Unsupported archive manifest");
  const seen = new Set();
  for (const entry of manifest.entries) {
    const { end, start, duration, revisions } = entry;
    const key = editionUrl(end, duration, 1);
    if (!MONTH.test(end) || !DURATIONS.includes(duration) || start !== selectPeriod([], end, duration).start ||
        !Array.isArray(revisions) || !revisions.length || seen.has(key)) throw new Error("Invalid archive entry");
    seen.add(key);
    for (const [index, revision] of revisions.entries()) {
      if (revision.revision !== index + 1 || revision.url !== editionUrl(end, duration, index + 1)) throw new Error("Invalid archive revision");
      for (const [name, hash] of [["index.html", revision.htmlSha256], ["report.json", revision.dataSha256]]) {
        const archived = path.join(outputDir, revision.url.slice(1), name);
        if (!existsSync(archived) || sha256(readText(archived)) !== hash) {
          throw new Error(`Archived file is missing or changed: ${revision.url}${name}. Restore it from Git before continuing.`);
        }
      }
    }
  }
  return manifest.entries;
}

function sitemapFor(original, entries, archiveDate) {
  const managed = /  <!-- labour-reports:start -->[\s\S]*?  <!-- labour-reports:end -->\r?\n/;
  if (!/<\/urlset>\s*$/.test(original)) throw new Error("Invalid sitemap");
  const block = ["  <!-- labour-reports:start -->", ...entries.map(entry => {
    const latest = entry.revisions.at(-1);
    return `  <url><loc>${ORIGIN}${latest.url}</loc><lastmod>${latest.correction?.date ?? latest.publishedAt}</lastmod></url>`;
  }), "  <!-- labour-reports:end -->", ""].join("\n");
  return original.replace(managed, "").replace(/<url>\s*<loc>https:\/\/www\.workinpatras\.gr\/report\.html<\/loc>[\s\S]*?<\/url>/, match => archiveDate ? ` <url>\n    <loc>${ORIGIN}/report.html</loc>\n    <lastmod>${archiveDate}</lastmod>\n  </url>`.trimStart() : match).replace(/<\/urlset>\s*$/, block + "</urlset>\n");
}

function writeChanged(file, value) {
  if (existsSync(file) && readText(file) === value) return false;
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + ".tmp";
  writeFileSync(temporary, value);
  renameSync(temporary, file);
  return true;
}

export function generateReports({ dataDir = path.join(root, "data"), outputDir = root, publicationDate, correction } = {}) {
  const snapshots = readSnapshots(dataDir);
  const archiveFile = path.join(outputDir, "reports", "index.json");
  const sitemapFile = path.join(outputDir, "sitemap.xml");
  const archive = readArchive(archiveFile, outputDir);
  const byUrl = new Map(archive.map(entry => [editionUrl(entry.end, entry.duration, 1), entry]));
  const planned = [];
  const latestMonth = snapshots.at(-1)?.month;
  const correctionKey = correction && editionUrl(correction.end, correction.duration, 1);
  if (correction && (!byUrl.has(correctionKey) || !dateIsValid(correction.date) || !correction.reason?.trim())) {
    throw new Error("Correction requires an existing edition, a valid ISO date, and a reason");
  }
  let correctionFound = false;

  for (const { month } of snapshots) {
    for (const duration of DURATIONS) {
      const period = selectPeriod(snapshots, month, duration);
      if (period.missing.length) continue;
      const key = editionUrl(month, duration, 1);
      const entry = byUrl.get(key) ?? { start: period.start, end: month, duration, revisions: [] };
      const existing = entry.revisions.at(-1);
      const provenance = period.snapshots.map(snapshot => snapshot.provenance);
      const inputSha256 = sha256(json(provenance));
      const isCorrection = key === correctionKey;
      if (isCorrection) correctionFound = true;
      if (existing && !isCorrection) {
        if (!correction && existing.inputSha256 !== inputSha256) throw new Error(`Inputs changed for ${key}. Publish an explicit correction.`);
        continue;
      }
      if (correction && !isCorrection) continue;
      const publishedAt = existing?.publishedAt ?? publicationDate;
      const revision = entry.revisions.length + 1;
      const url = editionUrl(month, duration, revision);
      if (!dateIsValid(publishedAt) || publishedAt < period.snapshots.at(-1).capturedAt.slice(0, 10) && !isCorrection) {
        throw new Error("New editions require a publication date on or after the final capture");
      }
      const reason = correction?.reason.trim();
      if (isCorrection && existing.inputSha256 === inputSha256 && existing.correction?.date === correction.date &&
          existing.correction.reason === reason && existing.templateVersion === TEMPLATE_VERSION &&
          existing.methodologyVersion === METHODOLOGY_VERSION) continue;
      if (isCorrection && (correction.date < (existing.correction?.date ?? publishedAt) ||
          correction.date < period.snapshots.at(-1).capturedAt.slice(0, 10))) throw new Error("Correction date precedes its evidence or previous edition");

      const edition = { revision, url, publishedAt, templateVersion: TEMPLATE_VERSION, methodologyVersion: METHODOLOGY_VERSION,
        ...(isCorrection ? { correction: { date: correction.date, reason, previousUrl: existing.url } } : {}),
      };
      const report = { ...calculateReport(period), edition, provenance };
      const html = renderEdition(report);
      const data = json(report);
      for (const [name, value] of [["index.html", html], ["report.json", data]]) {
        const file = path.join(outputDir, url.slice(1), name);
        if (existsSync(file) && readText(file) !== value) throw new Error(`Refusing to overwrite ${file}`);
        planned.push([file, value]);
      }
      entry.revisions.push({ ...edition, inputSha256, htmlSha256: sha256(html), dataSha256: sha256(data),
        inventory: report.inventory.latest, summary: archiveSummary(report) });
      byUrl.set(key, entry);
    }
  }
  if (correction && !correctionFound) throw new Error("Correction requires complete consecutive snapshot coverage");
  const entries = [...byUrl.values()].sort((a, b) => (a.end < b.end ? 1 : a.end > b.end ? -1 : a.duration - b.duration));
  const windows = DURATIONS.map(duration => {
    if (!latestMonth) return { duration, start: null, end: null, available: 0, missing: [], latest: null };
    const period = selectPeriod(snapshots, latestMonth, duration);
    return { duration, start: period.start, end: latestMonth, available: period.snapshots.length, missing: period.missing,
      latest: period.missing.length ? null : byUrl.get(editionUrl(latestMonth, duration, 1))?.revisions.at(-1) ?? null };
  });
  const sitemap = readText(existsSync(sitemapFile) ? sitemapFile : path.join(root, "sitemap.xml"));
  const archivePath = path.join(outputDir, "report.html");
  const archiveHtml = renderArchive(windows, entries);
  const archiveChanged = !existsSync(archivePath) || readText(archivePath) !== archiveHtml;
  const archiveDate = archiveChanged ? (correction?.date ?? publicationDate) : undefined;
  if (archiveDate !== undefined && !dateIsValid(archiveDate)) throw new Error("Invalid archive modification date");
  planned.push(
    [archivePath, archiveHtml],
    [sitemapFile, sitemapFor(sitemap, entries, archiveDate)],
    [archiveFile, json({ schemaVersion: manifestVersion, windows, entries })],
  );
  const changed = planned.filter(([file, value]) => writeChanged(file, value)).map(([file]) => path.relative(outputDir, file));
  return { windows, entries, changed };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: {
      data: { type: "string" }, output: { type: "string" }, "publication-date": { type: "string" },
      "correct-end": { type: "string" }, "correct-duration": { type: "string" },
      "correct-date": { type: "string" }, "correct-reason": { type: "string" },
    } });
    const correction = Object.keys(values).some(option => option.startsWith("correct-"))
      ? { end: values["correct-end"], duration: Number(values["correct-duration"]), date: values["correct-date"], reason: values["correct-reason"] }
      : undefined;
    const result = generateReports({ dataDir: values.data, outputDir: values.output, publicationDate: values["publication-date"], correction });
    console.log(`${result.entries.length} report editions, ${result.changed.length} changed files`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
