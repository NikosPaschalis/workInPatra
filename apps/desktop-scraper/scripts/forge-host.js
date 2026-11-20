import path from "node:path";
import { pathToFileURL } from "node:url";

process.noAsar = true;
const forge = path.resolve("node_modules/@electron-forge/cli/dist/electron-forge.js");
process.argv = [process.argv[0], forge, ...process.argv.slice(2)];
await import(pathToFileURL(forge).href);
