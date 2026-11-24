import { CORPORATE_COMPANIES,collectCorporate } from "../server/scrapers/corporate.js";
const ids=String(process.env.WORKABLE_APPROVED_COMPANIES||"").split(",").map(s=>s.trim()).filter(Boolean);
const companies=CORPORATE_COMPANIES.filter(c=>c.provider==="workable"&&ids.includes(c.id));
if(!companies.length)throw new Error("No approved Workable employers");
const result=await collectCorporate([],{enabled:true,companies});
console.log(JSON.stringify(result,null,2));
if(Object.values(result.sourceStats).some(s=>s.status!=="success"))process.exitCode=1;
