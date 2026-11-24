// Validated public metadata sources default on. Explicit false stops the collector.
const defaults={workable:["motodynamics","cosmos-sport","plaisio"],html:["irida-renesas","althom","noesis"],lever:["tsmg"]};
function selected(value,ids,id){
 const list=String(value||"").trim();
 return (list?list.split(",").map(x=>x.trim()):ids).includes(id);
}
export function corporateEnabled(company,env=process.env){
 if(company.blocked||env.CORPORATE_CAREERS_ENABLED==="false")return false;
 if(company.provider==="lever")return env.LEVER_REUSE_AUTHORIZED!=="false"&&defaults.lever.includes(company.id);
 if(company.provider==="html")return selected(env.HTML_APPROVED_COMPANIES,defaults.html,company.id);
 if(company.provider==="workable")return selected(env.WORKABLE_APPROVED_COMPANIES,defaults.workable,company.id);
 // Specific SAP API restriction: only enable under a documented permitted route.
 if(!company.provider||company.provider==="smartrecruiters")return env.SMARTRECRUITERS_REUSE_AUTHORIZED==="true";
 return false;
}
