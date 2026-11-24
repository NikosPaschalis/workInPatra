export function normalizeSearchText(value = "") {
  return String(value)
    .toLocaleLowerCase("el-GR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ς/g, "σ");
}

export function getCalendarCutoff(days, now = new Date()) {
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  cutoff.setDate(cutoff.getDate() - Math.max(0, days - 1));
  return cutoff;
}

export function compareJobsByDateNewestFirst(a, b) {
  const aTime = Date.parse(jobAgeBasis(a)?.date || "");
  const bTime = Date.parse(jobAgeBasis(b)?.date || "");
  const aValid = Number.isFinite(aTime);
  const bValid = Number.isFinite(bTime);

  if (aValid && bValid) return bTime - aTime;
  if (aValid) return -1;
  if (bValid) return 1;
  return 0;
}

// A single Patras calendar-day policy for the frontend, notifications and snapshots.
// Today counts as day 1; the 30-day window includes today plus the previous 29 days.
const athensCalendar = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit",
});
function calendarDay(value) {
  const t = value instanceof Date ? value.getTime() : Date.parse(value || "");
  if (!Number.isFinite(t)) return NaN;
  const parts = Object.fromEntries(athensCalendar.formatToParts(new Date(t)).map(p => [p.type,p.value]));
  return Date.UTC(Number(parts.year), Number(parts.month)-1, Number(parts.day))/86400000;
}
export function athensCalendarAge(value, now = new Date()) { return calendarDay(now) - calendarDay(value); }
export const MAX_VISIBLE_DAYS = 30;
export function jobAgeBasis(job, now = new Date()) {
  const end = now.getTime();
  const published = Date.parse(job?.date || "");
  if (Number.isFinite(published)) return published <= end ? { date: new Date(published).toISOString(), kind: "published" } : null;
  const firstSeen = Date.parse(job?.firstSeenAt || "");
  if (Number.isFinite(firstSeen) && firstSeen <= end) return { date: new Date(firstSeen).toISOString(), kind: "first_seen" };
  return null;
}
export function isJobWithinAgeWindow(job, days = MAX_VISIBLE_DAYS, now = new Date()) {
  const basis = jobAgeBasis(job, now);
  if (!basis) return false;
  const age = athensCalendarAge(basis.date, now);
  return age >= 0 && age < Math.min(MAX_VISIBLE_DAYS, Math.max(0, days));
}
export function summarizeJobAge(jobs, now = new Date()) {
  const counts = { total: jobs.length, visible30: 0, published30: 0, firstSeen30: 0, older: 0, unknown: 0 };
  for (const job of jobs) {
    const basis = jobAgeBasis(job, now);
    if (!basis) counts.unknown++;
    else if (!isJobWithinAgeWindow(job, MAX_VISIBLE_DAYS, now)) counts.older++;
    else {
      counts.visible30++;
      if (basis.kind === "published") counts.published30++;
      else counts.firstSeen30++;
    }
  }
  return counts;
}
