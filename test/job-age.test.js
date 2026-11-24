import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { isJobWithinAgeWindow, summarizeJobAge, jobAgeBasis } from "../client-utils.js";
import { loadFirstSeen, stampFirstSeen } from "../scripts/first-seen.js";
import { makeJobKey } from "../scripts/job-history.js";
const now = new Date("2026-11-24T12:00:00Z");
test("30 Athens calendar days inclusive; older, future and unknown excluded",()=>{
  assert.equal(isJobWithinAgeWindow({date:"2026-10-26T00:00:00Z"},30,now),true);
  assert.equal(isJobWithinAgeWindow({date:"2026-10-25T00:00:00Z"},30,now),false);
  assert.equal(isJobWithinAgeWindow({date:"2026-10-25T22:00:00Z"},30,now),true);
  assert.equal(isJobWithinAgeWindow({date:"2026-10-25"},999,now),false);
  assert.equal(isJobWithinAgeWindow({date:"2026-11-25"},30,now),false);
  assert.equal(isJobWithinAgeWindow({date:"2026-11-25",firstSeenAt:"2026-11-23"},30,now),false);
  assert.equal(isJobWithinAgeWindow({},30,now),false);
});
test("first seen fallback only for unknown dates, never for a known old publication",()=>{
  const old={date:"2026-10-01",firstSeenAt:"2026-11-23"};
  const unknown={date:null,firstSeenAt:"2026-11-23"};
  assert.equal(isJobWithinAgeWindow(old,30,now),false);
  assert.equal(isJobWithinAgeWindow(unknown,30,now),true);
  assert.equal(jobAgeBasis(unknown,now).kind,"first_seen");
  assert.deepEqual(summarizeJobAge([old,unknown,{}, {date:"2026-11-23"}],now),{total:4,visible30:2,published30:1,firstSeen30:1,older:1,unknown:1});
});
test("historical reappearance retains earliest observation; fallback does not get a fresh timestamp",async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),"workinpatra-age-"));
  try {
    const job={source:"corporate",sourceKey:"corporate:demo",externalId:"123",url:"https://example.com/job",title:"Demo"};
    writeFileSync(path.join(dir,"observations.jsonl"),JSON.stringify({job_key:makeJobKey(job),source_group:"corporate",observed_at:"2026-10-01T12:00:00Z"})+"\n");
    const map=await loadFirstSeen({dataDir:dir,now});
    const [old,newJob,failed]=stampFirstSeen([job,{...job,externalId:"456"},{...job,externalId:"789"}],map,{now,isFresh:j=>j.externalId!=="789"});
    assert.equal(old.firstSeenAt,"2026-10-01T12:00:00.000Z");
    assert.equal(newJob.firstSeenAt,now.toISOString());
    assert.equal(failed.firstSeenAt,null);
    assert.equal(isJobWithinAgeWindow(old,30,now),false);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
