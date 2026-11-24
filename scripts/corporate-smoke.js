import { collectCorporate, CORPORATE_COMPANIES } from "../server/scrapers/corporate.js";
if (process.env.SMARTRECRUITERS_REUSE_AUTHORIZED !== "true") {
  console.error("Live requests disabled pending documented authorization for this use");
  process.exit(1);
}
const companies = CORPORATE_COMPANIES.filter(c => !c.provider || c.provider === "smartrecruiters");
const result = await collectCorporate([], { enabled: true, companies });
console.log(JSON.stringify(result, null, 2));
// The pilot has independently verified public vacancies in Patras on 2026-11-24.
// During initial validation, zero needs investigation rather than a green deployment signal.
for (const company of companies) {
  const s = result.sourceStats["corporate:" + company.id];
  if (s?.status !== "success" || s.scraped_count === 0) {
    console.error(company.name + ": pilot validation inconclusive; expected at least one local vacancy");
    process.exitCode = 1;
  }
}
