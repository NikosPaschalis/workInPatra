import test from "node:test";
import assert from "node:assert/strict";
import {fetchWorkableCompany,normalizeWorkablePosting} from "../server/scrapers/workable.js";
import {corporateEnabled} from "../server/corporate-permissions.js";
import {collectCorporate,CORPORATE_COMPANIES} from "../server/scrapers/corporate.js";
const company=CORPORATE_COMPANIES.find(c=>c.id==="motodynamics");
const now=new Date("2026-11-24T12:00:00Z");
const post={title:"Service Technician",shortcode:"3F16BBF71E",city:"Patras",country:"Greece",published_on:"2026-11-18",shortlink:"https://apply.workable.com/j/3F16BBF71E",department:"Service",description:"never copied"};
const response=jobs=>({ok:true,json:async()=>({name:"Motodynamics",jobs})});
test("public Workable schema preserves date and canonical link, rejects foreign locations",()=>{
 const j=normalizeWorkablePosting(post,company,now);
 assert.equal(j.date,"2026-11-18T00:00:00.000Z");assert.equal(j.url,post.shortlink);assert.equal(j.externalId,post.shortcode);assert.equal(j.description,undefined);
 assert.equal(normalizeWorkablePosting({...post,city:"Athens"},company,now),null);
 assert.equal(normalizeWorkablePosting({...post,country:"US"},company,now),null);
 assert.equal(normalizeWorkablePosting({...post,published_on:null,created_at:"2026-11-01"},company,now).date,null);
 assert.throws(()=>normalizeWorkablePosting({...post,shortlink:"https://evil.example/j/3F16BBF71E"},company,now),/shortlink/);
});
test("public list fetch deduplicates multi-location records without losing local matches",async()=>{
 const jobs=await fetchWorkableCompany(company,{now,fetchImpl:async url=>{assert.equal(url.hostname,"www.workable.com");assert.equal(url.searchParams.get("details"),"false");return response([{...post,city:"Athens"},post,post])}});
 assert.equal(jobs.length,1);
 await assert.rejects(fetchWorkableCompany(company,{fetchImpl:async()=>({ok:false,status:403})}),/HTTP 403/);
 await assert.rejects(fetchWorkableCompany(company,{fetchImpl:async()=>({ok:true,json:async()=>({jobs:[]})})}),/Invalid Workable account/);
});
test("authorization is per employer, failure retains only affected company",async()=>{
 const env={CORPORATE_CAREERS_ENABLED:"true",WORKABLE_APPROVED_COMPANIES:"motodynamics"};
 assert.equal(corporateEnabled(company,env),true);
 assert.equal(corporateEnabled(CORPORATE_COMPANIES.find(c=>c.id==="cosmos-sport"),env),false);
 const previous=[{source:"corporate",sourceKey:"corporate:motodynamics",title:"previous"}];
 const r=await collectCorporate(previous,{now,enabled:c=>corporateEnabled(c,env),fetchImpl:async()=>({ok:false,status:429})});
 assert.equal(r.sourceStats["corporate:motodynamics"].status,"fallback");assert.equal(r.jobs[0].corporateStatus,"unverified");
 assert.equal(r.sourceStats["corporate:cosmos-sport"].status,"skipped");
});
