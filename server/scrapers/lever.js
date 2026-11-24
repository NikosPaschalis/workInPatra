import { normalizeText } from "../../scripts/job-identity.js";
import { categorizeCorporateRole } from "../corporate-categories.js";

// Public Lever Postings API: https://github.com/lever/postings-api
// Only published titles, location and official links; no descriptions or candidate data.
export function normalizeLeverPosting(post, company, now = new Date()) {
  if (!post || typeof post.id !== "string" || !/^[a-f0-9-]{36}$/i.test(post.id) ||
      typeof post.text !== "string" || !post.text.trim() || typeof post.categories?.location !== "string") throw new Error("Invalid Lever posting");
  const locations = [post.categories.location, ...(Array.isArray(post.categories.allLocations) ? post.categories.allLocations : [])];
  const city = locations.find(loc => ["patras","patra","πατρα","patras, greece","patra, greece"].includes(normalizeText(loc)));
  if (!city || (post.country && normalizeText(post.country) !== "gr")) return null;
  // A country-less posting named Patras is accepted only for the employer's confirmed Greek location.
  if (!post.country && company.verifiedGreekPatras !== true) return null;
  const url = new URL(post.hostedUrl);
  if (url.protocol !== "https:" || url.hostname !== (company.region === "eu" ? "jobs.eu.lever.co" : "jobs.lever.co") ||
      url.pathname.replace(/\/$/,"") !== "/" + company.identifier + "/" + post.id) throw new Error("Invalid Lever hostedUrl");
  const role = categorizeCorporateRole(post.text,post.categories.team || "");
  return {source:"corporate",sourceKey:"corporate:"+company.id,companyId:company.id,company:company.name,
    externalId:post.id,title:post.text.trim(),location:"Patras, Greece",url:url.href,date:null,dateRaw:"",
    dateProvenance:"unavailable",sourceCategory:post.categories.team || "",...role,
    tags:[role.subcategoryLabel,post.categories.commitment].filter(Boolean),employmentType:post.categories.commitment || "",
    lastVerifiedAt:now.toISOString(),corporateStatus:"verified"};
}
export async function fetchLeverCompany(company,{fetchImpl=globalThis.fetch,now=new Date(),delay=ms=>new Promise(r=>setTimeout(r,ms))}={}){
  const host=company.region==="eu"?"api.eu.lever.co":"api.lever.co";
  const limit=100, seen=new Set(), jobs=[];
  for(let page=0;page<5;page++){
    if(page) await delay(1100);
    const url=new URL("https://"+host+"/v0/postings/"+company.identifier);
    url.search=new URLSearchParams({mode:"json",location:"Patras",skip:String(page*limit),limit:String(limit)}).toString();
    const res=await fetchImpl(url,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(10000)});
    if(!res.ok) throw new Error("Lever HTTP "+res.status);
    const list=await res.json();
    if(!Array.isArray(list)||list.length>limit)throw new Error("Invalid Lever list");
    for(const post of list){
      const job=normalizeLeverPosting(post,company,now);
      if(seen.has(post.id))throw new Error("Duplicate Lever posting across pages");
      seen.add(post.id);
      if(job) jobs.push(job);
    }
    if(list.length<limit)return jobs;
  }
  throw new Error("Lever pagination cap exceeded");
}
