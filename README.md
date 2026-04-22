# WorkInPάτρα

> A job aggregator for the city of Patra, Greece — pulling listings from multiple job boards into one clean, fast interface.

🔗 **Live:** [workinpatra.gr](https://workinpatra.gr)

---

## What it does

WorkInPάτρα scrapes job listings from four major Greek job boards and presents them in a single responsive UI, filtered to the Patra area. No ads, no registration, no tracking.

**Sources:**
- [JobFind.gr](https://www.jobfind.gr)
- [Kariera.gr](https://www.kariera.gr)
- [XE.gr](https://www.xe.gr/ergasia)
- [Indeed.gr](https://gr.indeed.com)

---

## Features

- **Aggregated listings** from 4 sources in one place
- **Keyword-based categorization** — 11 job categories auto-detected from title + tags
- **Date filtering** — last 7 or 30 days (30-day default)
- **"Νέο" badge** — highlights listings posted today
- **Source filtering** — toggle individual sites on/off
- **Live search** — filter by title or company name
- **Deduplication** — same job appearing on multiple sites is shown once
- **Responsive design** — works on desktop and mobile (iOS/Android)
- **Auto-refresh** — scraper runs twice daily via GitHub Actions
- **SEO optimized** — meta tags, Open Graph, JSON-LD structured data
- **Zero tracking** — no cookies, no analytics, no user data collection

---

## Architecture

```
┌──────────────────────────┐
│   GitHub Actions (cron)  │  — runs every 12 hours
│   • scrapes 4 sites      │
│   • writes jobs.json     │
│   • commits + pushes     │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│   GitHub repo (main)     │  ← data/jobs.json is committed here
└────────────┬─────────────┘
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
│   └── scrape.yml          # GitHub Actions workflow (every 12h)
├── data/
│   └── jobs.json           # Scraped data (auto-updated)
├── scripts/
│   └── scrape.js           # Standalone scraper for GH Actions
└── server/
    ├── index.js            # Express server (local dev only)
    ├── cache.js            # In-memory cache
    ├── categorize.js       # Keyword-based job categorizer
    └── scrapers/
        ├── _shared.js      # Playwright helper + Greek date parser
        ├── jobfind.js
        ├── kariera.js
        ├── xe.js
        └── indeed.js
```

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
- **Every 12 hours** → GitHub Actions runs the scraper, commits the updated `data/jobs.json`, triggers a Netlify redeploy

To manually trigger a scrape: GitHub → Actions tab → "Scrape Jobs" → "Run workflow".

**Cost:** $0 — GitHub Actions free tier + Netlify free tier is more than enough.

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
- **Indeed** does not show post dates on result cards → we default to "Σήμερα"
- Scraper selectors may break if source sites update their HTML — monitor GitHub Actions for failures
- Category detection is ~80% accurate (keyword heuristic, not ML)

---

## Contributing

Found a bug, miscategorization, or want a feature? Open a [GitHub Issue](https://github.com/NikosPaschalis/workInPatra/issues).

---

## License

MIT — do whatever you want, just don't pretend you built it.
