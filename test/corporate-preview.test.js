import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {loadCorporatePreview,corporatePreviewStats} from "../corporate-preview.js";
const data=JSON.parse(readFileSync(new URL("../data/corporate-review-v5.json",import.meta.url),"utf8"));
test("only PR 18 preview requests versioned reviewed listings, never production",async()=>{
  assert.deepEqual(await loadCorporatePreview("www.workinpatras.gr",()=>assert.fail("production request")),[]);
  const jobs=await loadCorporatePreview("deploy-preview-18--workinpatras.netlify.app",async(url,opts)=>{
    assert.equal(url,"/data/corporate-review-v5.json");assert.equal(opts.cache,"no-store");return {ok:true,json:async()=>data};
  });
  assert.equal(jobs.length,28);
  assert.equal(new Set(jobs.map(j=>j.company)).size,14);
  assert.equal(corporatePreviewStats(jobs,new Date("2026-11-24T12:00:00Z")).ageWindow.visible30,22);
});
test("reject old demo data and failed requests rather than falling back",async()=>{
  await assert.rejects(loadCorporatePreview("deploy-preview-18--workinpatras.netlify.app",async()=>({ok:true,json:async()=>({...data,jobs:data.jobs.map(j=>({...j,company:"Demo Digital"}))})})),/Invalid reviewed/);
  await assert.rejects(loadCorporatePreview("deploy-preview-18--workinpatras.netlify.app",async()=>({ok:false,status:404})),/404/);
});
