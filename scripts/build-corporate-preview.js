// Only the PR #18 deploy artifact receives demo data. No API, git writes or production build changes.
import { readFileSync, writeFileSync } from "node:fs";
import { categorizeCorporateRole } from "../server/corporate-categories.js";

if (process.env.CONTEXT !== "deploy-preview" || process.env.REVIEW_ID !== "18") {
  console.log("Corporate demo skipped outside PR #18 deploy preview.");
} else {
  const now = new Date();
  const roles = [
    ["Demo Consulting", "Junior Business Analyst"],
    ["Demo Digital", "Software Engineer"],
    ["Demo Digital", "Cloud DevOps Engineer"],
    ["Demo Microelectronics", "Analog Design Engineer"],
    ["Demo Consulting", "Audit Associate"],
    ["Demo Digital", "Cybersecurity Analyst"]
  ];
  const jobs = roles.map(([company,title],i) => {
    const role = categorizeCorporateRole(title);
    const date = new Date(now.getTime() - (i+1)*86400000).toISOString();
    return {
      source:"corporate", sourceKey:"corporate:demo-"+company.toLowerCase().replaceAll(" ","-"),
      title,company,location:"Πάτρα",date,dateRaw:"",...role,
      tags:[role.subcategoryLabel],corporateStatus:"verified",previewOnly:true
    };
  });
  const published = JSON.parse(readFileSync("data/jobs.json","utf8"));
  published.jobs = [...published.jobs.filter(j=>!j.previewOnly), ...jobs];
  published.corporatePreview = true;
  writeFileSync("data/jobs.json",JSON.stringify(published));
  // Separate demo payload for report: never rewrite monthly history or manifest.
  const byCompany={},bySubcategory={},coverage={};
  for(const job of jobs){
    byCompany[job.company]=(byCompany[job.company]||0)+1;
    bySubcategory[job.subcategoryLabel]=(bySubcategory[job.subcategoryLabel]||0)+1;
    coverage[job.sourceKey]={company:job.company,status:"success",retained_count:byCompany[job.company]};
  }
  writeFileSync("data/corporate-preview-report.json",JSON.stringify({previewOnly:true,total:jobs.length,corporate:{byCompany,bySubcategory,coverage,unverified:0}}));
  console.log("PR #18 deploy preview: "+jobs.length+" fictional listings; no live requests.");
}
