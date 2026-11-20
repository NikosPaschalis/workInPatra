import path from "node:path";
import { spawn } from "node:child_process";

export default {
  packagerConfig: {
    name: "WorkInPatra Desktop Scraper",
    executableName: "WorkInPatraScraper",
    asar: {
      unpackDir: path.join("node_modules", "playwright-core", ".local-browsers"),
    },
    ignore: [
      /^\/\.git(?:\/|$)/,
      /^\/\.(?:github|claude|agents)(?:\/|$)/,
      /^\/\.codex[^/]*(?:\/|$)/,
      /^\/\.npm-cache(?:\/|$)/,
      /^\/\.electron-(?:cache|local|smoke-data)(?:\/|$)/,
      /^\/\.forge-(?:tmp|runtime)(?:\/|$)/,
      /^\/out(?:\/|$)/,
      /^\/test(?:\/|$)/,
      /^\/server\/node_modules(?:\/|$)/,
    ],
  },
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: { name: "workinpatra_desktop_scraper" },
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["win32"],
    },
  ],
  hooks: {
    prePackage: async () => {
      // Windows scanners can briefly hold Electron's freshly copied
      // default_app.asar. Node retries EBUSY only when maxRetries is supplied.
      const fs = await import("node:fs");
      const originalRm = fs.default.promises.rm.bind(fs.default.promises);
      const originalRename = fs.default.promises.rename.bind(fs.default.promises);
      fs.default.promises.rm = async (target, options = {}) => {
        try {
          return await originalRm(target, {
            ...options,
            maxRetries: Math.max(options.maxRetries || 0, 20),
            retryDelay: options.retryDelay || 250,
          });
        } catch (error) {
          if (error?.code === "EBUSY" && path.basename(String(target)) === "default_app.asar") return;
          throw error;
        }
      };
      fs.default.promises.rename = async (source, destination) => {
        let lastError;
        for (let attempt = 0; attempt < 10; attempt++) {
          try {
            return await originalRename(source, destination);
          } catch (error) {
            if (!["EBUSY", "EPERM"].includes(error?.code)) throw error;
            lastError = error;
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
        // Antivirus can keep a directory handle beyond the retry window.
        // A copy leaves the locked temp tree for later cleanup but still
        // produces an identical package in Forge's requested destination.
        if (lastError) {
          const sourceStat = await fs.default.promises.stat(source);
          if (!sourceStat.isDirectory()) throw lastError;
          await new Promise((resolve, reject) => {
            const copy = spawn("robocopy.exe", [
              source, destination, "/E", "/COPY:DAT", "/R:2", "/W:1", "/NFL", "/NDL", "/NJH", "/NJS",
            ], { stdio: "ignore" });
            copy.on("error", reject);
            copy.on("exit", (code) => code <= 7 ? resolve() : reject(new Error(`robocopy failed with code ${code}`)));
          });
          return;
        }
      };
    },
  },
};
