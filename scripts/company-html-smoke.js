import {CORPORATE_COMPANIES,collectCorporate} from "../server/scrapers/corporate.js";
const companies=CORPORATE_COMPANIES.filter(c=>c.provider==="html");
const r=await collectCorporate([],{companies,enabled:true});
console.log(JSON.stringify(r,null,2));
if(Object.values(r.sourceStats).some(s=>s.status!=="success"||s.scraped_count===0))process.exitCode=1;
