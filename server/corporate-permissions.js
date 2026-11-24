// A provider flag alone must not authorize every company on a third-party platform.
export function corporateEnabled(company,env=process.env){
 if(env.CORPORATE_CAREERS_ENABLED!=="true")return false;
 if(company.provider==="lever")return env.LEVER_REUSE_AUTHORIZED==="true";
 if(company.provider==="workable")return String(env.WORKABLE_APPROVED_COMPANIES||"").split(",").map(s=>s.trim()).includes(company.id);
 if(!company.provider||company.provider==="smartrecruiters")return env.SMARTRECRUITERS_REUSE_AUTHORIZED==="true";
 return false;
}
