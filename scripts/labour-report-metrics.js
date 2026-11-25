import { CATEGORY_DEFINITIONS } from "../categories.js";

export const DURATIONS = [3, 6, 12];
export const METHODOLOGY_VERSION = 1;
export const SCHEMA_VERSION = 1;
export const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
export const MIN_CATEGORY_COUNT = 5;
const categoryIds = new Set(CATEGORY_DEFINITIONS.map(category => category.id));
const hour = 3_600_000;
const unverifiedScopes = new Set(["legacy_unverified", "listing_page_unverified"]);
const athensMonth = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit",
});
const englishOrder = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const timestamp = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const count = value => Number.isSafeInteger(value) && value >= 0;
const sum = counts => Object.values(counts).reduce((total, n) => total + n, 0);
const countMap = value => value && typeof value === "object" && !Array.isArray(value) && Object.values(value).every(count);

export function monthOffset(month, offset) {
  if (!MONTH.test(month)) throw new Error(`Invalid month: ${month}`);
  const [year, number] = month.split("-").map(Number);
  const index = year * 12 + number - 1 + offset;
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String((index % 12 + 12) % 12 + 1).padStart(2, "0")}`;
}

export function validateSnapshot(snapshot, month) {
  if (!MONTH.test(month) || snapshot?.month !== month || snapshot.snapshotType !== "active_inventory") {
    throw new Error(`Invalid inventory snapshot for ${month}`);
  }
  const captureDay = timestamp(snapshot.capturedAt) ? athensMonth.format(new Date(snapshot.capturedAt)) : "";
  if (captureDay.slice(0, 7) !== monthOffset(month, 1) || Number(captureDay.slice(8)) > 3 ||
      snapshot.lastFetched != null && (!timestamp(snapshot.lastFetched) || Date.parse(snapshot.lastFetched) > Date.parse(snapshot.capturedAt))) {
    throw new Error(`Invalid inventory capture or freshness date for ${month}`);
  }
  if (!count(snapshot.total) || ![snapshot.byCategory, snapshot.bySource].every(group => countMap(group) && sum(group) === snapshot.total)) {
    throw new Error(`Inventory totals do not reconcile for ${month}`);
  }
}

export function selectPeriod(snapshots, end, duration) {
  if (!DURATIONS.includes(duration)) throw new Error(`Unsupported duration: ${duration}`);
  const months = Array.from({ length: duration }, (_, i) => monthOffset(end, i + 1 - duration));
  const byMonth = new Map(snapshots.map(snapshot => [snapshot.month, snapshot]));
  const missing = months.filter(month => !byMonth.has(month));
  return { start: months[0], end, duration, missing, snapshots: months.flatMap(month => byMonth.has(month) ? [byMonth.get(month)] : []) };
}

const percent = (before, after) => before > 0 ? (after - before) / before * 100 : null;
const share = (value, total) => total > 0 ? value / total * 100 : null;

function snapshotCategories(snapshot) {
  const known = Object.fromEntries([...categoryIds].map(id => [id, snapshot.byCategory[id] ?? null]));
  return { ...known, unknown: sum(Object.fromEntries(Object.entries(snapshot.byCategory).filter(([id]) => !categoryIds.has(id)))) };
}

function sectorMetrics(snapshots) {
  const monthly = snapshots.map(snapshotCategories);
  const firstTotal = snapshots[0].total;
  const lastTotal = snapshots.at(-1).total;
  return [...CATEGORY_DEFINITIONS, { id: "unknown", label: "Άγνωστη κατηγορία" }].map(({ id, label }) => {
    const values = monthly.map(categories => categories[id]);
    const first = values[0];
    const latest = values.at(-1);
    const comparable = values.every(value => value !== null);
    const firstShare = comparable ? share(first, firstTotal) : null;
    const latestShare = latest === null ? null : share(latest, lastTotal);
    return {
      id, label, values, latest, latestShare,
      delta: comparable ? latest - first : null,
      percent: comparable && first >= MIN_CATEGORY_COUNT && latest >= MIN_CATEGORY_COUNT ? percent(first, latest) : null,
      shareChange: firstShare !== null && latestShare !== null ? latestShare - firstShare : null,
    };
  });
}

function captureQuality(snapshot) {
  const quality = snapshot.quality;
  return quality?.schemaVersion === 1 && timestamp(quality.checkedAt) &&
    Date.parse(quality.checkedAt) === Date.parse(snapshot.capturedAt) &&
    quality.bySource && typeof quality.bySource === "object" && !Array.isArray(quality.bySource) &&
    Array.isArray(quality.warnings) ? quality : null;
}

function freshSource(snapshot, key) {
  const quality = captureQuality(snapshot);
  const source = quality?.bySource[key];
  if (!source?.comparable || source.status !== "success" || !timestamp(source.last_success_at) ||
      !count(source.observed_count) || typeof source.scope !== "string" || !source.scope || unverifiedScopes.has(source.scope) ||
      typeof source.method !== "string" || !source.method) return null;
  const age = Date.parse(snapshot.capturedAt) - Date.parse(source.last_success_at);
  const unresolved = quality.warnings.some(warning => warning?.code === "repeated_source_volume" && typeof warning.detail === "string" && warning.detail.startsWith(key + ":"));
  return age >= 0 && age <= 36 * hour && !unresolved ? source : null;
}

function sourceMetrics(snapshots) {
  const keys = [...new Set(snapshots.flatMap(snapshot => [
    ...Object.keys(captureQuality(snapshot)?.bySource ?? {}),
    ...Object.keys(snapshot.bySource).filter(key => snapshot.bySource[key] > 0 && key !== "corporate"),
  ]))].sort(englishOrder);
  const series = keys.flatMap(key => {
    const sources = snapshots.map(snapshot => freshSource(snapshot, key));
    const first = sources[0];
    if (!first || !sources.every(source => source?.scope === first.scope && source?.method === first.method)) return [];
    const values = sources.map(source => source.observed_count);
    return [{ key, company: snapshots.at(-1).corporate?.coverage?.[key]?.company ?? null, values, delta: values.at(-1) - values[0], percent: percent(values[0], values.at(-1)) }];
  });
  return { series, excluded: keys.filter(key => !series.some(source => source.key === key)) };
}

function corporateMetrics(snapshots) {
  const latest = snapshots.at(-1);
  const evidence = snapshots.map(snapshot => {
    const value = snapshot.corporate;
    if (!captureQuality(snapshot) || !countMap(value?.byCompany) || !countMap(value?.bySubcategory) ||
        !value.coverage || !count(value.unverified)) return null;
    const inventory = sum(value.byCompany);
    if (inventory !== sum(value.bySubcategory) || value.unverified > inventory || (snapshot.bySource.corporate ?? 0) > inventory) return null;
    const covered = Object.keys(value.coverage).filter(key => freshSource(snapshot, key)).sort(englishOrder);
    return { inventory, covered };
  });
  const current = evidence.at(-1);
  if (!current || current.inventory < MIN_CATEGORY_COUNT) return null;
  const distribution = group => Object.entries(group).sort(([a, n], [b, m]) => m - n || englishOrder(a, b));
  return {
    inventory: current.inventory, publicInventory: latest.bySource.corporate ?? 0,
    unverified: latest.corporate.unverified,
    byCompany: distribution(latest.corporate.byCompany),
    byCategory: distribution(latest.corporate.bySubcategory),
    coverageCounts: evidence.map(month => month?.covered.length ?? null),
    coverageChanged: evidence.every(Boolean) ? evidence.some(month => month.covered.join("|") !== evidence[0].covered.join("|")) : null,
  };
}

function captureDetails(snapshot) {
  const quality = captureQuality(snapshot);
  const sources = Object.entries(quality?.bySource ?? {});
  return {
    month: snapshot.month, capturedAt: snapshot.capturedAt, lastFetched: snapshot.lastFetched ?? null,
    total: snapshot.total, hasQuality: !!quality,
    freshSources: quality ? sources.filter(([key]) => freshSource(snapshot, key)).length : null,
    otherSources: quality ? sources.filter(([key]) => !freshSource(snapshot, key)).length : null,
    missingDateSources: quality ? sources.filter(([, source]) => source?.missing?.date > 0).length : null,
  };
}

export function generateInsights({ inventory, sectors, coverage, captures }) {
  const findings = [{ type: "inventory", first: inventory.first, latest: inventory.latest, delta: inventory.delta, percent: inventory.percent }];
  const movers = sectors.filter(sector => sector.id !== "unknown" && sector.delta !== null && sector.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || englishOrder(a.id, b.id));
  if (movers.length) findings.push({ type: "sector", label: movers[0].label, delta: movers[0].delta });
  else findings.push({ type: "range", low: inventory.low.total, high: inventory.high.total });
  if (coverage.series.length) findings.push({ type: "coverage", sources: coverage.series.length });
  else findings.push({ type: "limitedCoverage", legacy: captures.filter(capture => !capture.hasQuality).length });
  return findings;
}

export function calculateReport(period) {
  const { snapshots, missing, ...window } = period;
  if (missing.length || snapshots.length !== window.duration) throw new Error("Cannot calculate an incomplete period");
  const captures = snapshots.map(captureDetails);
  const first = captures[0].total;
  const latest = captures.at(-1).total;
  const inventory = {
    first, latest, delta: latest - first, percent: percent(first, latest),
    average: captures.reduce((acc, row) => acc + row.total, 0) / captures.length,
    low: captures.reduce((a, b) => a.total <= b.total ? a : b),
    high: captures.reduce((a, b) => a.total >= b.total ? a : b),
  };
  const sectors = sectorMetrics(snapshots);
  const coverage = sourceMetrics(snapshots);
  const report = {
    schemaVersion: SCHEMA_VERSION, methodologyVersion: METHODOLOGY_VERSION,
    window, inventory, captures, sectors, coverage, corporate: corporateMetrics(snapshots),
    latestBySource: Object.fromEntries(Object.entries(snapshots.at(-1).bySource).sort(([a], [b]) => englishOrder(a, b))),
    lifecycle: { available: false, reason: "no_validated_period_cohort" },
  };
  return { ...report, insights: generateInsights(report) };
}
