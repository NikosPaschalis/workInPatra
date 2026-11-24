import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {runScrape} from "../scripts/scrape.js";
import {collectCorporate,CORPORATE_COMPANIES} from "../server/scrapers/corporate.js";
import {corporateStatistics} from "../server/corporate-statistics.js";
const fixture=(source,title,company,url,date)=>({source,title,company,url,date,location:"Πάτρα",category:"other"});
test("full scratch pipeline retains deduplicated corporate inventory and history; never sends notifications",async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),"corporate-release-"));
 try{
 const now=new Date();const date=new Date(now-86400000).toISOString();
 const board=fixture("jobfind","Driver","TSMG","https://example.com/board",date);
 const kariera=fixture("kariera","Accountant","Other","https://example.com/k",date);
 const xe=fixture("xe","Sales","Other","https://example.com/x",date);
 writeFileSync(path.join(dir,"jobs.json"),JSON.stringify({jobs:[board,kariera,xe],lastFetched:date}));
 const company=CORPORATE_COMPANIES.find(c=>c.id==="tsmg");
 const post={id:"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",text:"Driver",country:"GR",categories:{location:"Patras"},hostedUrl:"https://jobs.lever.co/tsmg/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"};
 const boardScrapers=[{name:"jobfind",fn:async()=>[board]},{name:"kariera",fn:async()=>({skipped:true})},{name:"xe",fn:async()=>[xe]}];
 const corporateCollector=(previous,opts)=>collectCorporate(previous,{...opts,companies:[company],fetchImpl:async()=>({ok:true,json:async()=>[post]})});
 await runScrape({dataDir:dir,boardScrapers,corporateCollector,enabled:()=>true});
 const output=JSON.parse(readFileSync(path.join(dir,"jobs.json"),"utf8"));
 assert.equal(output.jobs.length,3);assert.equal(output.corporateInventory.length,1);
 assert.equal(output.jobs.filter(j=>j.source==="corporate").length,0);
 const stats=corporateStatistics(output);assert.equal(stats.ageWindow.total,1);assert.equal(stats.publicAgeWindow.total,0);assert.equal(stats.byCompany.TSMG,1);
 assert.ok(readFileSync(path.join(dir,"observations.jsonl"),"utf8").includes("corporate:tsmg:posting:"));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
