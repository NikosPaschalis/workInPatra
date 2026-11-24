import { categorize } from "./categorize.js";
import { normalizeText } from "../scripts/job-identity.js";

// Subcategories complement (never replace) the historical ten-category schema.
// Rules are ordered by specificity; titles are tested before generic ATS function labels.
export const CORPORATE_ROLE_RULES = [
  ["semiconductor", "Μικροηλεκτρονική & Hardware", "tech", /semiconductor|analog|asic|fpga|silicon|chip design|integrated circuit|field applications engineer|hardware|vlsi|rtl|physical design/],
  ["cybersecurity", "Cybersecurity", "tech", /cyber|security analyst|security engineer|vulnerability|\bsoc\b/],
  ["data-ai", "Data & AI", "tech", /data engineer|data scien|data analyst|machine learning|computer vision|\bai\b|\bml\b|business intelligence|power bi/],
  ["cloud-devops", "Cloud & DevOps", "tech", /devops|cloud|site reliability|infrastructure|platform engineer/],
  ["software", "Software & IT", "tech", /software|developer|programmer|frontend|front.end|backend|back.end|embedded|application support|it support|\bqa\b|software test|sap|erp/],
  ["research", "Έρευνα & Ανάπτυξη", "tech", /research|r&d|bioinformatics|researcher/],
  ["consulting", "Consulting & Project Management", "admin", /consultant|consulting|business analyst|project manager|project management|delivery lead/],
  ["finance", "Finance & Audit", "admin", /finance|accountant|accounting|audit|tax|λογιστ/],
  ["hr", "Human Resources", "admin", /human resources|talent acquisition|\bhr\b|payroll/],
  ["field-data", "Συλλογή δεδομένων πεδίου", "logistics", /data collector|field data collection|field surveyor|surveyor/],
  ["operations", "Operations & Supply Chain", "logistics", /operations|supply chain|manufacturing|production|logistics|warehouse/],
  ["marketing", "Marketing & Communication", "marketing", /marketing|communication|creative/],
  ["sales", "Sales & Business Development", "sales", /sales|business development|account manager/],
  ["technical-writing", "Τεχνική τεκμηρίωση", "admin", /technical author|technical writer|technical documentation(?! engineer)/],
  ["engineering", "Engineering", "construction", /engineer|μηχανικ|technician|electrical|mechanical|industrial designer|technical illustration/],
];
export function categorizeCorporateRole(title, sourceCategory = "") {
  const match = CORPORATE_ROLE_RULES.find(r => r[3].test(normalizeText(title))) ||
    CORPORATE_ROLE_RULES.find(r => r[3].test(normalizeText(sourceCategory)));
  if (match) return { subcategory: match[0], subcategoryLabel: match[1], category: match[2] };
  return { subcategory: "other", subcategoryLabel: "Λοιπές ειδικότητες", category: categorize(title, [sourceCategory]) };
}
