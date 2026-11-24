import path from "node:path";

export function resolveProjectRoot({ isPackaged, appPath, execPath, override = "" }) {
  if (override) return path.resolve(override);
  if (!isPackaged) return path.resolve(appPath);
  return path.resolve(path.dirname(execPath), "..", "..");
}

export function karieraSnapshotDirectory(projectRoot) {
  return path.join(projectRoot, "data", "kariera-html-snapshots");
}
