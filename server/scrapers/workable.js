import { normalizeText } from "../../scripts/job-identity.js";
import { categorizeCorporateRole } from "../corporate-categories.js";
const cities=new Set(["patras","patra","patrai","πατρα","πατρεσ","rio","ριο","kato achaia","κατω αχαια","patras industrial area","industrial area of patras","βιπε πατρων"]);
const countries=new Set(["gr","greece","ελλαδα"]);
export function normalizeWorkablePosting(post,company,now=new Date()){
 if(!post || typeof post.title!=="string" || !post.title.trim() || !/^[A-Z0-9]{6,20}$/i.test(post.shortcode||"") || typeof post.city!=="string" || typeof post.country!=="string")throw new Error("Invalid Workable posting schema");
 if(!countries.has(normalizeText(post.country))||!cities.has(normalizeText(post.city)))return null;
 const url=new URL(post.shortlink);
 const expected=post.shortcode.toUpperCase();
 if(url.protocol!=="https:"||url.hostname!=="apply.workable.com"||!["/j/"+expected,"/"+company.identifier+"/j/"+expected].includes(url.pathname.replace(/\/$/,"").toUpperCase().replace(/^\/J\//,"/j/").replace(/^\/([^/]+)\/J\//,(_,s)=>"/"+s.toLowerCase()+"/j/")))throw new Error("Invalid Workable official shortlink");
 const raw=typeof post.published_on==="string"?post.published_on:"";
 const parsed=Date.parse(raw);
 const date=Number.isFinite(parsed)&&parsed<=now.getTime()?new Date(parsed).toISOString():null;
 const sourceCategory=post.department||post.function||"";
 const role=categorizeCorporateRole(post.title,sourceCategory);
 return {source:"corporate",sourceKey:"corporate:"+company.id,companyId:company.id,company:company.name,externalId:expected,title:post.title.trim(),location:post.city+", Greece",url:url.href,date,dateRaw:raw,dateProvenance:date?"source_metadata":"unavailable",sourceCategory,...role,tags:[role.subcategoryLabel,post.employment_type].filter(Boolean),employmentType:post.employment_type||"",lastVerifiedAt:now.toISOString(),corporateStatus:"verified"};
}
export async function fetchWorkableCompany(company,{fetchImpl=globalThis.fetch,now=new Date()}={}){
 if(!/^[a-z0-9-]+$/.test(company.identifier))throw new Error("Invalid Workable account");
 const url=new URL("https://www.workable.com/api/accounts/"+company.identifier);
 url.searchParams.set("details","false");
 const res=await fetchImpl(url,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw new Error("Workable HTTP "+res.status);
 const data=await res.json();
 if(typeof data.name!=="string"||!data.name.trim()||!Array.isArray(data.jobs)||data.jobs.length>10000)throw new Error("Invalid Workable account response");
 const seen=new Map();
 for(const post of data.jobs){
   const job=normalizeWorkablePosting(post,company,now);
   if(!job)continue;
   const old=seen.get(job.externalId);
   if(old&&(old.title!==job.title||old.url!==job.url||old.date!==job.date))throw new Error("Conflicting Workable shortcode");
   seen.set(job.externalId,old||job);
 }
 return [...seen.values()];
}
