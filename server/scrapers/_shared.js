import { chromium } from "playwright";

export const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export async function withBrowser(fn) {
  const browser = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled"] });
  const context = await browser.newContext({
    userAgent: USER_AGENT, locale: "el-GR", viewport: { width: 1920, height: 1080 },
    extraHTTPHeaders: { "Accept-Language": "el-GR,el;q=0.9,en-US;q=0.8,en;q=0.7" },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "languages", { get: () => ["el-GR", "el", "en-US", "en"] });
    Object.defineProperty(navigator, "plugins", { get: () => [{ name: "PDF Viewer" }, { name: "Chrome PDF Viewer" }] });
    window.chrome = { runtime: {} };
  });
  const page = await context.newPage();
  try { return await fn(page); } finally { await browser.close(); }
}

export function parseGreekDate(str, now = new Date()) {
  if (!str) return null;
  const s = str.trim().toLowerCase();
  const midnight = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
  if (s.includes("σήμερα") || s.includes("today")) return midnight(now);
  if (s.includes("χθες") || s.includes("yesterday")) {
    const d = new Date(now); d.setUTCDate(d.getUTCDate() - 1); return midnight(d);
  }
  const hours = s.match(/(?:πριν από\s*)?(\d+)\s*(?:ώρ|ωρα|hour)/);
  if (hours) return midnight(new Date(now.getTime() - Number(hours[1]) * 3600000));
  const minutes = s.match(/(?:πριν από\s*)?(\d+)\s*(?:λεπτ|λεπτο|minute|min)/);
  if (minutes) return midnight(new Date(now.getTime() - Number(minutes[1]) * 60000));
  const days = s.match(/(\d+)\s*(μέρ|ημέρ|day)/);
  if (days) { const d = new Date(now); d.setUTCDate(d.getUTCDate() - Number(days[1])); return midnight(d); }
  const weeks = s.match(/(\d+)\s*(εβδ|week)/);
  if (weeks) { const d = new Date(now); d.setUTCDate(d.getUTCDate() - Number(weeks[1]) * 7); return midnight(d); }
  const months = s.match(/(\d+)\s*(μήν|month)/);
  if (months) {
    const d = new Date(now); const day = d.getUTCDate(); d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - Number(months[1]));
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last)); return midnight(d);
  }
  const match = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (match) {
    const day = Number(match[1]), month = Number(match[2]), year = Number(match[3]);
    const d = new Date(Date.UTC(year, month - 1, day));
    if (month >= 1 && month <= 12 && d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day) return d.toISOString();
  }
  return null;
}
