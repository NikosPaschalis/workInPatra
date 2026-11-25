import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("monthly publication rejects a stale capture after a competing scrape push", t => {
  const root = mkdtempSync(path.join(tmpdir(), "workinpatra-publication-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const remote = path.join(root, "remote.git");
  const nightly = path.join(root, "nightly");
  const monthly = path.join(root, "monthly");
  const fresh = path.join(root, "fresh");
  const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const commit = (repo, message) => {
    git(repo, "add", "--", ".");
    git(repo, "-c", "user.email=test@example.invalid", "-c", "user.name=Fixture", "commit", "-m", message);
    return git(repo, "rev-parse", "HEAD");
  };
  const push = ["push", "origin", "HEAD:refs/heads/main"];
  const remoteTip = () => git(remote, "rev-parse", "refs/heads/main");
  const prepareEdition = (repo, value) => {
    for (const file of ["snapshot.json", "report.json", "sitemap.xml"]) {
      writeFileSync(path.join(repo, file), value);
    }
  };

  git(root, "init", "--bare", "--initial-branch=main", remote);
  git(root, "clone", remote, nightly);
  writeFileSync(path.join(nightly, "jobs.json"), "old inventory");
  commit(nightly, "Original inventory");
  git(nightly, ...push);
  git(root, "clone", remote, monthly);
  prepareEdition(monthly, git(monthly, "show", "HEAD:jobs.json"));
  commit(monthly, "Stale capture");

  writeFileSync(path.join(nightly, "jobs.json"), "new inventory");
  const newTip = commit(nightly, "Concurrent scrape");
  git(nightly, ...push);
  const rejected = spawnSync("git", push, { cwd: monthly, encoding: "utf8", env: { ...process.env, LC_ALL: "C" } });
  assert.equal(rejected.status, 1, rejected.stderr);
  assert.match(rejected.stderr, /fetch first|non-fast-forward/);
  assert.equal(remoteTip(), newTip);
  assert.deepEqual(git(remote, "ls-tree", "--name-only", "main").split(/\r?\n/), ["jobs.json"]);

  git(root, "clone", remote, fresh);
  prepareEdition(fresh, git(fresh, "show", "HEAD:jobs.json"));
  const publication = commit(fresh, "Capture from the fresh tip");
  git(fresh, ...push);
  assert.equal(remoteTip(), publication);
  assert.equal(git(remote, "rev-parse", "main^"), newTip);
  for (const file of ["jobs.json", "snapshot.json", "report.json", "sitemap.xml"]) {
    assert.equal(git(remote, "show", `main:${file}`), "new inventory");
  }
});
