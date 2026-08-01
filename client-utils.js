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
  const aTime = Date.parse(a?.date || "");
  const bTime = Date.parse(b?.date || "");
  const aValid = Number.isFinite(aTime);
  const bValid = Number.isFinite(bTime);

  if (aValid && bValid) return bTime - aTime;
  if (aValid) return -1;
  if (bValid) return 1;
  return 0;
}
