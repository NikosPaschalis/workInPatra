import { chromium } from "playwright";

export async function withBrowser(fn) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    locale: "el-GR",
  });
  const page = await context.newPage();
  try {
    return await fn(page);
  } finally {
    await browser.close();
  }
}

// Normalizes Greek relative dates → ISO string
export function parseGreekDate(str) {
  if (!str) return null;
  const s = str.trim().toLowerCase();

  // Always work at midnight UTC so stored dates are clean calendar days
  function midnight(d) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
  }

  const now = new Date();

  if (s.includes("σήμερα") || s.includes("today")) return midnight(now);

  if (s.includes("χθες") || s.includes("yesterday")) {
    const d = new Date(now); d.setUTCDate(d.getUTCDate() - 1); return midnight(d);
  }

  const daysMatch = s.match(/(\d+)\s*(μέρ|ημέρ|day)/);
  if (daysMatch) {
    const d = new Date(now); d.setUTCDate(d.getUTCDate() - parseInt(daysMatch[1])); return midnight(d);
  }

  const weeksMatch = s.match(/(\d+)\s*(εβδ|week)/);
  if (weeksMatch) {
    const d = new Date(now); d.setUTCDate(d.getUTCDate() - parseInt(weeksMatch[1]) * 7); return midnight(d);
  }

  const monthsMatch = s.match(/(\d+)\s*(μήν|month)/);
  if (monthsMatch) {
    const d = new Date(now); d.setUTCMonth(d.getUTCMonth() - parseInt(monthsMatch[1])); return midnight(d);
  }

  // dd/mm/yyyy or dd-mm-yyyy
  const dateMatch = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dateMatch) {
    return new Date(`${dateMatch[3]}-${dateMatch[2].padStart(2,"0")}-${dateMatch[1].padStart(2,"0")}`).toISOString();
  }

  return midnight(now); // fallback: treat as today
}
