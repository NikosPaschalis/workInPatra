import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/n.pashalis/Downloads/https___workinpatras.netlify.app_-Performance-on-Search-2026-08-04.xlsx";
const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const daily = workbook.worksheets.getItem("Γράφημα").getUsedRange(true).values.slice(1)
  .map(([date, clicks, impressions, ctr, position]) => ({ date, clicks, impressions, ctr, position }));
const queries = workbook.worksheets.getItem("Ερωτήματα").getUsedRange(true).values.slice(1)
  .map(([query, clicks, impressions, ctr, position]) => ({ query, clicks, impressions, ctr, position }));

function summarize(rows) {
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  const weightedPosition = impressions
    ? rows.reduce((sum, row) => sum + row.position * row.impressions, 0) / impressions
    : 0;
  return {
    start: rows[0]?.date,
    end: rows.at(-1)?.date,
    days: rows.length,
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position: weightedPosition,
  };
}

function growth(current, previous, key) {
  return previous[key] ? current[key] / previous[key] - 1 : null;
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ς/g, "σ")
    .replace(/\s+/g, " ")
    .trim();
}

function aggregateQueries(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = normalize(row.query);
    const group = grouped.get(key) || { query: key, clicks: 0, impressions: 0, weightedPosition: 0, variants: [] };
    group.clicks += row.clicks;
    group.impressions += row.impressions;
    group.weightedPosition += row.position * row.impressions;
    group.variants.push(row.query);
    grouped.set(key, group);
  }
  return [...grouped.values()].map(group => ({
    query: group.query,
    clicks: group.clicks,
    impressions: group.impressions,
    ctr: group.impressions ? group.clicks / group.impressions : 0,
    position: group.impressions ? group.weightedPosition / group.impressions : 0,
    variants: group.variants,
  }));
}

const last7 = summarize(daily.slice(-7));
const prev7 = summarize(daily.slice(-14, -7));
const last28 = summarize(daily.slice(-28));
const prev28 = summarize(daily.slice(-56, -28));
const first28 = summarize(daily.slice(0, 28));
const all = summarize(daily);
const groupedQueries = aggregateQueries(queries);

const targetGroups = [
  "εργασια πατρα",
  "θεσεισ εργασιασ πατρα",
  "αγγελιεσ εργασιασ πατρα",
  "δουλεια πατρα",
  "δουλειεσ πατρα",
  "ευρεση εργασιασ πατρα",
].map(key => groupedQueries.find(group => group.query === key)).filter(Boolean);

const opportunityQueries = groupedQueries
  .filter(row => row.impressions >= 10 && row.position >= 8 && row.position <= 20 && row.ctr < 0.05)
  .sort((a, b) => b.impressions - a.impressions)
  .slice(0, 20);

const output = {
  periods: {
    all,
    first28,
    prev28,
    last28,
    prev7,
    last7,
    growth: {
      clicks7d: growth(last7, prev7, "clicks"),
      impressions7d: growth(last7, prev7, "impressions"),
      clicks28d: growth(last28, prev28, "clicks"),
      impressions28d: growth(last28, prev28, "impressions"),
    },
  },
  targetGroups,
  opportunityQueries,
  queryTotals: summarize(queries),
};

console.log(JSON.stringify(output, null, 2));
