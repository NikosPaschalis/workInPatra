import { summarizeJobAge } from "./client-utils.js";
export const REVIEW_VERSION = "review-v4";
export function isCorporatePreview(hostname) { return hostname === "deploy-preview-18--workinpatras.netlify.app"; }
export async function loadCorporatePreview(hostname, fetchImpl = globalThis.fetch) {
  if (!isCorporatePreview(hostname)) return [];
  const response = await fetchImpl("/data/corporate-review-v4.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Review data HTTP " + response.status);
  const data = await response.json();
  if (data.version !== REVIEW_VERSION || !Array.isArray(data.jobs) || data.jobs.length === 0 ||
      data.jobs.some(j => j.source !== "corporate" || j.previewReal !== true || j.previewOnly !== true ||
        !j.title || !j.company || /^demo/i.test(j.company) || !j.url || new URL(j.url).protocol !== "https:")) throw new Error("Invalid reviewed listing data");
  return data.jobs;
}
export function corporatePreviewStats(jobs, now = new Date()) {
  const byCompany={}, bySubcategory={}, coverage={};
  for (const job of jobs) {
    byCompany[job.company]=(byCompany[job.company]||0)+1;
    bySubcategory[job.subcategoryLabel]=(bySubcategory[job.subcategoryLabel]||0)+1;
    coverage[job.sourceKey]={company:job.company,status:"success",retained_count:byCompany[job.company]};
  }
  return {byCompany,bySubcategory,coverage,unverified:0,ageWindow:summarizeJobAge(jobs,now)};
}
