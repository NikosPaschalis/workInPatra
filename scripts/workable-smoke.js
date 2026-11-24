import {CORPORATE_COMPANIES,collectCorporate} from "../server/scrapers/corporate.js";
// One read-only diagnostic of the documented public list, never publishes or downloads descriptions.
const companies=CORPORATE_COMPANIES.filter(c=>c.provider==="workable");
const result=await collectCorporate([],{enabled:true,companies});
console.log(JSON.stringify(result,null,2));
if(Object.values(result.sourceStats).some(s=>s.status!=="success"))process.exitCode=1;
