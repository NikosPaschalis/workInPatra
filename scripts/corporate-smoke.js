import { collectCorporate } from "../server/scrapers/corporate.js";
const result = await collectCorporate([], { enabled: true });
console.log(JSON.stringify(result, null, 2));
if (Object.values(result.sourceStats).some(s => s.status !== "success")) process.exitCode = 1;
