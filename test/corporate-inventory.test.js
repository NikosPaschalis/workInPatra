import test from "node:test";
import assert from "node:assert/strict";
import { mergeCorporateListings, previousCorporateInventory } from "../server/corporate-inventory.js";
import { collectCorporate,CORPORATE_COMPANIES } from "../server/scrapers/corporate.js";
import { stampFirstSeen } from "../scripts/first-seen.js";
const now=new Date("2026-11-24T12:00:00Z");
const company=CORPORATE_COMPANIES.find(c=>c.id==="tsmg");
const c={source:"corporate",sourceKey:"corporate:tsmg",company:"TSMG",externalId:"a",url:"https://example.com/a",title:"Driver",date:"2026-11-23",corporateStatus:"verified"};
const board={...c,source:"jobfind",url:"https://jobfind.gr/a"};
test("hidden duplicate survives next failed scrape and stable IDs preserve same-title requisitions",async()=>{
 const prior=previousCorporateInventory({jobs:[board],corporateInventory:[c]});
 assert.equal(mergeCorporateListings([board],prior,now).length,1);
 const fail=await collectCorporate(prior,{companies:[company],enabled:true,now,fetchImpl:async()=>({ok:false,status:403})});
 assert.equal(fail.jobs.length,1);assert.equal(fail.jobs[0].corporateStatus,"unverified");
 const closed=await collectCorporate(prior,{companies:[company],enabled:true,now,fetchImpl:async()=>({ok:true,json:async()=>[]})});
 assert.equal(closed.jobs.length,0);
 assert.equal(mergeCorporateListings([],[c,{...c,externalId:"b",url:"https://example.com/b"}],now).length,2);
});
test("fresh verified posting replaces stale board duplicate, never a recent board copy",()=>{
 assert.equal(mergeCorporateListings([{...board,date:"2026-09-01"}],[c],now)[0].source,"corporate");
 assert.equal(mergeCorporateListings([board],[c],now)[0].source,"jobfind");
 assert.equal(mergeCorporateListings([],[{...c,previewOnly:true}],now).length,0);
});
test("first discovery persists on repeated successful scans",()=>{
 const unknown={...c,date:null};const known=new Map();const [first]=stampFirstSeen([unknown],known,{now});
 const [later]=stampFirstSeen([unknown],known,{now:new Date("2026-12-01T12:00:00Z")});
 assert.equal(later.firstSeenAt,first.firstSeenAt);
});
