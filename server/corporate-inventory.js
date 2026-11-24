import { canonicalizeJobUrl, titleCompanyIdentity, normalizeText } from "../scripts/job-identity.js";
import { isJobWithinAgeWindow } from "../client-utils.js";
// The complete source inventory is independent of public cross-source deduplication.
export function previousCorporateInventory(data){
 const jobs=Array.isArray(data?.corporateInventory)?data.corporateInventory:data?.jobs||[];
 return jobs.filter(j=>j.source==="corporate"&&!j.previewOnly);
}
export function mergeCorporateListings(boardJobs, corporateJobs, now=new Date()){
 const result=[],named=new Map(),corporateKeys=new Set(),boardUrls=new Map();
 for(const j of boardJobs){
  const key=titleCompanyIdentity(j), url=canonicalizeJobUrl(j.url);
  if(url&&boardUrls.has(url))continue;
  // Same title alone is never identity. Named cross-board duplicates remain a public heuristic.
  if(key&&named.has(key)&&result[named.get(key)].source!==j.source)continue;
  if(key&&!named.has(key))named.set(key,result.length);
  if(url)boardUrls.set(url,result.length);
  result.push(j);
 }
 for(const j of corporateJobs){
  if(j.previewOnly)continue;
  const url=canonicalizeJobUrl(j.url), key=j.externalId?j.sourceKey+":"+j.externalId:url;
  if(!key||corporateKeys.has(key))continue;
  corporateKeys.add(key);
  const titleKey=titleCompanyIdentity(j);
  const index=boardUrls.get(url)??named.get(titleKey);
  if(index!==undefined){
   // A stale board copy must not hide a still-recent verified company posting.
   if(j.corporateStatus==="verified"&&isJobWithinAgeWindow(j,30,now)&&!isJobWithinAgeWindow(result[index],30,now))result[index]=j;
   continue;
  }
  result.push(j);
 }
 return result;
}
