import test from "node:test";
import assert from "node:assert/strict";
import { corporateEnabled } from "../server/corporate-permissions.js";
import { CORPORATE_COMPANIES } from "../server/scrapers/corporate.js";
test("validated sources default on, restricted and blocked sources excluded",()=>{
 assert.deepEqual(CORPORATE_COMPANIES.filter(c=>corporateEnabled(c,{})).map(c=>c.id),["tsmg","motodynamics","cosmos-sport","plaisio","irida-renesas","althom","noesis"]);
 assert.equal(CORPORATE_COMPANIES.filter(c=>corporateEnabled(c,{CORPORATE_CAREERS_ENABLED:"false"})).length,0);
 assert.equal(corporateEnabled({id:"untested",provider:"html"},{}),false);
 assert.equal(corporateEnabled(CORPORATE_COMPANIES.find(c=>c.id==="advisable"),{HTML_APPROVED_COMPANIES:"advisable"}),false);
});
test("empty Actions variables do not disable validated sources",()=>{
 const env={CORPORATE_CAREERS_ENABLED:"",LEVER_REUSE_AUTHORIZED:"",SMARTRECRUITERS_REUSE_AUTHORIZED:"",WORKABLE_APPROVED_COMPANIES:"",HTML_APPROVED_COMPANIES:""};
 assert.equal(CORPORATE_COMPANIES.filter(c=>corporateEnabled(c,env)).length,7);
});
