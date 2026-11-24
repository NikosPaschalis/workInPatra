import { summarizeJobAge } from "../client-utils.js";
import { previousCorporateInventory } from "./corporate-inventory.js";
const countBy=(jobs,key)=>{const m={};for(const j of jobs){const value=j[key]||"unknown";m[value]=(m[value]||0)+1;}return m;};
export function corporateStatistics(data, now=new Date()){
 if(!data.corporateCoverage)return null;
 const inventory=previousCorporateInventory(data);
 const displayed=(data.jobs||[]).filter(j=>j.source==="corporate"&&!j.previewOnly);
 return {coverage:data.corporateCoverage,byCompany:countBy(inventory,"company"),bySubcategory:countBy(inventory,"subcategoryLabel"),
   unverified:inventory.filter(j=>j.corporateStatus!=="verified").length,ageWindow:summarizeJobAge(inventory,now),publicAgeWindow:summarizeJobAge(displayed,now)};
}
