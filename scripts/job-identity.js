const TRACKING_PARAMETERS = new Set([
  "fbclid", "gclid", "mc_cid", "mc_eid", "ref", "source",
]);

export function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el")
    .replace(/ς/g, "σ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalizeJobUrl(value = "") {
  try {
    const url = new URL(String(value).trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    url.protocol = "https:";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_") || TRACKING_PARAMETERS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function titleCompanyIdentity(job = {}) {
  const title = normalizeText(job.title);
  const company = normalizeText(job.company);
  return title && company ? `${title}|${company}` : "";
}

export function jobIdentity(job = {}) {
  const url = canonicalizeJobUrl(job.url);
  if (url) return `${normalizeText(job.source) || "unknown"}:${url}`;
  const fallback = titleCompanyIdentity(job);
  return fallback ? `${normalizeText(job.source) || "unknown"}:fallback:${fallback}` : "";
}

export function notificationIdentity(job = {}) {
  const named = titleCompanyIdentity(job);
  if (named) return `named:${named}`;
  const url = canonicalizeJobUrl(job.url);
  return url ? `url:${url}` : "";
}
