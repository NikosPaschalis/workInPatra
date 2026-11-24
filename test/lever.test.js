import test from "node:test";
import assert from "node:assert/strict";
import { fetchLeverCompany,normalizeLeverPosting } from "../server/scrapers/lever.js";
import { CORPORATE_COMPANIES,collectCorporate } from "../server/scrapers/corporate.js";
const company=CORPORATE_COMPANIES.find(c=>c.id==="tsmg");
const id="9d2851f1-f4b0-4bab-9d6c-ac1b51e99e0d";
const post={id,text:"Driver / Data Collector",country:"GR",categories:{location:"Patras",allLocations:["Patras"],team:"Field Projects"},hostedUrl:"https://jobs.lever.co/tsmg/"+id,description:"do not copy"};
test("Lever uses official link, retains unknown publication date and no description",()=>{
 const job=normalizeLeverPosting(post,company);
 assert.equal(job.date,null);assert.equal(job.sourceKey,"corporate:tsmg");assert.equal(job.category,"logistics");
 assert.equal(job.url,post.hostedUrl);assert.equal(job.description,undefined);
 assert.equal(normalizeLeverPosting({...post,country:"US"},company),null);
 assert.equal(normalizeLeverPosting({...post,categories:{location:"Athens"}},company),null);
 assert.throws(()=>normalizeLeverPosting({...post,hostedUrl:"https://example.com"},company),/Invalid Lever hostedUrl/);
});
test("Lever selects exact documented location and handles malformed list",async()=>{
 const jobs=await fetchLeverCompany(company,{fetchImpl:async url=>{assert.equal(url.searchParams.get("location"),"Patras");return {ok:true,json:async()=>[post]}}});
 assert.equal(jobs.length,1);
 await assert.rejects(fetchLeverCompany(company,{fetchImpl:async()=>({ok:true,json:async()=>({})})}),/Invalid Lever list/);
});
test("company-level gate does not call SmartRecruiters",async()=>{
 const r=await collectCorporate([],{enabled:c=>c.provider==="lever",fetchImpl:async url=>{assert.equal(url.hostname,"api.lever.co");return {ok:true,json:async()=>[post]}}});
 assert.equal(r.jobs.length,1);assert.equal(r.sourceStats["corporate:netcompany"].status,"skipped");assert.equal(r.sourceStats["corporate:tsmg"].status,"success");
});
