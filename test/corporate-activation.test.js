import test from "node:test";
import assert from "node:assert/strict";
import { corporateEnabled, corporateDue } from "../server/corporate-permissions.js";
import { CORPORATE_COMPANIES, collectCorporate } from "../server/scrapers/corporate.js";
test("nine validated sources default on; denied source excluded",()=>{
 assert.deepEqual(CORPORATE_COMPANIES.filter(c=>corporateEnabled(c,{})).map(c=>c.id),["netcompany","renesas","tsmg","motodynamics","cosmos-sport","plaisio","irida-renesas","althom","noesis"]);
 assert.equal(CORPORATE_COMPANIES.filter(c=>corporateEnabled(c,{CORPORATE_CAREERS_ENABLED:"false"})).length,0);
 assert.equal(corporateEnabled({id:"untested",provider:"html"},{}),false);
 assert.equal(corporateEnabled(CORPORATE_COMPANIES.find(c=>c.id==="advisable"),{HTML_APPROVED_COMPANIES:"advisable"}),false);
});
test("empty Actions variables do not disable validated sources",()=>{
 const env={CORPORATE_CAREERS_ENABLED:"",LEVER_REUSE_AUTHORIZED:"",SMARTRECRUITERS_ENABLED:"",WORKABLE_APPROVED_COMPANIES:"",HTML_APPROVED_COMPANIES:""};
 assert.equal(CORPORATE_COMPANIES.filter(c=>corporateEnabled(c,env)).length,9);
});

test("SmartRecruiters evening-only scheduled collection and explicit opt-out",()=>{
 const c=CORPORATE_COMPANIES.find(c=>c.id==="netcompany");
 assert.equal(corporateEnabled(c,{SMARTRECRUITERS_ENABLED:"false"}),false);
 assert.equal(corporateDue(c,{GITHUB_EVENT_NAME:"schedule",KARIERA_CRON:"0 6 * * *"}),false);
 assert.equal(corporateDue(c,{GITHUB_EVENT_NAME:"schedule",KARIERA_CRON:"0 18 * * *"}),true);
 assert.equal(corporateDue(c,{GITHUB_EVENT_NAME:"workflow_dispatch"}),true);
});

test("scheduled skip retains records without requests or new verification",async()=>{
 const company=CORPORATE_COMPANIES.find(c=>c.id==="netcompany");
 const old={source:"corporate",sourceKey:"corporate:netcompany",company:"Netcompany",title:"Example",corporateStatus:"verified",lastVerifiedAt:"2026-11-23T18:00:00Z"};
 const result=await collectCorporate([old],{companies:[company],enabled:()=>true,due:()=>false,fetchImpl:()=>assert.fail("unexpected network request")});
 assert.deepEqual(result.jobs,[old]);assert.equal(result.sourceStats["corporate:netcompany"].status,"scheduled_skip");
});
