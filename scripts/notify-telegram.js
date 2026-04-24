// Send a Telegram notification about newly-added jobs.
//
// Usage (called from .github/workflows/scrape.yml after the scraper runs):
//   node scripts/notify-telegram.js <previousJobsJsonPath>
//
// Diffs the previous snapshot against the fresh data/jobs.json by URL and
// posts a short message to the channel if any jobs were added.
//
// Requires env vars: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
// Silently exits 0 if either is missing (so the workflow doesn't fail on forks).

import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JOBS_PATH = path.join(__dirname, "..", "data", "jobs.json");
const SITE_URL  = "https://workinpatras.netlify.app";
const MAX_JOBS_IN_MESSAGE = 3;

const CATEGORY_EMOJI = {
  tech: "💻", sales: "🛒", hospitality: "🍽", health: "🏥",
  logistics: "🚛", admin: "📋", retail: "🏪", construction: "🔧",
  education: "📚", other: "📌",
};

const CATEGORY_LABEL = {
  tech: "Πληροφορική", sales: "Πωλήσεις", hospitality: "Εστίαση & Τουρισμός",
  health: "Υγεία & Φαρμακείο", logistics: "Μεταφορές & Αποθήκη",
  admin: "Διοίκηση & Λογιστική", retail: "Λιανική & Εξυπηρέτηση",
  construction: "Τεχνικά & Κατασκευές", education: "Εκπαίδευση", other: "Άλλα",
};

// HTML-escape for Telegram parse_mode=HTML
function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatMessage(jobs) {
  const count = jobs.length;

  const header = count === 1
    ? `🆕 <b>Μόλις μπήκε 1 ΝΕΑ θέση εργασίας στην Πάτρα</b>`
    : `🆕 <b>Μόλις μπήκαν ${count} ΝΕΕΣ θέσεις εργασίας στην Πάτρα</b>`;

  const shown = jobs.slice(0, MAX_JOBS_IN_MESSAGE);
  const lines = shown.map(j => {
    const emoji = CATEGORY_EMOJI[j.category] || "📌";
    const catLabel = CATEGORY_LABEL[j.category] || "Άλλα";
    const title = esc(j.title);
    const company = j.company ? esc(j.company) : "—";
    const url = j.url || SITE_URL;
    return `${emoji} <a href="${esc(url)}">${title}</a>\n<i>${company} · ${esc(catLabel)}</i>`;
  });

  const remaining = count - shown.length;
  const moreLine = remaining > 0
    ? `➕ <b>${remaining}</b> ${remaining === 1 ? "νέα ακόμη" : "νέες ακόμη"} στο site`
    : "";

  const footer = `📍 <a href="${SITE_URL}">Δες όλες τις αγγελίες →</a>`;

  return [header, "", ...lines.map(l => l + "\n"), moreLine, "", footer]
    .join("\n")
    .slice(0, 4000); // Telegram hard limit is 4096 — stay safe
}

async function send(text) {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log("⏭  Telegram secrets not set — skipping notification");
    return;
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    console.error("❌ Telegram API error:", res.status, body);
    process.exit(1);
  }
  console.log(`✅ Sent message ${body.result?.message_id} to ${chatId}`);
}

function loadJobs(p) {
  if (!existsSync(p)) return [];
  try {
    const data = JSON.parse(readFileSync(p, "utf-8"));
    return data.jobs || [];
  } catch {
    return [];
  }
}

async function main() {
  const oldPath = process.argv[2];
  if (!oldPath) {
    console.error("Usage: notify-telegram.js <previousJobsJsonPath>");
    process.exit(1);
  }

  const oldJobs = loadJobs(oldPath);
  const newJobs = loadJobs(JOBS_PATH);

  const oldUrls = new Set(oldJobs.map(j => j.url).filter(Boolean));
  const added   = newJobs.filter(j => j.url && !oldUrls.has(j.url));

  console.log(`Old: ${oldJobs.length} · New: ${newJobs.length} · Added: ${added.length}`);

  if (added.length === 0) {
    console.log("⏭  No new jobs — skipping notification");
    return;
  }

  // Newest first in the message
  added.sort((a, b) => new Date(b.date) - new Date(a.date));
  await send(formatMessage(added));
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
