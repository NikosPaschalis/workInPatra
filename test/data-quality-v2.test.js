import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,readFileSync,rmSync,cpSync,existsSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {loadFirstSeen,stampFirstSeen} from "../scripts/first-seen.js";
import {makeJobKey,recordScrapeHistory,recordManualHistory,recoverManualEvidence} from "../scripts/job-history.js";
import {analyzeFiles,parseJsonl} from "../scripts/analyze-job-history.js";
import {runScrape} from "../scripts/scrape.js";
import {auditData,auditFiles,compareCoverage} from "../scripts/data-quality.js";
import {isNewPublication} from "../client-utils.js";
import {generateSnapshot} from "../scripts/snapshot.js";
const now=new Date("2026-11-24T12:00:00Z"),old="2026-11-18T12:00:00.000Z";
const job=(source,id,opts={})=>({source,title:"Driver",company:"",url:"https://example.com/"+id,category:"logistics",location:"Πάτρα",employmentType:"Πλήρης",salaryRaw:"",date:"2026-11-18T00:00:00Z",dateRaw:"18/11/2026",...opts});
const temp=()=>mkdtempSync(path.join(os.tmpdir(),"quality-v2-"));
const read=(dir,p)=>JSON.parse(readFileSync(path.join(dir,p),"utf8"));
const lines=(dir,p)=>parseJsonl(readFileSync(path.join(dir,p),"utf8"));
test("date drift and fallback never reset earliest sighting or generate new publication claims",async()=>{
 const dir=temp();try{
  const j=job("jobfind","a"), key=makeJobKey(j);
  writeFileSync(path.join(dir,"observations.jsonl"),JSON.stringify({job_key:key,source:"jobfind",url:j.url,observed_at:old,first_seen_at:"2026-11-23T00:00:00Z",source_published_at:j.date})+"\n");
  const known=await loadFirstSeen({dataDir:dir,now,previousJobs:[{...j,firstSeenAt:"2026-11-23T00:00:00Z"}],previousFetchedAt:"2026-11-23T00:00:00Z"});
  const fresh=stampFirstSeen([{...j,date:"2026-11-24T00:00:00Z",dateRaw:"24/11/2026"}],known,{now})[0];
  assert.equal(fresh.firstSeenAt,old);assert.equal(fresh.lastSeenAt,now.toISOString());assert.equal(fresh.originalObservedDate,"2026-11-18T00:00:00.000Z");assert.equal(fresh.dateChanged,true);assert.equal(isNewPublication(fresh,1,now),false);
  const fallback=stampFirstSeen([fresh],known,{now:new Date("2026-11-26T12:00:00Z"),isFresh:()=>false})[0];assert.equal(fallback.lastSeenAt,fresh.lastSeenAt);
  const relative=stampFirstSeen([job("xe","rel",{date:"2026-11-24",dateRaw:"πριν από 2 ώρες"})],known,{now})[0];
  assert.equal(relative.dateProvenance,"relative_estimate");assert.equal(isNewPublication(relative,1,now),false);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test("scratch full pipeline keeps distinct postings and raw history, manual verification separate",async()=>{
 const dir=temp();try{
  const at=new Date(),yesterday=new Date(at-86400000).toISOString();
  const a=job("jobfind","a",{date:yesterday,dateRaw:yesterday}),b=job("jobfind","b",{date:yesterday,dateRaw:yesterday}),k=job("kariera","k",{date:null,manuallyVerifiedAt:yesterday,firstSeenAt:yesterday}),x=job("xe","x",{date:yesterday,dateRaw:yesterday});
  writeFileSync(path.join(dir,"jobs.json"),JSON.stringify({jobs:[a,k,x],lastFetched:yesterday}));
  const collectors=[{name:"jobfind",fn:async()=>[a,b]},{name:"kariera",fn:async()=>({skipped:true})},{name:"xe",fn:async()=>[x]}];
  await runScrape({dataDir:dir,boardScrapers:collectors,corporateCollector:async()=>({jobs:[],sourceStats:{}})});
  const output=read(dir,"jobs.json"),history=lines(dir,"observations.jsonl"),runs=lines(dir,"scrape-runs.jsonl");
  assert.equal(output.jobs.filter(j=>j.source==="jobfind").length,2);
  assert.equal(history.filter(o=>o.observation_kind==="scrape"&&o.source==="jobfind").length,2);
  assert.equal(history.filter(o=>o.observation_kind==="scrape"&&o.source==="kariera").length,0);
  assert.equal(history.filter(o=>o.observation_kind==="manual").length,1);
  assert.equal(history.find(o=>o.observation_kind==="manual").verified_at,yesterday);
  assert.equal(history.find(o=>o.observation_kind==="scrape").location,"Πάτρα");
  assert.equal(history.find(o=>o.observation_kind==="scrape").employment_type,"Πλήρης");
  assert.equal(recoverManualEvidence({dataDir:dir,jobs:output.jobs}).observedCount,0);
  assert.equal(analyzeFiles(dir).issues.untrusted_observations,0);
  assert.equal(auditFiles(dir).errors.length,0);
  assert.equal(runs.at(-1).sources.jobfind.observed_count,2);
  console.log("FIXTURE_EVIDENCE",JSON.stringify({jobs:output.jobs.length,observations:history.length,manual:1,rawJobfind:2,errors:auditFiles(dir).errors.length}));
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test("same-source observed count comparisons exclude stale, new, unverified legacy and changed scopes",()=>{
 const make=(count,scope="listing_page_unverified",comparable=true)=>({observed_count:count,scope,method:"test:v1",comparable});
 const a={quality:{bySource:{jobfind:make(35),xe:make(11),kariera:make(40),old:make(2)}}};
 const b={quality:{bySource:{jobfind:make(36),xe:make(12),kariera:make(40,"listing_page_unverified",false),old:make(2,"employer_adapter"),new:make(20)}}};
 const r=compareCoverage(a,b);assert.deepEqual(r.sources,["jobfind","xe"]);assert.equal(r.previousCount,46);assert.equal(r.currentCount,48);assert.equal(r.delta,2);assert.equal(compareCoverage({},b).available,false);
 assert.equal(compareCoverage({quality:{bySource:{}}},b).available,false);
});
test("quality detects corrupted run counts, duplicate records and invalid category",()=>{
 const j=job("jobfind","a",{category:"bad"}),r={run_id:"r",run_type:"scrape",status:"success",completed_at:old,total_observed:2,sources:{jobfind:{status:"success",observed_count:3}}};
 const o={run_id:"r",job_key:makeJobKey(j),source:"jobfind",observed_at:old,url:j.url,title:j.title,category:"logistics"};
 const q=auditData({data:{jobs:[j,j]},observations:[o,o],runs:[r],now});
 for(const code of ["invalid_job","duplicate_public","duplicate_observation","source_observation_count_mismatch"])assert.ok(q.errors.some(x=>x.code===code),code);
});
test("real committed files: integrity, recovery and next snapshot tested on a temporary copy only",async()=>{
 const dir=temp();try{
  cpSync("data",dir,{recursive:true});
  const before=auditFiles(dir),data=read(dir,"jobs.json"),beforeHistory=readFileSync(path.join(dir,"observations.jsonl"),"utf8");
  assert.deepEqual(before.errors,[]);
  const repairedAt=new Date();
  const recovered=recoverManualEvidence({dataDir:dir,jobs:data.jobs,completedAt:repairedAt.toISOString()});
  const map=await loadFirstSeen({dataDir:dir,previousJobs:data.jobs,previousFetchedAt:data.lastFetched,now:repairedAt});
  const jobs=stampFirstSeen(data.jobs,map,{now:repairedAt,isFresh:()=>false});
  writeFileSync(path.join(dir,"jobs.json"),JSON.stringify({...data,jobs}));
  const after=auditFiles(dir,repairedAt);
  assert.deepEqual(after.errors,[]);
  assert.equal(after.warnings.find(x=>x.code==="first_seen_after_history")?.count||0,0);
  assert.equal(after.warnings.find(x=>x.code==="manual_without_history")?.count||0,0);
  assert.ok(readFileSync(path.join(dir,"observations.jsonl"),"utf8").startsWith(beforeHistory));
  assert.equal(jobs.length,data.jobs.length);
  assert.deepEqual(jobs.map(j=>j.url),data.jobs.map(j=>j.url));
  assert.ok(jobs.every((j,i)=>j.date===data.jobs[i].date));
  // Generate a genuinely new snapshot with a controlled clock, not the existing October file.
  const oldSnapshots=Object.fromEntries(read(dir,"snapshots/index.json").snapshots.map(x=>[x.file,readFileSync(path.join(dir,"snapshots",x.file),"utf8")]));
  const captureAt=new Date(Date.UTC(repairedAt.getUTCFullYear(),repairedAt.getUTCMonth()+1,1,9));
  const snapshot=generateSnapshot({dataDir:dir,now:captureAt});
  assert.ok(!Object.hasOwn(oldSnapshots,snapshot.month+".json"));
  assert.equal(snapshot.total,jobs.length);assert.equal(snapshot.quality.schemaVersion,1);assert.equal(snapshot.comparableCoverage.available,false);
  for(const [file,original] of Object.entries(oldSnapshots))assert.equal(readFileSync(path.join(dir,"snapshots",file),"utf8"),original);
  assert.equal(read(dir,"snapshots/index.json").snapshots.length,before.snapshots+1);
  console.log("REAL_DATA_EVIDENCE",JSON.stringify({inventory:before.inventory,observations:before.observations,runs:before.runs,snapshots:before.snapshots,firstSeenBefore:before.warnings.find(x=>x.code==="first_seen_after_history")?.count||0,firstSeenAfter:0,manualRecovered:recovered.observedCount,manualRemaining:0,errorsBefore:before.errors.length,errorsAfter:after.errors.length,warningCodes:after.warnings.map(x=>x.code),newSnapshot:snapshot.month,newSnapshotTotal:snapshot.total,legacySnapshotsPreserved:before.snapshots,comparisonAvailable:snapshot.comparableCoverage.available}));
 }finally{rmSync(dir,{recursive:true,force:true})}
});

test("two real snapshot writes compare only common fresh source observations, not added corporate coverage",()=>{
 const dir=temp();try{
  const at1="2026-11-01T06:00:00.000Z",at2="2026-12-01T06:00:00.000Z";
  const j=job("jobfind","a",{date:"2026-10-30",firstSeenAt:"2026-10-30"});
  const x=job("xe","x",{date:"2026-10-30",firstSeenAt:"2026-10-30"});
  const k=job("kariera","k",{date:"2026-10-30",firstSeenAt:"2026-10-30"});
  const ok=(key,count)=>({status:"success",scraped_count:count,retained_count:count,collection_scope:"listing_page_unverified",collection_method:key+":listing-page:v1"});
  const write=(jobs,time)=>writeFileSync(path.join(dir,"jobs.json"),JSON.stringify({jobs,lastFetched:time,corporateInventory:jobs.filter(j=>j.source==="corporate")}));
  write([j,x,k],at1);
  recordScrapeHistory({dataDir:dir,jobs:[j,x,k],startedAt:at1,completedAt:at1,sourceStats:{jobfind:ok("jobfind",1),xe:ok("xe",1),kariera:ok("kariera",1)}});
  const a=generateSnapshot({dataDir:dir,now:new Date("2026-11-01T09:00:00Z")});
  const second=job("jobfind","b",{date:"2026-11-30",firstSeenAt:"2026-11-30"});
  const c=job("corporate","c",{sourceKey:"corporate:demo",externalId:"c",company:"Demo",date:"2026-11-30",firstSeenAt:"2026-11-30"});
  write([j,second,x,k,c],at2);
  recordScrapeHistory({dataDir:dir,jobs:[j,second,x,c],startedAt:at2,completedAt:at2,sourceStats:{jobfind:ok("jobfind",2),xe:ok("xe",1),kariera:{status:"skipped",retained_count:1}, "corporate:demo":{status:"success",collection_scope:"employer_adapter",collection_method:"corporate:demo:posting-adapter:v1",scraped_count:1,retained_count:1}}});
  const b=generateSnapshot({dataDir:dir,now:new Date("2026-12-01T09:00:00Z")});
  assert.equal(a.total,3);assert.equal(b.total,5);assert.deepEqual(b.comparableCoverage.sources,["jobfind","xe"]);assert.equal(b.comparableCoverage.previousCount,2);assert.equal(b.comparableCoverage.currentCount,3);assert.deepEqual(b.comparableCoverage.excluded,["corporate:demo","kariera"]);
  const original=readFileSync(path.join(dir,"snapshots","2026-11.json"),"utf8");generateSnapshot({dataDir:dir,now:new Date("2026-12-01T10:00:00Z")});assert.equal(readFileSync(path.join(dir,"snapshots","2026-11.json"),"utf8"),original);
  console.log("SNAPSHOT_EVIDENCE",JSON.stringify({total:[a.total,b.total],comparable:b.comparableCoverage,unchangedOnRepeat:true}));
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test("both actual queue entrypoints log verified evidence even when a cross-source title is hidden",()=>{
 const root=temp();try{
  const dir=path.join(root,"data");cpSync("data",dir,{recursive:true});
  const time=new Date(Date.now()-60000).toISOString();
  const base=job("jobfind","existing",{title:"Fixture job",company:"Fixture employer",url:"https://www.jobfind.gr/JobAd/View/fixture",sourceCategory:"Τεχνικά",date:null});
  writeFileSync(path.join(dir,"jobs.json"),JSON.stringify({jobs:[base],lastFetched:time}));
  writeFileSync(path.join(dir,"observations.jsonl"),"");
  writeFileSync(path.join(dir,"scrape-runs.jsonl"),"");
  const kariera={...base,source:"kariera",url:"https://www.kariera.gr/jobs/technology-jobs/999001",manuallyVerifiedAt:time,dateRaw:"",category:"construction"};
  const desktop={...base,source:"kariera",url:"https://www.kariera.gr/jobs/technology-jobs/999002",manuallyVerifiedAt:time,dateRaw:"",category:"construction"};
  writeFileSync(path.join(dir,"kariera-pending.json"),JSON.stringify({jobs:[kariera]}));
  writeFileSync(path.join(dir,"manual-pending.json"),JSON.stringify({jobs:[desktop]}));
  for(const script of ["apply-curated-kariera.js","apply-manual-pending.js"]){
    const result=spawnSync(process.execPath,[path.resolve("scripts",script)],{cwd:root,encoding:"utf8"});assert.equal(result.status,0,result.stderr);
  }
  const history=lines(dir,"observations.jsonl");
  assert.equal(read(dir,"jobs.json").jobs.length,1);assert.equal(history.length,2);assert.ok(history.every(o=>o.observation_kind==="manual"&&o.verified_at===time));
  assert.equal(read(dir,"kariera-pending.json").jobs.length,0);assert.equal(read(dir,"manual-pending.json").jobs.length,0);
  assert.equal(auditFiles(dir).errors.length,0);
  console.log("QUEUE_EVIDENCE",JSON.stringify({displayed:1,manualObservations:2,queuesCleared:true}));
 }finally{rmSync(root,{recursive:true,force:true})}
});
