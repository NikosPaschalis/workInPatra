import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newContext({
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  locale: "el-GR",
}).then(c => c.newPage());

await page.goto("https://gr.indeed.com/jobs?q=&l=%CE%A0%CE%AC%CF%84%CF%81%CE%B1&sort=date", {
  waitUntil: "domcontentloaded", timeout: 30000
});
await page.waitForTimeout(3000);

const result = await page.evaluate(() => {
  const cards = document.querySelectorAll("div.job_seen_beacon");
  return {
    totalCards: cards.length,
    firstCardAllSpans: Array.from(cards[0]?.querySelectorAll("span") || [])
      .map(s => ({ class: s.className, text: s.innerText.trim().slice(0,60) }))
      .filter(s => s.text),
    firstCardAllDivs: Array.from(cards[0]?.querySelectorAll("[class*='date'],[class*='Date'],[class*='ago'],[class*='posted']") || [])
      .map(el => ({ tag: el.tagName, class: el.className, text: el.innerText.trim().slice(0,60) })),
  };
});

console.log("Total cards found:", result.totalCards);
console.log("\nAll spans in first card:");
result.firstCardAllSpans.forEach(s => console.log(`  .${s.class.slice(0,40)} → "${s.text}"`));
console.log("\nDate-related elements:");
result.firstCardAllDivs.forEach(d => console.log(`  ${d.tag}.${d.class.slice(0,40)} → "${d.text}"`));

await browser.close();
