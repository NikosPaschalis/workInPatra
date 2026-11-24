import { normalizeText } from "../../scripts/job-identity.js";
import { fetchWorkableCompany } from "./workable.js";
import { fetchLeverCompany } from "./lever.js";
import { categorizeCorporateRole } from "../corporate-categories.js";

// Public Posting API only. New providers must pass the same contract and access review.
export const CORPORATE_COMPANIES = Object.freeze([
  { id: "netcompany", name: "Netcompany", identifier: "netcompany1", careerUrl: "https://netcompany.com/careers/greece/vacancies/" },
  { id: "renesas", name: "Renesas", identifier: "RenesasElectronics", careerUrl: "https://jobs.renesas.com/" },
  { id: "tsmg", name: "TSMG", provider: "lever", identifier: "tsmg", verifiedGreekPatras: true, careerUrl: "https://jobs.lever.co/tsmg/?location=Patras" },
  { id: "motodynamics", name: "Motodynamics", provider: "workable", identifier: "motodynamics", careerUrl: "https://apply.workable.com/motodynamics/" },
  { id: "cosmos-sport", name: "Cosmos Sport", provider: "workable", identifier: "cosmos-sport-s-dot-a", careerUrl: "https://apply.workable.com/cosmos-sport-s-dot-a/" },
  { id: "plaisio", name: "Πλαίσιο", provider: "workable", identifier: "plaisio-careers", careerUrl: "https://apply.workable.com/plaisio-careers/" },
]);
const cities = new Set(["patras", "patra", "patrai", "πατρα", "πατρεσ", "rio", "ριο", "industrial area of patras", "patras industrial area", "βιπε πατρων", "κατω αχαια", "kato achaia", "kato achaia patras"]);
export const corporateSourceKey = id => "corporate:" + id;
export function isLocalPosting(location = {}) {
  return ["gr", "greece", "ελλαδα"].includes(normalizeText(location.country)) &&
    cities.has(normalizeText(location.city));
}

export function normalizePosting(post, company, now = new Date()) {
  if (!post || typeof post !== "object" || typeof post.name !== "string" || !post.name.trim() ||
      !/^[A-Za-z0-9-]+$/.test(String(post.id || "")) || !post.location ||
      typeof post.location.city !== "string" || typeof post.location.country !== "string") {
    throw new Error("Invalid posting schema");
  }
  if (!isLocalPosting(post.location)) return null;
  const dateRaw = typeof post.releasedDate === "string" ? post.releasedDate : "";
  const date = Number.isFinite(Date.parse(dateRaw))
    ? new Date(dateRaw).toISOString() : null;
  const sourceCategory = post.function?.label || post.department?.label || "";
  const role = categorizeCorporateRole(post.name, sourceCategory);
  // Use the official posting URL from the detail endpoint, never synthesize a slug.
  if (post.company?.identifier && String(post.company.identifier).toLowerCase() !== company.identifier.toLowerCase()) throw new Error("Company identifier mismatch");
  const url = new URL(post.postingUrl);
  if (url.protocol !== "https:" || url.hostname !== "jobs.smartrecruiters.com" ||
      url.pathname.split("/")[1]?.toLowerCase() !== company.identifier.toLowerCase() ||
      !url.pathname.split("/")[2]?.startsWith(String(post.id) + "-")) throw new Error("Invalid official posting URL");
  return {
    source: "corporate", sourceKey: corporateSourceKey(company.id), companyId: company.id,
    company: company.name, title: post.name.trim(), externalId: String(post.id),
    location: post.location.city + ", Greece", date, dateRaw,
    dateProvenance: date ? "source_metadata" : "unavailable",
    url: url.href,
    sourceCategory, ...role,
    tags: [role.subcategoryLabel, post.experienceLevel?.label, post.typeOfEmployment?.label].filter(Boolean),
    employmentType: post.typeOfEmployment?.label || "",
    experienceLevel: post.experienceLevel?.label || "",
    lastVerifiedAt: now.toISOString(), corporateStatus: "verified"
  };
}

export async function fetchCompany(company, { fetchImpl = globalThis.fetch, now = new Date() } = {}) {
  if (company.provider === "lever") return fetchLeverCompany(company, { fetchImpl, now });
  if (company.provider === "workable") return fetchWorkableCompany(company, { fetchImpl, now });
  if (company.provider && company.provider !== "smartrecruiters") throw new Error("Unsupported corporate provider");
  const limit = 100, maxPages = 15, seen = new Set(), jobs = [];
  let expectedTotal;
  for (let page = 0; page < maxPages; page++) {
    const url = new URL("https://api.smartrecruiters.com/v1/companies/" + company.identifier + "/postings");
    url.search = new URLSearchParams({ country: "gr", destination: "PUBLIC", limit: String(limit), offset: String(page * limit) }).toString();
    const res = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const body = await res.json();
    if (!Array.isArray(body.content) || !Number.isSafeInteger(body.totalFound) || body.totalFound < 0) {
      throw new Error("Unexpected API response");
    }
    if (body.offset !== undefined && body.offset !== page * limit) throw new Error("Unexpected pagination offset");
    if (expectedTotal === undefined) expectedTotal = body.totalFound;
    console.log(company.id + " API page " + page + ": totalFound=" + body.totalFound + ", rows=" + body.content.length + ", cities=" + JSON.stringify([...new Set(body.content.map(p => p?.location?.city))]));
    if (body.totalFound !== expectedTotal) throw new Error("Posting count changed during pagination");
    if (body.content.length > limit || (body.content.length === 0 && seen.size < expectedTotal)) {
      throw new Error("Incomplete pagination");
    }
    for (const post of body.content) {
      if (!post || !/^[A-Za-z0-9-]+$/.test(String(post.id || "")) || typeof post.name !== "string" || !post.name.trim() || typeof post.location?.city !== "string" || typeof post.location?.country !== "string") throw new Error("Invalid posting schema");
      if (seen.has(String(post.id))) throw new Error("Duplicate ID during pagination");
      seen.add(String(post.id));
      if (!isLocalPosting(post.location)) continue;
      const detailUrl = new URL("https://api.smartrecruiters.com/v1/companies/" + company.identifier + "/postings/" + post.id);
      const detailRes = await fetchImpl(detailUrl, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
      if (!detailRes.ok) throw new Error("Posting detail HTTP " + detailRes.status);
      const detail = await detailRes.json();
      if (String(detail.id) !== String(post.id) || detail.active === false) throw new Error("Posting detail mismatch or inactive");
      const job = normalizePosting({ ...post, ...detail }, company, now);
      if (!job) throw new Error("Posting location changed during collection");
      jobs.push(job);
    }
    if (seen.size === expectedTotal) return jobs;
    if (seen.size > expectedTotal || body.content.length !== limit) throw new Error("Incomplete pagination");
  }
  throw new Error("Pagination limit exceeded");
}

export async function collectCorporate(previousJobs, { enabled = false, companies = CORPORATE_COMPANIES, fetchImpl = globalThis.fetch, now = new Date() } = {}) {
  const previous = previousJobs.filter(j => j.source === "corporate");
  const jobs = [], sourceStats = {};
  for (const company of companies) {
    const key = corporateSourceKey(company.id);
    const old = previous.filter(j => j.sourceKey === key);
    if (!(typeof enabled === "function" ? enabled(company) : enabled)) {
      jobs.push(...old.map(j => ({ ...j, corporateStatus: "unverified" })));
      sourceStats[key] = { status: "skipped", company: company.name, scraped_count: 0, retained_count: old.length };
      continue;
    }
    try {
      const fresh = await fetchCompany(company, { fetchImpl, now });
      jobs.push(...fresh);
      sourceStats[key] = { status: "success", company: company.name, scraped_count: fresh.length, retained_count: fresh.length, checked_at: now.toISOString() };
    } catch (error) {
      jobs.push(...old.map(j => ({ ...j, corporateStatus: "unverified" })));
      sourceStats[key] = { status: old.length ? "fallback" : "failed", company: company.name, scraped_count: 0, fallback_count: old.length, retained_count: old.length, error: String(error.message || error), checked_at: now.toISOString() };
    }
    console.log(key, JSON.stringify(sourceStats[key]));
  }
  // Removing an adapter must not silently delete its inventory.
  for (const job of previous) if (!Object.hasOwn(sourceStats, job.sourceKey)) jobs.push({ ...job, corporateStatus: "unverified" });
  return { jobs, sourceStats };
}
