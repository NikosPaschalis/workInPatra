import { existsSync } from "node:fs";

export function resolveBrowserExecutable(executablePath, exists = existsSync) {
  const value = String(executablePath || "");
  if (!value.includes("app.asar")) return value;
  const unpacked = value.replace("app.asar", "app.asar.unpacked");
  return exists(unpacked) ? unpacked : value;
}
