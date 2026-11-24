import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { makeJobKey } from "./job-history.js";
import { jobIdentity } from "./job-identity.js";
import { athensCalendarAge } from "../client-utils.js";

function identities(job) {
  return [makeJobKey(job), job?.source === "corporate" ? null : jobIdentity(job)].filter(Boolean);
}
function iso(value, now) {
  const t=Date.parse(value || "");
  return Number.isFinite(t)&&t<=now.getTime()?new Date(t).toISOString():null;
}
export function recordEarliest(map,key,value,now=new Date()){
  const stamp=iso(value,now);if(!key||!stamp)return;
  const old=iso(map.get(key),now);if(!old||stamp<old)map.set(key,stamp);
}
export function inferDateProvenance(job) {
  if (!Number.isFinite(Date.parse(job.date || ""))) return "unavailable";
  if (job.dateProvenance && job.dateProvenance!=="unavailable") return job.dateProvenance;
  const raw=String(job.dateRaw||"");
  if(/πριν|σήμερα|χθες|ago|today|yesterday/i.test(raw)) return "relative_estimate";
  if(/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(raw))return "source_absolute_label";
  return raw ? "source_metadata" : "legacy_unknown";
}
// Metadata map kept alongside the backwards-compatible earliest-observation map.
function meta(map){return map.metadata ||= new Map();}
function remember(map,key,{seen,reported,reportedAt,verified,changed=false},now){
  if(!key)return;
  const m=meta(map).get(key)||{};
  const at=iso(seen,now), date=iso(reported,now), reportAt=iso(reportedAt,now), last=iso(verified,now);
  recordEarliest(map,key,at,now);
  if(last&&(!m.lastSeenAt||last>m.lastSeenAt))m.lastSeenAt=last;
  if(date&&reportAt){
    if(m.originalObservedDate&&athensCalendarAge(date,new Date(m.originalObservedDate))!==0)m.dateChanged=true;
    if(!m.originalObservedDateAt||reportAt<m.originalObservedDateAt){
      m.originalObservedDate=date;m.originalObservedDateAt=reportAt;
    }
  }
  if(changed)m.dateChanged=true;
  meta(map).set(key,m);
}
export async function loadFirstSeen({dataDir,previousJobs=[],previousFetchedAt,now=new Date()}){
  const map=new Map();
  const file=path.join(dataDir,"observations.jsonl");
  if(existsSync(file)){
    const lines=createInterface({input:createReadStream(file),crlfDelay:Infinity});
    for await(const line of lines){
      if(!line.trim())continue;
      const o=JSON.parse(line);
      const keys=[o.job_key,o.source_group==="corporate"?null:jobIdentity(o)].filter(Boolean);
      const seen=o.verified_at||o.observed_at;
      for(const k of keys){
        // A recorded observation cannot have a first seen later than itself.
        recordEarliest(map,k,o.first_seen_at,now);
        remember(map,k,{seen,reported:o.source_published_at,reportedAt:o.observed_at,verified:o.observation_kind==="baseline"||String(o.run_id).startsWith("baseline-")?null:seen,changed:o.date_changed===true},now);
      }
    }
  }
  for(const job of previousJobs){
    const seen=job.firstSeenAt||job.manuallyVerifiedAt||previousFetchedAt;
    for(const k of identities(job)){
      recordEarliest(map,k,job.manuallyVerifiedAt,now);
      remember(map,k,{seen,reported:job.originalObservedDate||job.date,reportedAt:job.originalObservedDateAt||previousFetchedAt||seen,verified:job.lastSeenAt||job.manuallyVerifiedAt||job.lastVerifiedAt,changed:job.dateChanged===true},now);
    }
  }
  return map;
}
export function stampFirstSeen(jobs,known,{now=new Date(),isFresh=()=>true}={}){
  return jobs.map(job=>{
    const keys=identities(job),fresh=isFresh(job);
    const verified=fresh?(job.manuallyVerifiedAt&&job.observationKind==="manual"?job.manuallyVerifiedAt:now.toISOString()):null;
    for(const k of keys){
      recordEarliest(known,k,job.firstSeenAt,now);
      recordEarliest(known,k,job.manuallyVerifiedAt,now);
      remember(known,k,{seen:verified,reported:fresh?job.date:null,reportedAt:verified,verified,changed:job.dateChanged===true},now);
    }
    const ms=keys.map(k=>meta(known).get(k)||{});
    const original=ms.filter(m=>m.originalObservedDateAt).sort((a,b)=>a.originalObservedDateAt.localeCompare(b.originalObservedDateAt))[0];
    return {...job,firstSeenAt:keys.map(k=>known.get(k)).filter(Boolean).sort()[0]||null,
      lastSeenAt:ms.map(m=>m.lastSeenAt).filter(Boolean).sort().at(-1)||null,
      originalObservedDate:original?.originalObservedDate||null,originalObservedDateAt:original?.originalObservedDateAt||null,
      dateProvenance:inferDateProvenance(job),dateChanged:ms.some(m=>m.dateChanged===true)};
  });
}
