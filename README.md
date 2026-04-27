# WorkInPάτρα

> A job aggregator for the city of Patra, Greece — pulling listings from multiple Greek job boards into one clean, fast interface.

🔗 **Live:** [workinpatras.netlify.app](https://workinpatras.netlify.app/)
📣 **Telegram channel:** [t.me/workinpatras](https://t.me/workinpatras) — auto-posts every new listing

---

## What it does

WorkInPάτρα scrapes job listings from three major Greek job boards and presents them in a single responsive UI, filtered to the Patra area. No ads, no registration, no tracking. Whenever a new listing appears, a Telegram bot drops a notification into the public channel.

**Sources:**
- [JobFind.gr](https://www.jobfind.gr)
- [Kariera.gr](https://www.kariera.gr)
- [XE.gr](https://www.xe.gr/ergasia)

---

## Features

- **Aggregated listings** from 3 sources in one place
- **Keyword-based categorization** — 11 job categories auto-detected from title + tags
- **Date filtering** — last 7 or 30 days (30-day default)
- **"Νέο" badge** — highlights listings posted today
- **Source filtering** — toggle individual sites on/off
- **Multi-select categories + popular-keyword chips** with active state and clear (×) button
- **Live search** — filter by title or company name
- **Deduplication** — same job appearing on multiple sites is shown once
- **Responsive design** — works on desktop and mobile (iOS/Android)
- **Auto-refresh** — scraper runs twice daily via GitHub Actions
- **Telegram notifications** — new listings auto-post to a public channel
- **SEO optimized** — meta tags, Open Graph, JSON-LD structured data
- **Zero tracking** — no cookies, no analytics, no user data collection

---

## Architecture

```
┌──────────────────────────┐
│   GitHub Actions (cron)  │  — runs every 12 hours
│   • snapshot prev jobs   │
│   • scrape 3 sites       │
│   • write data/jobs.json │
│   • diff vs snapshot     │
│   • notify Telegram bot  │
│   • commit + push        │
└────────────┬─────────────┘
             │
             ├──────────────┐
             ▼              ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│   GitHub repo (main)     │  │   Telegram channel       │
│   data/jobs.json updates │  │   @workinpatras          │
└────────────┬─────────────┘  └──────────────────────────┘
             │
             ▼
┌──────────────────────────┐
│   Netlify (static host)  │  — auto-deploys on every push
│   • serves index.html    │
│   • serves jobs.json     │
└──────────────────────────┘
```

No always-on server. No database. No ongoing costs.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Scraping | [Playwright](https://playwright.dev/) (Node.js) — handles JS-rendered sites |
| Scheduler | GitHub Actions (cron) |
| Notifications | Telegram Bot API |
| Hosting | Netlify (static) |
| Frontend | Vanilla HTML / CSS / JavaScript |
| Local dev server | [Express.js](https://expressjs.com/) |
| Fonts | Inter (Google Fonts) |

---

## Project Structure

```
workinpatra/
├── index.html              # Main page
├── privacy.html            # Privacy policy
├── terms.html              # Terms of use
├── style.css               # All styles (responsive)
├── app.js                  # Frontend logic
├── package.json            # Root deps (for GitHub Actions)
├── netlify.toml            # Netlify config
├── .github/workflows/
│   ├── scrape.yml          # GitHub Actions workflow (every 12h)
│   └── test-telegram.yml   # Manual Telegram smoke test
├── data/
│   └── jobs.json           # Scraped data (auto-updated)
├── scripts/
│   ├── scrape.js           # Standalone scraper for GH Actions
│   └── notify-telegram.js  # Diffs old↔new jobs, posts to Telegram
└── server/
    ├── index.js            # Express server (local dev only)
    ├── cache.js            # In-memory cache
    ├── categorize.js       # Keyword-based job categorizer
    └── scrapers/
        ├── _shared.js      # Playwright helper + Greek date parser
        ├── jobfind.js
        ├── kariera.js
        └── xe.js
```

---

## Telegram Bot

Whenever the scrape finds new URLs that weren't in the previous `data/jobs.json`, the workflow fires `scripts/notify-telegram.js`, which posts a Greek-language summary to the public channel.

**Message format** (HTML, with link previews disabled):

```
🆕 Μόλις μπήκαν 5 ΝΕΕΣ θέσεις εργασίας στην Πάτρα

💻 Frontend Developer
   TechHub Patra · Πληροφορική

🛒 Πωλητής/τρια
   ΑΒ Βασιλόπουλος · Πωλήσεις

🍽 Σερβιτόρος/α
   Καφέ Πάτρας · Εστίαση & Τουρισμός

➕ 2 νέες ακόμη στο site

📍 Δες όλες τις αγγελίες →
```

Top 3 listings are shown inline; anything beyond that becomes a single overflow line.

**Setup (for forks):**
1. Create a bot via [@BotFather](https://t.me/BotFather), copy the token.
2. Create a public channel, add the bot as **admin** with post permission.
3. Get the channel ID (e.g. `@workinpatras` or numeric `-100…`).
4. In **Repo → Settings → Secrets and variables → Actions**, add:
   - `TELEGRAM_BOT_TOKEN` — bot token from BotFather
   - `TELEGRAM_CHAT_ID` — channel username with `@` or numeric ID
5. Smoke test: **Actions** tab → **Test Telegram** → **Run workflow**.

If either secret is missing the notify step exits cleanly without breaking the scrape — forks keep working without Telegram.

---

## Data Format

`data/jobs.json` shape:

```json
{
  "jobs": [
    {
      "title": "Frontend Developer",
      "company": "TechHub Patra",
      "date": "2026-04-19T00:00:00.000Z",
      "dateRaw": "πριν 2 μέρες",
      "tags": ["React", "Full-time"],
      "url": "https://www.kariera.gr/...",
      "source": "kariera",
      "category": "tech"
    }
  ],
  "lastFetched": "2026-04-21T06:00:00.000Z"
}
```

---

## Job Categories

Categories are assigned automatically using keyword matching against the job title and tags.

| ID | Label |
|---|---|
| `tech` | Πληροφορική |
| `marketing` | Marketing & Επικοινωνία |
| `sales` | Πωλήσεις |
| `hospitality` | Εστίαση & Τουρισμός |
| `health` | Υγεία & Φαρμακείο |
| `logistics` | Μεταφορές & Αποθήκη |
| `admin` | Διοίκηση & Λογιστική |
| `retail` | Λιανική & Εξυπηρέτηση |
| `construction` | Τεχνικά & Κατασκευές |
| `education` | Εκπαίδευση |
| `other` | Άλλα |

> ⚠️ Category detection is keyword-based and experimental — some jobs may be miscategorized.

---

## Running Locally

**Prerequisites:** Node.js 18+

```bash
# 1. Install dependencies
npm install

# 2. Install Playwright browser
npx playwright install chromium

# 3a. Run the scraper once (writes data/jobs.json)
npm run scrape

# 3b. OR start the Express dev server (live on-demand scraping)
npm run dev
# → http://localhost:3000
```

---

## Deployment

The repo is wired up to deploy automatically:

- **Push to `main`** → Netlify redeploys the static site
- **Every 12 hours** → GitHub Actions runs the scraper, posts new jobs to Telegram, commits the updated `data/jobs.json`, triggers a Netlify redeploy

To manually trigger a scrape: GitHub → Actions tab → "Scrape Jobs" → "Run workflow".

**Cost:** $0 — GitHub Actions free tier + Netlify free tier + Telegram Bot API are more than enough.

---

## Privacy & Legal

- **No cookies, no analytics, no tracking.** The site collects nothing about visitors.
- **No data hosting** — we only link to the original job postings.
- See [Privacy Policy](./privacy.html) and [Terms of Use](./terms.html).

Scraping publicly-available data is a legal grey area but widely practiced. The project respects robots.txt where applicable, adds no server load via rate limiting, and always attributes + links back to the source.

---

## Known Limitations

- **Kariera.gr** premium company listings link to the company page rather than individual job ads (platform limitation)
- **JobFind.gr** hides company names for anonymous listings by design
- **Indeed.gr** was previously a source but has been removed — Cloudflare anti-bot challenges the scraper from datacenter IPs (GitHub Actions), returning 0 jobs in production
- Scraper selectors may break if source sites update their HTML — monitor GitHub Actions for failures
- Category detection is ~80% accurate (keyword heuristic, not ML)

---

## Contributing

Found a bug, miscategorization, or want a feature? Open a [GitHub Issue](https://github.com/NikosPaschalis/workInPatra/issues).

---

## License

MIT — do whatever you want, just don't pretend you built it.
