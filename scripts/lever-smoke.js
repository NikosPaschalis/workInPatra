import { CORPORATE_COMPANIES, collectCorporate } from "../server/scrapers/corporate.js";
const companies=CORPORATE_COMPANIES.filter(c=>c.provider==="lever");
const result=await collectCorporate([],{enabled:true,companies});
console.log(JSON.stringify(result,null,2));
if(!result.jobs.length || Object.values(result.sourceStats).some(s=>s.status!=="success"))process.exitCode=1;
