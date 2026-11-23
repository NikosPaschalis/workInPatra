import { cpSync, existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const electronDist = path.join(root, "node_modules", "electron", "dist");
const forgeRuntime = path.join(root, ".forge-runtime");
const electron = path.join(forgeRuntime, "electron.exe");
const forgeHost = path.join(root, "apps", "desktop-scraper", "scripts", "forge-host.js");
const localData = path.join(root, ".electron-local");
const forgeTemp = path.join(root, ".forge-tmp");
mkdirSync(localData, { recursive: true });
mkdirSync(forgeTemp, { recursive: true });
if (!existsSync(electron)) cpSync(electronDist, forgeRuntime, { recursive: true });

const result = spawnSync(electron, [forgeHost, ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    LOCALAPPDATA: localData,
    TEMP: forgeTemp,
    TMP: forgeTemp,
    electron_config_cache: path.join(root, ".electron-cache"),
  },
});
process.exit(result.status ?? 1);
