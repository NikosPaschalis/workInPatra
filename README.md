# WorkInPάτρα

> A job aggregator for the city of Patra, Greece — pulling listings from multiple job boards into one clean, fast interface.

---

## What it does

WorkInPάτρα scrapes job listings from three major Greek job boards and presents them in a single responsive UI, filtered to the Patra area. No ads, no registration, no noise.

**Sources:**
- [JobFind.gr](https://www.jobfind.gr)
- [Kariera.gr](https://www.kariera.gr)
- [XE.gr](https://www.xe.gr/ergasia)

---

## Features

- **Aggregated listings** from 3 sources in one place
- **Keyword-based categorization** — 10 job categories auto-detected from title + tags
- **Date filtering** — last 7 or 30 days
- **Source filtering** — toggle individual sites on/off
- **Live search** — filter by title or company name
- **Deduplication** — same job appearing on multiple sites is shown once
- **Responsive design** — works on desktop and mobile (iOS/Android)
- **In-memory cache** — scraping result cached for 6 hours, instant subsequent loads
- **SEO optimized** — meta tags, Open Graph, JSON-LD structured data

---

## Tech Stack

| Layer | Technology |
|---|---|
| Scraping | [Playwright](https://playwright.dev/) (Node.js) — handles JS-rendered sites |
| Server | [Express.js](https://expressjs.com/) |
| Cache | In-memory (no database needed) |
| Frontend | Vanilla HTML / CSS / JavaScript |
| Fonts | Inter (Google Fonts) |

---

## Project Structure

```
workinpatra/
├── index.html          # Frontend entry point
├── style.css           # All styles (responsive)
├── app.js              # Frontend logic (fetch, filter, render)
└── server/
    ├── package.json
    ├── index.js        # Express server + API routes
    ├── cache.js        # In-memory TTL cache (6h)
    ├── categorize.js   # Keyword-based job categorizer
    └── scrapers/
        ├── _shared.js  # Playwright helper + Greek date parser
        ├── jobfind.js  # JobFind scraper
        ├── kariera.js  # Kariera scraper
        └── xe.js       # XE scraper
```

---

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/jobs` | Returns cached jobs (scrapes if cache is empty or expired) |
| `GET /api/refresh` | Forces a fresh scrape from all sources |

### Response format

```json
{
  "jobs": [
    {
      "title": "Frontend Developer",
      "company": "TechHub Patra",
      "date": "2026-04-19T08:00:00.000Z",
      "dateRaw": "πριν 2 μέρες",
      "tags": ["React", "Full-time"],
      "url": "https://www.kariera.gr/...",
      "source": "kariera",
      "category": "tech"
    }
  ],
  "lastFetched": "2026-04-21T09:15:00.000Z"
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
cd server
npm install

# 2. Install Playwright browser
npx playwright install chromium

# 3. Start the server
npm run dev
# → http://localhost:3000
```

The first load triggers a scrape (~30–60 seconds). Subsequent loads are instant (served from cache).

---

## Deployment

### Recommended: GitHub Actions + Netlify

- GitHub Actions runs the scraper on a schedule and saves `jobs.json`
- Netlify serves the static frontend
- **Cost: $0**

### Alternative: Railway / Render

- Deploy the full Express server as a persistent process
- Playwright runs server-side on demand
- Railway: ~$1/month after 30-day trial
- Render: free tier available (spins down after 15min inactivity)

---

## Legal & Ethics

This project scrapes **publicly available** job listings (no login required) and always links back to the original source. It does not store personal data, does not sell data, and applies rate limiting to avoid server load.

Scraping may violate the Terms of Service of the source websites. Use responsibly.

---

## Known Limitations

- **Kariera.gr** premium company listings link to the company page rather than individual job ads (platform limitation)
- **JobFind.gr** hides company names for anonymous listings by design
- Scraper selectors may break if source sites update their HTML structure
- Category detection is ~80% accurate — keyword-based heuristic, not ML

---

## License

MIT — do whatever you want, just don't pretend you built it.
