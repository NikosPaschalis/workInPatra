// Send a Telegram notification about new jobs.
//
// Modes:
//   node scripts/notify-telegram.js preview        → format + send using N latest jobs
//                                                     from data/jobs.json (for visual testing)
//   node scripts/notify-telegram.js diff <oldPath> → compare oldPath vs data/jobs.json,
//                                                     send only if new jobs exist
//
// Requires env vars: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
// Silently exits 0 if either is missing (so workflow doesn't fail on forks).

import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JOBS_PATH = path.join(__dirname, "..", "data", "jobs.json");
const SITE_URL  = "https://workinpatras.netlify.app";
const MAX_JOBS_IN_MESSAGE = 10;

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

function formatMessage(jobs, isPreview) {
  const count = jobs.length;
  const header = isPreview
    ? `🧪 <b>PREVIEW — έτσι θα φαίνονται ${count} νέες αγγελίες</b>`
    : `🆕 <b>${count} ${count === 1 ? "νέα αγγελία" : "νέες αγγελίες"} εργασίας στην Πάτρα</b>`;

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
  const moreLine = remaining > 0 ? `\n<i>…και ${remaining} ακόμα</i>` : "";

  const footer = `\n📍 <a href="${SITE_URL}">Δες όλες τις αγγελίες →</a>`;

  return [header, "", ...lines.map(l => l + "\n"), moreLine, footer]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000); // Telegram hard limit 4096 — stay safe
}

async function send(text) {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log("⏭  Telegram secrets not set — skipping notification");
    return { skipped: true };
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
  return { ok: true };
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
  const mode = process.argv[2];

  if (mode === "preview") {
    const all = loadJobs(JOBS_PATH);
    if (all.length === 0) {
      console.log("No jobs in data/jobs.json — nothing to preview");
      return;
    }
    // Pick up to 5 most recent jobs for the preview
    const sorted = [...all].sort((a, b) => new Date(b.date) - new Date(a.date));
    const sample = sorted.slice(0, 5);
    const text = formatMessage(sample, true);
    console.log("Preview message:\n", text);
    await send(text);
    return;
  }

  if (mode === "diff") {
    const oldPath = process.argv[3];
    if (!oldPath) {
      console.error("Usage: notify-telegram.js diff <oldJobsPath>");
      process.exit(1);
    }
    const oldJobs = loadJobs(oldPath);
    const newJobs = loadJobs(JOBS_PATH);

    const oldUrls = new Set(oldJobs.map(j => j.url).filter(Boolean));
    const added = newJobs.filter(j => j.url && !oldUrls.has(j.url));

    console.log(`Old: ${oldJobs.length} jobs · New: ${newJobs.length} jobs · Added: ${added.length}`);

    if (added.length === 0) {
      console.log("⏭  No new jobs — skipping notification");
      return;
    }

    // Sort by date (newest first) for the message
    added.sort((a, b) => new Date(b.date) - new Date(a.date));
    const text = formatMessage(added, false);
    await send(text);
    return;
  }

  console.error("Unknown mode. Use: preview | diff <oldPath>");
  process.exit(1);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
