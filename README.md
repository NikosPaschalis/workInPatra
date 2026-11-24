# WorkInPάτρα

> A job aggregator for the city of Patra, Greece — pulling listings from multiple Greek job boards into one clean, fast interface.

🔗 **Live:** [www.workinpatras.gr/](https://www.workinpatras.gr/)
📣 **Telegram channel:** [t.me/workinpatras](https://t.me/workinpatras) — auto-posts every new listing
📘 **Facebook page:** [WorkInPάτρα on Facebook](https://www.facebook.com/profile.php?id=61591577415179) — auto-posts new-listing summaries

---

## What it does

WorkInPάτρα collects job listings from three major Greek job boards and presents them in a single responsive UI filtered to the Patra area. Listings arrive through two controlled paths: scheduled GitHub Actions scrapes and an optional Windows desktop companion for local collection, human review, and queued publication. No ads, no registration, no visitor tracking.

**Sources:**
- [JobFind.gr](https://www.jobfind.gr)
- [Kariera.gr](https://www.kariera.gr)
- [XE.gr](https://www.xe.gr/ergasia)

---

## Features

- **Aggregated listings** from 3 sources in one place
- **Two ingestion paths** — scheduled cloud scraping plus reviewed local desktop submissions
- **Source-aware categorization** — 10 common categories mapped from each site's original category, with title/tag fallback
- **Date filtering** — last 7 or 30 days (30-day default)
- **"Νέο" badge** — highlights listings posted today
- **Source filtering** — toggle individual sites on/off
- **Search-first filtering** — prominent live search, explicit 7/30-day ranges, quick categories, and expandable source/category filters
- **Multi-select categories + frequent-search chips** with active state and one-click filter reset
- **Greek-friendly live search** — filter by title, company, or tags without requiring accents
- **Deduplication** — same job appearing on multiple sites is shown once
- **Responsive design** — works on desktop and mobile (iOS/Android)
- **Auto-refresh** — scraper runs twice daily via GitHub Actions
- **Resilient source updates** — if one scraper fails, its last published jobs are preserved
- **Electron review companion** — run sources independently, inspect results, approve/reject listings, and retain drafts locally
- **Interactive Kariera capture** — open the Patra results in a restricted Electron window, complete any Cloudflare verification manually, save the rendered HTML, and process it locally with the existing Kariera parser
- **Live duplicate protection** — compare review items with published and queued GitHub data before upload, then revalidate immediately before writing
- **Queued desktop publishing** — verified jobs are written only to `data/manual-pending.json`; the scheduled workflow merges them into the public dataset and sends notifications
- **Secure GitHub authentication** — fine-grained token support with optional Windows DPAPI-backed storage
- **Social notifications** — new listings auto-post to Telegram and Facebook
- **SEO optimized** — meta tags, Open Graph, JSON-LD structured data
- **Zero tracking** — no cookies, no analytics, no user data collection

---

## Architecture

```text
Scheduled path                         Reviewed desktop path
┌─────────────────────────┐            ┌──────────────────────────────┐
│ GitHub Actions (2× day) │            │ Electron desktop companion  │
│ scrape JobFind/Kariera/ │            │ • local source workers       │
│ XE independently        │            │ • visible Kariera window     │
└────────────┬────────────┘            │ • HTML snapshot + review     │
             │                         └──────────────┬───────────────┘
             │                                        │ approved only
             │                         ┌──────────────▼───────────────┐
             │                         │ data/manual-pending.json     │
             │                         └──────────────┬───────────────┘
             └──────────────────────────────┬─────────┘
                                            ▼
                               ┌──────────────────────────┐
                               │ data/jobs.json on main   │
                               │ dedupe + history ledgers │
                               └────────────┬─────────────┘
                                            │
                     ┌──────────────────────┼──────────────────────┐
                     ▼                      ▼                      ▼
               Netlify site          Telegram channel       Facebook page
```

The production site has no always-on application server and no database. GitHub remains the publishing boundary for both ingestion paths.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Scraping | [Playwright](https://playwright.dev/) (Node.js) — handles JS-rendered sites |
| Desktop companion | [Electron](https://www.electronjs.org/) + Electron Forge (Windows x64) |
| Desktop publishing | GitHub Contents API + fine-grained personal access token |
| Local credential protection | Electron `safeStorage` / Windows DPAPI |
| Scheduler | GitHub Actions (cron) |
| Notifications | Telegram Bot API + Facebook Graph API |
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
├── client-utils.js         # Search, date-window, and sorting helpers
├── package.json            # Root deps (for GitHub Actions)
├── forge.config.js         # Electron packaging and Windows makers
├── netlify.toml            # Netlify config
├── apps/
│   └── desktop-scraper/    # Electron main/preload/renderer/worker code
├── .github/workflows/
│   ├── scrape.yml          # GitHub Actions workflow (every 12h)
│   ├── test.yml            # Automated regression suite
│   ├── kariera-live-smoke.yml # Controlled live Kariera check
│   ├── snapshot.yml        # Monthly dataset snapshots
│   └── test-telegram.yml   # Manual Telegram smoke test
├── data/
│   ├── jobs.json           # Scraped data (auto-updated)
│   ├── manual-pending.json # Reviewed desktop submissions awaiting workflow merge
│   ├── kariera-pending.json # Backward-compatible curated Kariera queue
│   ├── observations.jsonl  # Listing observation history
│   ├── scrape-runs.jsonl   # Per-run source outcomes
│   ├── kariera-html-snapshots/ # Local-only rendered snapshots (gitignored)
│   └── snapshots/          # Monthly historical snapshots
├── scripts/
│   ├── scrape.js           # Standalone scraper for GH Actions
│   ├── merge-source-results.js # Per-source failure fallback
│   ├── apply-manual-pending.js # Validate/merge/clear desktop queue
│   ├── manual-queue.js     # Manual queue validation and deduplication
│   ├── snapshot.js         # Monthly snapshot generator
│   ├── notify-telegram.js  # Diffs jobs and posts to Telegram/Facebook
│   └── notify-direct-jobs.js # Direct-employer notification pass
├── test/                   # Node.js regression tests
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

## Social Notifications

Whenever the scrape finds new URLs that were not in the previous `data/jobs.json`, the workflow runs `scripts/notify-telegram.js`, which posts Greek-language summaries to the [Telegram channel](https://t.me/workinpatras) and the [Facebook page](https://www.facebook.com/profile.php?id=61591577415179). The data commit happens first, so a social API failure cannot prevent fresh jobs from being published.

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

**Telegram setup (for forks):**
1. Create a bot via [@BotFather](https://t.me/BotFather), copy the token.
2. Create a public channel, add the bot as **admin** with post permission.
3. Get the channel ID (e.g. `@workinpatras` or numeric `-100…`).
4. In **Repo → Settings → Secrets and variables → Actions**, add:
   - `TELEGRAM_BOT_TOKEN` — bot token from BotFather
   - `TELEGRAM_CHAT_ID` — channel username with `@` or numeric ID
5. Smoke test: **Actions** tab → **Test Telegram** → **Run workflow**.

If either secret is missing the notify step exits cleanly without breaking the scrape — forks keep working without Telegram.

**Facebook setup (optional):**

1. Create or use a Facebook Page and a Meta app with permission to publish to it.
2. Generate a Page access token and obtain the Page ID.
3. In **Repo → Settings → Secrets and variables → Actions**, add:
   - `FACEBOOK_PAGE_TOKEN` — Page access token
   - `FACEBOOK_PAGE_ID` — Facebook Page ID

Telegram and Facebook are independent: if one channel is not configured or temporarily fails, the other still gets a chance to publish. The workflow marks notification errors without rolling back the already-committed job data.

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
      "sourceCategory": "IT",
      "category": "tech"
    }
  ],
  "lastFetched": "2026-04-21T06:00:00.000Z"
}
```

`date` is an ISO timestamp when the source date can be parsed safely; otherwise it is `null`. Unknown dates are not labelled as “Νέο” and sort after dated listings.

---

## Job Categories

The original category is preserved in `sourceCategory`. It is mapped to one of
the common categories below; title and tags are used only when the source value
is missing, unknown, or too generic.

| ID | Label |
|---|---|
| `sales` | Πωλήσεις & Λιανική |
| `hospitality` | Εστίαση & Τουρισμός |
| `admin` | Γραφείο, Διοίκηση & Οικονομικά |
| `construction` | Τεχνικά Επαγγέλματα & Κατασκευές |
| `tech` | Πληροφορική & Digital |
| `logistics` | Logistics, Παραγωγή & Οδήγηση |
| `health` | Υγεία & Φροντίδα |
| `education` | Εκπαίδευση |
| `marketing` | Marketing & Δημιουργικά |
| `other` | Λοιπά & Υπηρεσίες |

Unknown source categories automatically fall back to normalized title/tag matching.

---

## Running Locally

**Prerequisites:** Node.js 18+ and Windows x64 for the packaged desktop companion.

### Website and scheduled scraper

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

### Electron desktop companion

```powershell
npm ci
npm run desktop:install-browser
npm run desktop:start
```

Create an unpacked app or Windows installer/ZIP artifacts with:

```powershell
npm run desktop:package
npm run desktop:make
```

Build output is written under `out/`. The unpacked executable is
`out/WorkInPatra Desktop Scraper-win32-x64/WorkInPatraScraper.exe`.

The normal Kariera workflow is intentionally user-driven:

1. Open the restricted **Kariera window** from the desktop app.
2. Complete any visible Cloudflare verification manually and wait for the Patra results page to finish loading.
3. Return to the main window and select **Save & process Kariera snapshot**.
4. The rendered HTML is saved under `data/kariera-html-snapshots/` and parsed locally without a second network request.
5. Inspect the normalized listings, then explicitly approve or reject them.
6. Authenticate with a fine-grained GitHub token and push approved jobs to `data/manual-pending.json`.
7. The next `Scrape Jobs` workflow validates and merges the queue into `data/jobs.json`, then runs the normal notification batch.

The token should be restricted to `NikosPaschalis/workInPatra` with only
**Contents: Read and write**. Persistent storage is optional and uses Electron
`safeStorage` with Windows DPAPI. The desktop app never writes directly to
`data/jobs.json`, starts a production workflow, or sends social notifications.

Kariera is selected by default; JobFind and XE remain available for manual use
but start unchecked. Drafts, approvals, failed uploads, and activity history are
stored in Electron's local application-data directory so a restart does not
discard review work.

See [the desktop companion guide](apps/desktop-scraper/README.md) for the full
security model, queue behavior, tests, packaging details, and troubleshooting.

---

## Deployment

The repo is wired up to deploy automatically:

- **Push to `main`** → Netlify redeploys the static site
- **Every 12 hours** → GitHub Actions runs the source scrapers, preserves the previous listings of any temporarily failed source, validates and applies the curated/manual queues, commits the resulting dataset and queue state, triggers a Netlify redeploy, and then posts consolidated summaries to Telegram and Facebook

To manually trigger a scrape: GitHub → Actions tab → "Scrape Jobs" → "Run workflow".

**Cost:** $0 — GitHub Actions, Netlify, Telegram Bot API, and Facebook Graph API are used within their free allowances.

---

## Privacy & Legal

- **No cookies, no analytics, no tracking.** The site collects nothing about visitors.
- **No copied job descriptions** — the public dataset stores normalized listing metadata and links visitors to the original posting.
- **Local desktop snapshots stay local** — rendered Kariera HTML is stored in a gitignored project folder and is never uploaded by the app.
- See [Privacy Policy](./privacy.html) and [Terms of Use](./terms.html).

Scraping publicly available data can involve legal and platform-policy considerations. The project runs on a limited twice-daily schedule and always attributes and links back to the original source.

---

## Known Limitations

- **Kariera.gr** premium company listings link to the company page rather than individual job ads (platform limitation)
- **Kariera interactive capture** can require a manual Cloudflare verification. The desktop app detects challenge pages but does not solve, bypass, or automatically retry them.
- **JobFind.gr** hides company names for anonymous listings by design
- **Indeed.gr** was previously a source but has been removed — Cloudflare anti-bot challenges the scraper from datacenter IPs (GitHub Actions), returning 0 jobs in production
- Scraper selectors may break if source sites update their HTML — monitor GitHub Actions for failures
- When one source fails or unexpectedly returns no jobs, its previous listings are retained until a successful run replaces them; workflow logs identify the stale source
- Unrecognised or invalid source dates are stored as `null` instead of being guessed
- Category detection is ~80% accurate (keyword heuristic, not ML)
- The packaged desktop companion is currently built and verified only for Windows x64; release artifacts are not code-signed.

---

## Contributing

Found a bug, miscategorization, or want a feature? Open a [GitHub Issue](https://github.com/NikosPaschalis/workInPatra/issues).

---

## License

MIT — do whatever you want, just don't pretend you built it.
