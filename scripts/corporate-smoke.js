import { collectCorporate, CORPORATE_COMPANIES } from "../server/scrapers/corporate.js";
const result = await collectCorporate([], { enabled: true });
console.log(JSON.stringify(result, null, 2));
// The pilot has independently verified public vacancies in Patras on 2026-11-24.
// During initial validation, zero needs investigation rather than a green deployment signal.
for (const company of CORPORATE_COMPANIES) {
  const s = result.sourceStats["corporate:" + company.id];
  if (s?.status !== "success" || s.scraped_count === 0) {
    console.error(company.name + ": pilot validation inconclusive; expected at least one local vacancy");
    process.exitCode = 1;
  }
}
