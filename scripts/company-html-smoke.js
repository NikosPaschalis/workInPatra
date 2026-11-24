import {CORPORATE_COMPANIES,collectCorporate} from "../server/scrapers/corporate.js";
import {corporateEnabled} from "../server/corporate-permissions.js";
const companies=CORPORATE_COMPANIES.filter(c=>c.provider==="html"&&corporateEnabled(c));
if(!companies.length)throw Error("No approved company HTML sources");
const r=await collectCorporate([],{companies,enabled:true});
console.log(JSON.stringify(r,null,2));
if(Object.values(r.sourceStats).some(s=>s.status!=="success"))process.exitCode=1;
