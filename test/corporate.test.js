import assert from "node:assert/strict";
import test from "node:test";
import { CORPORATE_COMPANIES, fetchCompany, collectCorporate, isLocalPosting } from "../server/scrapers/corporate.js";
import { categorizeCorporateRole } from "../server/corporate-categories.js";
const [net, ren] = CORPORATE_COMPANIES;
const now = new Date("2026-11-24T12:00:00Z");
const posting = (id, city = "Patras") => ({id, name:"Application Support Agent", location:{city,country:"gr"}, releasedDate:"2026-11-18T12:00:00Z"});
const response = (content, totalFound = content.length) => ({ok:true,json:async()=>({content,totalFound})});
const withDetails = (posts, identifier = "netcompany1") => async url => url.pathname.endsWith("/postings") ? response(posts) : ({ok:true,json:async()=>({...posts.find(p=>url.pathname.endsWith("/"+p.id)),active:true,postingUrl:"https://jobs.smartrecruiters.com/"+identifier+"/"+url.pathname.split("/").at(-1)+"-actual-title-"})});
test("local geography excludes Athens, generic remote and Rio outside Greece",()=>{
  assert.equal(isLocalPosting({city:"Patras",country:"gr"}),true);
  assert.equal(isLocalPosting({city:"Rio",country:"br"}),false);
  assert.equal(isLocalPosting({city:"Athens",country:"gr"}),false);
  assert.equal(isLocalPosting({city:"Remote",country:"gr"}),false);
});
test("public ATS posting is normalized with stable source key and real date",async()=>{
  const jobs = await fetchCompany(net,{now,fetchImpl:withDetails([posting("123"),posting("456","Athens")])});
  assert.equal(jobs.length,1);
  assert.equal(jobs[0].sourceKey,"corporate:netcompany");
  assert.equal(jobs[0].category,"tech");
  assert.equal(jobs[0].date,"2026-11-18T12:00:00.000Z");
  assert.match(jobs[0].url,/netcompany1\/123-/);
});
test("valid zero removes old inventory but 403 retains only affected company",async()=>{
  const prior = [{source:"corporate",sourceKey:"corporate:netcompany",title:"Old 1"},{source:"corporate",sourceKey:"corporate:renesas",title:"Old 2"}];
  const result=await collectCorporate(prior,{enabled:true,now,fetchImpl:async url=>url.pathname.includes("netcompany1")?response([]):{ok:false,status:403}});
  assert.equal(result.sourceStats["corporate:netcompany"].status,"success");
  assert.equal(result.sourceStats["corporate:renesas"].status,"fallback");
  assert.deepEqual(result.jobs.map(j=>j.title),["Old 2"]);
  assert.equal(result.jobs[0].corporateStatus,"unverified");
});
test("malformed response fails closed and disabled collector makes no requests",async()=>{
  await assert.rejects(fetchCompany(net,{fetchImpl:async()=>response([],1)}),/Incomplete/);
  const result=await collectCorporate([],{fetchImpl:async()=>assert.fail("unexpected request")});
  assert.equal(result.sourceStats["corporate:netcompany"].status,"skipped");
});
test("specific categories preserve historical parent IDs",()=>{
  assert.equal(categorizeCorporateRole("Analog Design Engineer").subcategory,"semiconductor");
  assert.equal(categorizeCorporateRole("Junior Cloud / DevOps Engineer").category,"tech");
  assert.equal(categorizeCorporateRole("Audit Associate").category,"admin");
});

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { recordScrapeHistory } from "../scripts/job-history.js";
test("history does not treat failed company fallback as observed and uses stable posting id",async()=>{
  const dir = mkdtempSync(path.join(tmpdir(),"corporate-history-"));
  try {
    const [job] = await fetchCompany(net,{now,fetchImpl:withDetails([posting("123")])});
    const other = {...job,sourceKey:"corporate:renesas",companyId:"renesas",externalId:"456"};
    recordScrapeHistory({dataDir:dir,jobs:[job,other],startedAt:now.toISOString(),completedAt:now.toISOString(),sourceStats:{"corporate:netcompany":{status:"success"},"corporate:renesas":{status:"fallback"}}});
    const records = readFileSync(path.join(dir,"observations.jsonl"),"utf8").trim().split("\n").map(JSON.parse);
    assert.equal(records.length,1);
    assert.equal(records[0].job_key,"corporate:netcompany:posting:123");
    assert.equal(records[0].source_group,"corporate");
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("uses canonical URL from detail response and rejects invalid detail URLs",async()=>{
  const [job] = await fetchCompany(net,{now,fetchImpl:withDetails([posting("123")])});
  assert.equal(job.url,"https://jobs.smartrecruiters.com/netcompany1/123-actual-title-");
  await assert.rejects(fetchCompany(net,{now,fetchImpl:withDetails([posting("123")],"wrong-company")}),/Invalid official posting URL/);
});
