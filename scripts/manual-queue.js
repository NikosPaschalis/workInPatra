import { canonicalizeJobUrl, normalizeText, titleCompanyIdentity } from "./job-identity.js";

export const SUPPORTED_MANUAL_SOURCES = Object.freeze(["kariera", "jobfind", "xe"]);
export const CURATED_RETENTION_DAYS = 45;

const SOURCE_RULES = {
  kariera: { hosts: ["kariera.gr"], path: /^\/jobs\/.+\/\d+$/i },
  jobfind: { hosts: ["jobfind.gr"], path: /^\/jobad\/view\//i },
  xe: { hosts: ["xe.gr"], path: /^\/(?:εργασία|%CE%B5%CF%81%CE%B3%CE%B1%CF%83%CE%AF%CE%B1)\/(?:θέση-εργασίας|%CE%B8%CE%AD%CF%83%CE%B7-%CE%B5%CF%81%CE%B3%CE%B1%CF%83%CE%AF%CE%B1%CF%82)\//i },
};

const LOCATION_TERMS = [
  "πατρα", "patra", "patras", "αχαια", "achaia", "ριο", "rio", "βραχνεικα",
  "παραλια πατρων", "κατω αχαια", "οβρυα", "δεμενικα", "ροιτικα", "ακταιο",
];

export function locationRelevance(value = "") {
  const location = normalizeText(value);
  if (!location) return { status: "review", reason: "missing_location" };
  if (LOCATION_TERMS.some((term) => location.includes(normalizeText(term)))) {
    return { status: "eligible", reason: "covered_location" };
  }
  return { status: "review", reason: "unclear_location" };
}

export function validateSourceUrl(source, value) {
  const canonicalUrl = canonicalizeJobUrl(value);
  const rules = SOURCE_RULES[source];
  if (!rules || !canonicalUrl) return { valid: false, canonicalUrl: "", reason: "invalid_url" };
  const url = new URL(canonicalUrl);
  const hostValid = rules.hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  if (!hostValid || !rules.path.test(decodeURI(url.pathname))) {
    return { valid: false, canonicalUrl, reason: hostValid ? "not_individual_listing" : "wrong_source_domain" };
  }
  return { valid: true, canonicalUrl, reason: "valid" };
}

export function normalizePublicationDate(job = {}) {
  const dateRaw = String(job.dateRaw || "").trim();
  const relative = /(?:today|yesterday|ago|πριν|σήμερα|χθες|ώρα|ώρες|ημέρ|εβδομά|μήν)/i.test(dateRaw);
  if (!dateRaw || relative) return { date: null, dateRaw, dateProvenance: dateRaw ? "relative_label" : "unavailable" };

  const explicit = dateRaw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (explicit) {
    const parsed = new Date(Date.UTC(Number(explicit[3]), Number(explicit[2]) - 1, Number(explicit[1])));
    if (parsed.getUTCDate() === Number(explicit[1]) && parsed.getUTCMonth() === Number(explicit[2]) - 1) {
      return { date: parsed.toISOString(), dateRaw, dateProvenance: "source_absolute_label" };
    }
  }

  const parsed = new Date(dateRaw);
  if (!Number.isNaN(parsed.getTime())) {
    return { date: parsed.toISOString(), dateRaw, dateProvenance: "source_metadata" };
  }
  return { date: null, dateRaw, dateProvenance: "unparseable" };
}

export function validateManualJob(job, { requireApproval = true } = {}) {
  const errors = [];
  const warnings = [];
  const source = normalizeText(job?.source);
  if (!SUPPORTED_MANUAL_SOURCES.includes(source)) errors.push("unsupported_source");
  for (const field of ["title", "company", "location", "sourceCategory", "category"]) {
    if (!String(job?.[field] || "").trim()) {
      if (field === "company") warnings.push("missing_company");
      else errors.push(`missing_${field}`);
    }
  }

  const url = validateSourceUrl(source, job?.url);
  if (!url.valid) errors.push(url.reason);
  const location = locationRelevance(job?.location);
  if (location.status !== "eligible") warnings.push(location.reason);
  if (requireApproval && !Number.isFinite(Date.parse(job?.manuallyVerifiedAt || ""))) {
    errors.push("manual_approval_required");
  }
  const publication = normalizePublicationDate(job);
  const blockingWarnings = warnings.filter((warning) =>
    warning !== "missing_company" && !(warning === "unclear_location" && job?.locationVerified === true)
  );
  return {
    valid: errors.length === 0,
    eligible: errors.length === 0 && blockingWarnings.length === 0,
    errors,
    warnings,
    canonicalUrl: url.canonicalUrl,
    locationStatus: location.status,
    publication,
  };
}

export function classifyManualCandidates(candidates, collections = {}) {
  const published = collections.published || [];
  const queued = [...(collections.karieraPending || []), ...(collections.manualPending || [])];
  const history = collections.history || [];
  const publishedUrls = new Set(published.map((job) => canonicalizeJobUrl(job.url)).filter(Boolean));
  const queuedUrls = new Set(queued.map((job) => canonicalizeJobUrl(job.url)).filter(Boolean));
  const historyUrls = new Set(history.map((job) => canonicalizeJobUrl(job.url)).filter(Boolean));
  const knownNames = new Map();
  for (const job of [...published, ...queued, ...history]) {
    const key = titleCompanyIdentity(job);
    if (key) knownNames.set(key, job);
  }
  const seenUrls = new Set();
  const seenNames = new Map();

  return candidates.map((candidate) => {
    const validation = validateManualJob(candidate, { requireApproval: false });
    const canonicalUrl = validation.canonicalUrl;
    const nameKey = titleCompanyIdentity(candidate);
    let status = validation.errors.length ? "invalid" : validation.locationStatus === "review" ? "review" : "new";
    const reasons = [...validation.errors, ...validation.warnings];
    if (publishedUrls.has(canonicalUrl)) status = "published";
    else if (queuedUrls.has(canonicalUrl)) status = "queued";
    else if (seenUrls.has(canonicalUrl)) status = "duplicate";
    else if (historyUrls.has(canonicalUrl)) status = "previously_published";
    else if (nameKey && (knownNames.has(nameKey) || seenNames.has(nameKey))) {
      status = "suspected_duplicate";
      reasons.push("matching_title_company");
    }
    if (canonicalUrl) seenUrls.add(canonicalUrl);
    if (nameKey) seenNames.set(nameKey, candidate);
    return {
      ...candidate,
      ...validation.publication,
      canonicalUrl,
      validationStatus: status,
      validationReasons: [...new Set(reasons)],
      approved: false,
      rejected: false,
      manuallyVerifiedAt: null,
    };
  });
}

export function curatedUntil(manuallyVerifiedAt, days = CURATED_RETENTION_DAYS) {
  const verifiedAt = new Date(manuallyVerifiedAt);
  if (Number.isNaN(verifiedAt.getTime())) return null;
  verifiedAt.setUTCDate(verifiedAt.getUTCDate() + days);
  return verifiedAt.toISOString();
}

export function mergeManualQueue(current, queued, { now = new Date() } = {}) {
  if (!Array.isArray(current) || !Array.isArray(queued)) throw new Error("Expected job arrays");
  const urls = new Set(current.map((job) => canonicalizeJobUrl(job.url)).filter(Boolean));
  const names = new Set(current.map(titleCompanyIdentity).filter(Boolean));
  const accepted = [];
  const rejected = [];
  for (const queuedJob of queued) {
    const validation = validateManualJob(queuedJob);
    if (!validation.valid || !validation.eligible) {
      rejected.push({ job: queuedJob, reason: "invalid_or_unverified", details: [...validation.errors, ...validation.warnings] });
      continue;
    }
    const nameKey = titleCompanyIdentity(queuedJob);
    if (urls.has(validation.canonicalUrl) || (nameKey && names.has(nameKey))) {
      rejected.push({ job: queuedJob, reason: "duplicate" });
      continue;
    }
    const expiry = curatedUntil(queuedJob.manuallyVerifiedAt);
    if (!expiry || new Date(expiry) <= now) {
      rejected.push({ job: queuedJob, reason: "expired_approval" });
      continue;
    }
    const job = {
      ...queuedJob,
      url: validation.canonicalUrl,
      ...validation.publication,
      curated: true,
      curatedUntil: expiry,
    };
    urls.add(validation.canonicalUrl);
    if (nameKey) names.add(nameKey);
    accepted.push(job);
  }
  return { jobs: [...current, ...accepted], accepted, rejected };
}

export function retainCuratedListings(freshJobs, previousJobs, source, now = new Date()) {
  const result = [...freshJobs];
  const urls = new Set(result.map((job) => canonicalizeJobUrl(job.url)).filter(Boolean));
  for (const previous of previousJobs) {
    if (previous.source !== source || previous.curated !== true) continue;
    const expiresAt = Date.parse(previous.curatedUntil || "");
    if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) continue;
    const url = canonicalizeJobUrl(previous.url);
    if (!url || urls.has(url)) continue;
    urls.add(url);
    result.push(previous);
  }
  return result;
}
