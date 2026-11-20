import { fork } from "node:child_process";
import { EventEmitter } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SOURCES } from "../shared/state.js";

const workerPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../worker/source-worker.js");

export class ScrapeController extends EventEmitter {
  constructor({ forkImpl = fork, timeoutMs = 90_000 } = {}) {
    super();
    this.forkImpl = forkImpl;
    this.timeoutMs = timeoutMs;
    this.children = new Map();
    this.running = false;
  }

  async run(sources, options = {}) {
    if (this.running) throw new Error("A scan is already running");
    const selected = [...new Set(sources)].filter((source) => SOURCES.includes(source));
    if (!selected.length) throw new Error("Select at least one source");
    this.running = true;
    for (const source of SOURCES) {
      this.emit("status", { source, status: selected.includes(source) ? "running" : "skipped", detail: "", count: 0 });
    }
    const settled = await Promise.allSettled(selected.map((source) => this.runSource(source, options[source] || {})));
    this.running = false;
    this.children.clear();
    return settled;
  }

  runSource(source, options) {
    return new Promise((resolve) => {
      const child = this.forkImpl(workerPath, [source], {
        stdio: ["ignore", "ignore", "ignore", "ipc"],
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", PLAYWRIGHT_BROWSERS_PATH: "0" },
      });
      this.children.set(source, child);
      let done = false;
      const finish = (status, detail, jobs = []) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.children.delete(source);
        this.emit("status", { source, status, detail, count: jobs.length });
        if (jobs.length) this.emit("results", { source, jobs });
        resolve({ source, status, detail, jobs });
      };
      const timer = setTimeout(() => {
        child.kill();
        finish("failed", `Timed out after ${this.timeoutMs / 1000} seconds`);
      }, this.timeoutMs);
      child.on("message", (message) => {
        if (message?.type === "success") finish("success", `Found ${message.jobs.length} listings`, message.jobs);
        if (message?.type === "error") finish(message.error.code === "BLOCKED" ? "blocked" : "failed", message.error.message);
      });
      child.on("error", (error) => finish("failed", error.message));
      child.on("exit", (code) => {
        if (!done) finish(code === 0 ? "cancelled" : "failed", code === 0 ? "Cancelled" : `Worker exited with code ${code}`);
      });
      child.send({ type: "start", options });
    });
  }

  cancel() {
    if (!this.running) return false;
    for (const [source, child] of this.children) {
      child.kill();
      this.emit("status", { source, status: "cancelled", detail: "Cancelled by user", count: 0 });
    }
    this.children.clear();
    this.running = false;
    return true;
  }
}
