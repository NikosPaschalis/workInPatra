import test from "node:test";
import assert from "node:assert/strict";
import { analyzeJobLifecycle, parseJsonl, analyzeFiles } from "../scripts/analyze-job-history.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const stamp = (day) => "2026-11-" + String(day).padStart(2, "0") + "T12:00:00.000Z";
const run = (day, kariera, jobfind = "success") => ({
  run_id: "run-" + day, run_type: "scrape", status: "partial", completed_at: stamp(day),
  sources: { kariera: { status: kariera }, jobfind: { status: jobfind } },
});
const obs = (day, key = "kariera:https://example.com/1", source = "kariera") => ({
  run_id: "run-" + day, observed_at: stamp(day), job_key: key, source, title: "Developer", url: "https://example.com/1"
});

test("repeated observations produce stable first/last seen, count and duration", () => {
  const result = analyzeJobLifecycle([obs(13), obs(14)], [run(13, "success"), run(14, "success")]);
  assert.equal(result.summary.jobs, 1);
  assert.deepEqual(
    [result.jobs[0].first_seen, result.jobs[0].last_seen, result.jobs[0].observation_count, result.jobs[0].days_observed],
    [stamp(13), stamp(14), 2, 1]
  );
  assert.equal(result.jobs[0].status, "last_observed");
});

test("403 fallback and scheduled skip never imply absence", () => {
  const result = analyzeJobLifecycle([obs(13)], [run(13, "success"), run(14, "fallback"), run(15, "skipped"), run(16, "failed")]);
  assert.equal(result.jobs[0].status, "last_observed");
  assert.equal(result.jobs[0].successful_source_runs_since_last_seen, 0);
  assert.equal(result.source_quality.kariera.fallback_runs, 1);
  assert.equal(result.source_quality.kariera.skipped_runs, 1);
});

test("only successful source scrapes support cautious absence, never expiry", () => {
  const runs = [run(13, "success"), run(14, "success"), run(15, "fallback"), run(16, "success")];
  const result = analyzeJobLifecycle([obs(13)], runs);
  assert.equal(result.jobs[0].status, "not_seen_in_recent_successful_scrapes");
  assert.equal(result.jobs[0].successful_source_runs_since_last_seen, 2);
});

test("reappearance is counted after a successful source scrape without the listing", () => {
  const result = analyzeJobLifecycle([obs(13), obs(16)], [
    run(13, "success"), run(14, "success"), run(15, "fallback"), run(16, "success")
  ]);
  assert.equal(result.jobs[0].reappearance_count, 1);
  assert.equal(result.jobs[0].status, "last_observed");
});

test("baseline is explicitly left-censored, not treated as original publication", () => {
  const baseline = { run_id: "base", run_type: "baseline", status: "baseline", completed_at: stamp(12) };
  const old = { ...obs(13), run_id: "base", observed_at: stamp(12) };
  const result = analyzeJobLifecycle([old, obs(13)], [baseline, run(13, "success")]);
  assert.equal(result.jobs[0].first_seen_is_baseline, true);
  assert.equal(result.jobs[0].first_fresh_seen, stamp(13));
});

test("duplicate and unsupported observations do not inflate counts", () => {
  const result = analyzeJobLifecycle([obs(13), obs(13), obs(14)], [run(13, "success"), run(14, "fallback")]);
  assert.equal(result.jobs[0].observation_count, 1);
  assert.equal(result.issues.duplicate_observations, 1);
  assert.equal(result.issues.untrusted_observations, 1);
});

test("invalid JSONL reports filename and line number", () => {
  assert.throws(() => parseJsonl('{"a":1}\nnot json\n', "observations.jsonl"), /observations.jsonl:2/);
});

test("job keys are source-specific and not merged across platforms", () => {
  const result = analyzeJobLifecycle([
    obs(13, "kariera:https://example.com/1", "kariera"),
    obs(13, "jobfind:https://example.com/1", "jobfind"),
  ], [run(13, "success", "success")]);
  assert.equal(result.jobs.length, 2);
});

test("real committed history is parseable and 403 periods do not count as fresh Kariera observations", () => {
  const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data");
  const result = analyzeFiles(dataDir);
  assert.ok(result.summary.jobs > 0);
  assert.ok(result.source_quality.kariera.fallback_runs > 0);
  assert.ok(result.jobs.some(job => job.source === "kariera"));
  assert.ok(result.jobs.every(job => job.observation_count >= 1));
});
