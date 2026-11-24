import {mkdtempSync,cpSync,readFileSync,rmSync} from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import {runScrape} from "./scrape.js";
import {corporateStatistics} from "../server/corporate-statistics.js";
const dir=mkdtempSync(path.join(os.tmpdir(),"workinpatras-dry-run-"));
const dataDir=path.join(dir,"data");
try{
 cpSync("data",dataDir,{recursive:true});
 const before=JSON.parse(readFileSync(path.join(dataDir,"jobs.json"),"utf8"));
 // Only existing approved operational boards. Corporate providers remain off until approval.
 process.env.KARIERA_PAUSE_UNTIL="2099-01-01T00:00:00Z";
 await runScrape({dataDir,enabled:()=>false});
 const after=JSON.parse(readFileSync(path.join(dataDir,"jobs.json"),"utf8"));
 assert.ok(after.jobs.length>0);assert.ok(after.jobs.every(j=>!j.previewOnly));
 assert.ok(after.jobs.every(j=>j.date||Object.hasOwn(j,"firstSeenAt")));
 assert.ok(after.jobs.some(j=>j.source==="kariera"));
 assert.equal(after.corporateInventory.length,(before.corporateInventory||[]).length);
 assert.equal(corporateStatistics(after).ageWindow.total,(before.corporateInventory||[]).length);
 console.log("DRY RUN OK",JSON.stringify({before:before.jobs.length,after:after.jobs.length,sourceCounts:Object.fromEntries([...new Set(after.jobs.map(j=>j.source))].map(s=>[s,after.jobs.filter(j=>j.source===s).length])),corporate:"disabled"}));
}finally{rmSync(dir,{recursive:true,force:true});}
