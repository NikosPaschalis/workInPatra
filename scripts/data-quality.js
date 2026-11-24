// Offline quality audit; warnings never trigger extra source requests.
import {readFileSync,existsSync,writeFileSync,readdirSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {CATEGORY_DEFINITIONS} from "../categories.js";
import {canonicalizeJobUrl} from "./job-identity.js";
import {makeJobKey} from "./job-history.js";
import {parseJsonl} from "./analyze-job-history.js";
import {athensCalendarAge} from "../client-utils.js";
const categories=new Set(CATEGORY_DEFINITIONS.map(c=>c.id));
const timestamp=v=>Number.isFinite(Date.parse(v||""));
const group=(xs,key)=>{const m=new Map();for(const x of xs){const k=key(x);if(!m.has(k))m.set(k,[]);m.get(k).push(x)}return m;};
const source=j=>j.sourceKey||j.source;
const validJob=j=>typeof j.title==="string"&&j.title.trim()&&canonicalizeJobUrl(j.url)&&categories.has(j.category)&&!!source(j);
const fields=["company","location","employmentType","salaryRaw","date"];
const sum=x=>Object.values(x||{}).reduce((a,b)=>a+b,0);
export function auditData({data,observations,runs,snapshots=[],manifest=null,now=new Date()}){
 const errors=[],warnings=[],jobs=data.jobs||[],corporate=data.corporateInventory||[];
 const report=(a,code,count,detail)=>{if(count)a.push({code,count,detail});};
 const rmap=new Map(runs.map(r=>[r.run_id,r]));
 report(errors,"duplicate_run",runs.length-rmap.size);
 report(errors,"invalid_run",runs.filter(r=>!r.run_id||!timestamp(r.completed_at)||Date.parse(r.completed_at)>now.getTime()).length);
 report(errors,"invalid_job",jobs.filter(j=>!validJob(j)).length);
 report(errors,"invalid_corporate",corporate.filter(j=>!validJob(j)||!j.externalId||!j.sourceKey).length);
 for(const [name,rows] of [["public",jobs],["corporate",corporate]])report(errors,"duplicate_"+name,rows.length-group(rows,makeJobKey).size);
 const obsGroups=group(observations,o=>o.run_id+"|"+o.job_key);
 report(errors,"duplicate_observation",observations.length-obsGroups.size);
 const byRun=group(observations,o=>o.run_id);
 report(errors,"run_count_mismatch",runs.filter(r=>r.total_observed!==(byRun.get(r.run_id)||[]).length).length);
 report(errors,"untrusted_observation",observations.filter(o=>{
  const r=rmap.get(o.run_id),s=r?.sources?.[o.source]?.status;
  return !r||!o.job_key||!timestamp(o.observed_at)||Date.parse(o.observed_at)!==Date.parse(r.completed_at)||!canonicalizeJobUrl(o.url)||!categories.has(o.category)||!(r.run_type==="baseline"&&r.status==="baseline"||r.run_type==="scrape"&&s==="success"||r.run_type==="manual"&&s==="manual_verified"&&timestamp(o.verified_at)&&Date.parse(o.verified_at)<=Date.parse(o.observed_at));
 }).length);
 report(errors,"future_publication",jobs.filter(j=>timestamp(j.date)&&Date.parse(j.date)>now.getTime()).length);
 report(errors,"future_historical_publication",observations.filter(o=>timestamp(o.source_published_at)&&Date.parse(o.source_published_at)>Date.parse(o.observed_at)).length);
 report(errors,"invalid_temporal_fields",[...jobs,...corporate].filter(j=>["date","firstSeenAt","lastSeenAt","originalObservedDate"].some(k=>j[k]!=null&&(!timestamp(j[k])||Date.parse(j[k])>now.getTime()))||timestamp(j.firstSeenAt)&&timestamp(j.lastSeenAt)&&Date.parse(j.firstSeenAt)>Date.parse(j.lastSeenAt)).length);
 const histories=group(observations,o=>o.job_key);
 const earliest=new Map();
 for(const o of observations){const v=Date.parse(o.verified_at||o.observed_at);if(Number.isFinite(v))earliest.set(o.job_key,Math.min(v,earliest.get(o.job_key)??Infinity));}
 const mismatches=jobs.filter(j=>earliest.has(makeJobKey(j))&&(!timestamp(j.firstSeenAt)||Date.parse(j.firstSeenAt)>earliest.get(makeJobKey(j)))).length;
 report(warnings,"first_seen_after_history",mismatches);
 report(warnings,"date_drift",[...histories.values()].filter(g=>new Set(g.filter(o=>timestamp(o.source_published_at)).map(o=>o.source_published_at.slice(0,10))).size>1).length);
 report(warnings,"legacy_missing_location",observations.filter(o=>o.schema_version!==2&&!o.location).length);
 report(warnings,"manual_without_history",jobs.filter(j=>j.manuallyVerifiedAt&&!histories.has(makeJobKey(j))).length);
 report(errors,"snapshot_totals",snapshots.filter(s=>sum(s.byCategory)!==s.total||sum(s.bySource)!==s.total).length);
 if(manifest)report(errors,"snapshot_manifest",snapshots.filter(s=>!manifest.snapshots?.some(m=>m.month===s.month&&m.total===s.total&&m.capturedAt===s.capturedAt)).length+Math.abs(snapshots.length-(manifest.snapshots?.length||0)));
 const latestScrapes=runs.filter(r=>r.run_type==="scrape").sort((a,b)=>Date.parse(a.completed_at)-Date.parse(b.completed_at));
 const keys=new Set([...latestScrapes.flatMap(r=>Object.keys(r.sources||{})),...jobs.map(source),...corporate.map(source)]);
 const bySource={};
 for(const key of [...keys].sort()){
  const latest=latestScrapes.filter(r=>r.sources?.[key]).at(-1);
  const successes=latestScrapes.filter(r=>r.sources?.[key]?.status==="success");
  const last=successes.at(-1),info=latest?.sources?.[key],lastInfo=last?.sources?.[key];
  const rows=key.startsWith("corporate:")?corporate.filter(j=>source(j)===key):jobs.filter(j=>source(j)===key);
  const history=last?(byRun.get(last.run_id)||[]).filter(o=>o.source===key):[];
  const scope=lastInfo?.collection_scope||"legacy_unverified";
  const age=last?(now-Date.parse(last.completed_at))/3600000:null;
  const comparable=!!last&&age>=0&&age<=36&&["success","scheduled_skip"].includes(info?.status)&&scope!=="legacy_unverified"&&Number.isInteger(lastInfo?.observed_count)&&lastInfo.observed_count===history.length;
  const recent=successes.slice(-10).map(r=>r.sources[key].scraped_count).filter(Number.isFinite);
  if(recent.length>=5&&new Set(recent).size===1&&recent[0]>0&&scope!=="employer_adapter")report(warnings,"repeated_source_volume",1,key+": "+recent[0]+" in "+recent.length+" runs; coverage unverified");
  if(recent.length>=5){const prior=recent.slice(0,-1).sort((a,b)=>a-b);const med=prior[Math.floor(prior.length/2)];if(med>0&&Math.abs(recent.at(-1)-med)/med>=.5)report(warnings,"source_volume_shift",1,key);}
  if(rows.length&&(!last||age>36||!["success","scheduled_skip"].includes(info?.status)))report(warnings,"stale_or_unverified_source",rows.length,key);
  bySource[key]={status:info?.status||"not_observed",last_success_at:last?.completed_at||null,scope,inventory_count:rows.length,observed_count:last?history.length:null,comparable,missing:Object.fromEntries(fields.map(k=>[k,rows.filter(j=>!j[k]).length]))};
 }
 return {schemaVersion:1,checkedAt:now.toISOString(),inventory:jobs.length,corporateInventory:corporate.length,observations:observations.length,distinctSourceListings:histories.size,runs:runs.length,snapshots:snapshots.length,errors,warnings,bySource};
}
export function compareCoverage(previous,current){
 const a=previous?.quality?.bySource,b=current?.quality?.bySource;
 if(!a||!b)return {available:false,reason:"missing_quality_baseline"};
 const keys=Object.keys(b).filter(k=>a[k]?.comparable&&b[k]?.comparable&&a[k].scope===b[k].scope&&Number.isInteger(a[k].observed_count)&&Number.isInteger(b[k].observed_count)).sort();
 if(!keys.length)return {available:false,reason:"no_comparable_sources"};
 const previousCount=keys.reduce((n,k)=>n+a[k].observed_count,0),currentCount=keys.reduce((n,k)=>n+b[k].observed_count,0);
 return {available:true,sources:keys,previousCount,currentCount,delta:currentCount-previousCount,percent:previousCount?(currentCount-previousCount)/previousCount*100:null,excluded:[...new Set([...Object.keys(a),...Object.keys(b)])].filter(k=>!keys.includes(k)).sort(),measurement:"source_listing_observations_not_unique_vacancies"};
}
export function auditFiles(dataDir,now=new Date()){
 const read=p=>JSON.parse(readFileSync(path.join(dataDir,p),"utf8"));
 const lines=p=>existsSync(path.join(dataDir,p))?parseJsonl(readFileSync(path.join(dataDir,p),"utf8"),p):[];
 const dir=path.join(dataDir,"snapshots");
 const snapshots=existsSync(dir)?readdirSync(dir).filter(p=>/^\d{4}-\d{2}\.json$/.test(p)).map(p=>read("snapshots/"+p)):[];
 const manifest=existsSync(path.join(dir,"index.json"))?read("snapshots/index.json"):null;
 return auditData({data:read("jobs.json"),observations:lines("observations.jsonl"),runs:lines("scrape-runs.jsonl"),snapshots,manifest,now});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const dir=path.resolve(process.argv[2]||"data"),result=auditFiles(dir);
 if(process.argv.includes("--write"))writeFileSync(path.join(dir,"data-quality.json"),JSON.stringify(result,null,2)+"\n");
 console.log(JSON.stringify(result,null,2));
 if(result.errors.length)process.exitCode=1;
}
