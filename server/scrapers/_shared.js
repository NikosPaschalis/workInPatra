import { chromium } from "playwright";

export const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export async function withBrowser(fn) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    locale: "el-GR",
    viewport: { width: 1920, height: 1080 },
    extraHTTPHeaders: { "Accept-Language": "el-GR,el;q=0.9,en-US;q=0.8,en;q=0.7" },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "languages", { get: () => ["el-GR", "el", "en-US", "en"] });
    Object.defineProperty(navigator, "plugins", { get: () => [{ name: "PDF Viewer" }, { name: "Chrome PDF Viewer" }] });
    window.chrome = { runtime: {} };
  });
  const page = await context.newPage();
  try {
    return await fn(page);
  } finally {
    await browser.close();
  }
}

// Normalizes Greek relative dates → ISO string
export function parseGreekDate(str, now = new Date()) {
  if (!str) return null;
  const s = str.trim().toLowerCase();

  // Always work at midnight UTC so stored dates are clean calendar days
  function midnight(d) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
  }

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
    const d = new Date(now);
    const originalDay = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - parseInt(monthsMatch[1]));
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(originalDay, lastDay));
    return midnight(d);
  }

  // dd/mm/yyyy or dd-mm-yyyy
  const dateMatch = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dateMatch) {
    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const year = Number(dateMatch[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      month >= 1 && month <= 12 &&
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    ) {
      return parsed.toISOString();
    }
    return null;
  }

  return null;
}
