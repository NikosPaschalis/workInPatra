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
  const now = new Date();

  if (s.includes("σήμερα") || s.includes("today")) return now.toISOString();

  if (s.includes("χθες") || s.includes("yesterday")) {
    const d = new Date(now); d.setDate(d.getDate() - 1); return d.toISOString();
  }

  const daysMatch = s.match(/(\d+)\s*(μέρ|ημέρ|day)/);
  if (daysMatch) {
    const d = new Date(now); d.setDate(d.getDate() - parseInt(daysMatch[1])); return d.toISOString();
  }

  const weeksMatch = s.match(/(\d+)\s*(εβδ|week)/);
  if (weeksMatch) {
    const d = new Date(now); d.setDate(d.getDate() - parseInt(weeksMatch[1]) * 7); return d.toISOString();
  }

  const monthsMatch = s.match(/(\d+)\s*(μήν|month)/);
  if (monthsMatch) {
    const d = new Date(now); d.setMonth(d.getMonth() - parseInt(monthsMatch[1])); return d.toISOString();
  }

  // dd/mm/yyyy or dd-mm-yyyy
  const dateMatch = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dateMatch) {
    return new Date(`${dateMatch[3]}-${dateMatch[2].padStart(2,"0")}-${dateMatch[1].padStart(2,"0")}`).toISOString();
  }

  return now.toISOString(); // fallback: treat as today
}
