import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { restoreState } from "../shared/state.js";

export class LocalStore {
  constructor(directory, filename = "state.json") {
    this.directory = directory;
    this.filePath = path.join(directory, filename);
    this.tempPath = `${this.filePath}.tmp`;
    this.pendingSave = Promise.resolve();
  }

  async load() {
    try {
      return restoreState(JSON.parse(await readFile(this.filePath, "utf8")));
    } catch (error) {
      if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
      return restoreState(null);
    }
  }

  async save(state) {
    const serialized = JSON.stringify(state, null, 2);
    const task = this.pendingSave.then(async () => {
      await mkdir(this.directory, { recursive: true });
      await writeFile(this.tempPath, serialized, { encoding: "utf8", mode: 0o600 });
      await rename(this.tempPath, this.filePath);
    });
    this.pendingSave = task.catch(() => {});
    return task;
  }
}
