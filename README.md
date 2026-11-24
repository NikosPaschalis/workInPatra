# WorkInPάτρα

> An independent, free, non-commercial job discovery and local labour-market information project for Patras, Greece. Its priorities are useful information for job seekers, reliable historical data, and transparent methodology.

🔗 **Live:** [www.workinpatras.gr/](https://www.workinpatras.gr/)
📣 **Telegram channel:** [t.me/workinpatras](https://t.me/workinpatras) — posts eligible new-listing summaries
📘 **Facebook page:** [WorkInPάτρα on Facebook](https://www.facebook.com/profile.php?id=61591577415179) — auto-posts new-listing summaries

---

## What it does

WorkInPάτρα brings public job listings from Greek job boards, company career pages and directly provided employer vacancies into one responsive interface. It also publishes [monthly labour-market statistics](https://www.workinpatras.gr/report.html) for Patras and the surrounding area. There are no ads, visitor accounts, first-party visitor analytics or click-tracking scripts.

### Sources

| Source | Collection |
|---|---|
| [JobFind](https://www.jobfind.gr), [XE](https://www.xe.gr/ergasia) | Scheduled twice daily |
| [Kariera](https://www.kariera.gr) | Scheduled scraper currently paused; reviewed queue and previous inventory retained |
| Netcompany, Renesas | SmartRecruiters public Posting API, evening scheduled slot only |
| TSMG | Lever public postings |
| Motodynamics, Cosmos Sport (including its brands), Πλαίσιο | Workable public postings |
| Renesas / Irida Labs, ALTHOM, Noesis Technologies | Company career pages |
| Direct employer listings | Separately maintained `data/direct-jobs.json`; not scraped from other websites |

Nine company adapters are enabled by default; their actual availability varies. Advisable is disabled following an HTTP 403. See [corporate source registry](docs/corporate-source-registry.json) and [collection notes](docs/corporate-careers.md) for validation, limitations and provider-policy considerations. This does not imply an official partnership or permission from each provider.


---

## Features

- **Aggregated listings** from job boards, company career pages and direct employers
- **Independent source adapters** — scheduled collection, reviewed queues and separately maintained direct employer listings
- **Source-aware categorization** — 10 common categories mapped from each site's original category, with title/tag fallback
- **Date filtering** — last 7 or 30 Athens calendar days (30-day default and maximum); unknown publication dates use a separately labelled first recorded observation where available
- **"Νέο" badge** — highlights listings posted today
- **Source filtering** — toggle individual sites on/off
- **Search-first filtering** — prominent live search, explicit 7/30-day ranges, three stable quick categories, four frequent searches, and expandable source/category filters
- **Multi-select categories + frequent-search chips** with active state and one-click filter reset
- **Greek-friendly live search** — filter by title, company, or tags without requiring accents
- **Deduplication** — cross-source title/company and URL matching; distinct corporate posting IDs and source inventory are preserved
- **Responsive design** — works on desktop and mobile (iOS/Android)
- **Auto-refresh** — scheduled runs at 06:00 and 18:00 UTC; Netcompany/Renesas only in the evening scheduled run
- **Resilient source updates** — if one scraper fails, its last published jobs are preserved
- **Electron review companion** — run sources independently, inspect results, approve/reject listings, and retain drafts locally
- **Interactive Kariera capture** — open the Patra results in a restricted Electron window, complete any Cloudflare verification manually, save the rendered HTML, and process it locally with the existing Kariera parser
- **Live duplicate protection** — compare review items with published and queued GitHub data before upload, then revalidate immediately before writing
- **Queued desktop publishing** — verified jobs are written only to `data/manual-pending.json`; the scheduled workflow merges them into the public dataset and sends notifications
- **Secure GitHub authentication** — fine-grained token support with optional Windows DPAPI-backed storage
- **Social notifications** — new listings auto-post to Telegram and Facebook
- **SEO optimized** — meta tags, Open Graph, JSON-LD structured data
- **Labour-market history** — dated observations, collection health, monthly snapshots and company-level coverage; not visitor analytics
- **Privacy-conscious frontend** — no first-party tracking cookies, visitor analytics, or applicant accounts; external services may process technical request data

---

## Architecture

```text
Scheduled boards + company adapters    Reviewed queues / desktop
             |                                  |
             +-----------------+----------------+
                               v
               data/jobs.json (deduplicated)
               corporateInventory (source records)
               observations / scrape-run history
                               |
                    +----------+-----------+
                    v                      v
               Netlify website      Telegram / Facebook
                    ^
                    |
              data/direct-jobs.json

        Monthly snapshots -> report.html
```

The production site has no always-on application server or visitor database. GitHub is the publishing boundary. The Electron companion does not run the corporate adapters; those run in the scheduled server-side pipeline.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Scraping | Node.js fetch / public posting APIs, [Playwright](https://playwright.dev/) for HTML and JS-rendered sites |
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
├── report.html             # Local labour-market statistics
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
│   ├── jobs.json           # Public deduplicated listings + corporate inventory/coverage
│   ├── direct-jobs.json    # Separately maintained employer listings
│   ├── manual-pending.json # Reviewed desktop submissions awaiting workflow merge
│   ├── kariera-pending.json # Backward-compatible curated Kariera queue
│   ├── observations.jsonl  # Listing observation history
│   ├── scrape-runs.jsonl   # Per-run source outcomes
│   ├── kariera-html-snapshots/ # Local-only rendered snapshots (gitignored)
│   └── snapshots/          # Monthly historical snapshots
├── scripts/
│   ├── scrape.js           # Standalone scraper for GH Actions
│   ├── first-seen.js       # Earliest recorded listing observation
│   ├── job-history.js      # Listing and run history
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
    ├── corporate-categories.js # Corporate subcategories mapped to common categories
    ├── corporate-inventory.js  # Complete inventory and public deduplication
    ├── corporate-permissions.js # Source activation and cadence
    ├── corporate-statistics.js # Inventory and public statistics
    └── scrapers/
        ├── _shared.js      # Playwright helper + Greek date parser
        ├── jobfind.js
        ├── kariera.js
        ├── xe.js
        ├── corporate.js    # Independent employer orchestration / SmartRecruiters
        ├── lever.js
        ├── workable.js
        └── company-html.js
```

---

## Social Notifications

When the scrape identifies eligible new listings using the previous dataset and notification ledger, the workflow runs `scripts/notify-telegram.js`, which posts Greek-language summaries to the [Telegram channel](https://t.me/workinpatras) and the [Facebook page](https://www.facebook.com/profile.php?id=61591577415179). The data commit happens first, so a social API failure cannot prevent fresh jobs from being published.

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
      "firstSeenAt": "2026-04-21T06:00:00.000Z",
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

`date` is an ISO timestamp when the source date can be parsed safely; otherwise it is `null`. `firstSeenAt` is the earliest recorded observation (or conservative baseline for existing records), not proof of publication. If the publication date is absent, the UI uses that observation and labels it “Εντοπίστηκε”. Neither an old dated record nor a known first observation becomes new on a repeated scrape. Records with no usable date are excluded from the recent view. Only confirmed publication today receives “Νέο”.

Corporate records additionally include `companyId`, `sourceKey`, `externalId`, `subcategory`, `lastVerifiedAt` and `corporateStatus`. The complete corporate inventory is stored separately within `jobs.json` so cross-source duplicates can still contribute to collection history. The public job grid uses the deduplicated `jobs` array.

---

## Labour-market statistics

The [report page](https://www.workinpatras.gr/report.html) uses monthly snapshots of the collected active inventory. It is not a count of every vacancy published in the month, a census of the market, or a measure of employment. Older records can remain in the inventory and history even when excluded from the 30-day view. Source changes, fallback records, and deduplication affect comparability. Corporate company counts use the full corporate inventory before cross-source deduplication and must not be added to the public totals. Separate direct listings are not included in the aggregate snapshot. Historical observations record listing data, not visitor behaviour.

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

Unknown source categories automatically fall back to normalized title/tag matching. Corporate roles also use more specific subcategories mapped to these same ten public categories.

---

## Running Locally

**Prerequisites:** Node.js 24 (matches CI) and Windows x64 for the packaged desktop companion.

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
- **06:00 and 18:00 UTC** → GitHub Actions runs the source scrapers, preserves the previous listings of any temporarily failed source, validates and applies the curated/manual queues, commits the resulting dataset and queue state, triggers a Netlify redeploy, and then posts consolidated summaries to Telegram and Facebook

To manually trigger a scrape: GitHub → Actions tab → "Scrape Jobs" → "Run workflow". This may send notifications. Netcompany/Renesas run only in the evening scheduled slot, or on manual runs. Kariera remains paused in the workflow until deliberately re-enabled. Corporate sources are enabled by default; `CORPORATE_CAREERS_ENABLED=false` stops them, `SMARTRECRUITERS_ENABLED=false` disables Netcompany/Renesas, and provider lists can narrow coverage. Do not treat these settings as provider authorization.

The project currently uses free service allowances; provider limits and costs may change.

---

## Privacy & Legal

- No first-party visitor analytics, click tracking, applicant accounts or tracking cookies. Netlify and Google Fonts may process technical request information.
- Aggregated listings store basic metadata and links; direct employer submissions may contain supplied descriptions and professional contact details.
- The public repository contains listing observations, inventory, run history and monthly snapshots. These are not website visitor logs; historical records do not automatically expire after 30 days.
- Local desktop HTML snapshots stay in the gitignored local folder; the app uploads reviewed listing metadata, not raw HTML.
- The project is independent and does not represent the listed employers or recruitment platforms. Public availability does not automatically establish unrestricted reuse rights; source terms and access restrictions matter.
- Report incorrect listings or request removal via [GitHub Issues](https://github.com/NikosPaschalis/workInPatra/issues). Issues are public: do not post CVs, identification documents, private contact details or other personal information. An issue may request a private follow-up without disclosing sensitive information.

See [Privacy Policy](https://www.workinpatras.gr/privacy.html) and [Terms of Use](https://www.workinpatras.gr/terms.html).

---

## Known Limitations

- **Kariera.gr** premium company listings link to the company page rather than individual job ads (platform limitation)
- **Kariera interactive capture** can require a manual Cloudflare verification. The desktop app detects challenge pages but does not solve, bypass, or automatically retry them.
- **JobFind.gr** hides company names for anonymous listings by design
- **Indeed.gr** was previously a source but has been removed — Cloudflare anti-bot challenges the scraper from datacenter IPs (GitHub Actions), returning 0 jobs in production
- Scraper selectors may break if source sites update their HTML — monitor GitHub Actions for failures
- When a source fails, prior records may be retained; a valid empty corporate result removes that employer's previous inventory. Check collection status and the original listing before applying.
- Unrecognised or invalid source dates are stored as `null` instead of being guessed
- Category detection is heuristic; no measured accuracy guarantee
- The packaged desktop companion is currently built and verified only for Windows x64; release artifacts are not code-signed.

---

## Contributing

Found a bug, miscategorization, or want a feature? Open a [GitHub Issue](https://github.com/NikosPaschalis/workInPatra/issues).

---

## License

Project code: [MIT](LICENSE). This license does not grant rights to third-party job listings, company names, logos or other third-party content. Their respective rights remain unaffected.

## Data quality checks

Run `node scripts/data-quality.js data` offline. The scrape workflow records `data/data-quality.json` after applying reviewed queues, and the snapshot workflow checks integrity before capture. Structural errors stop publication; missing metadata, source availability, date drift and volume anomalies are warnings. Monthly snapshots contain source freshness/scope and comparable coverage for common sources with the same collection scope and successful evidence within 36 hours. Like-for-like counts are source-specific listings, not unique vacancies; listing-page coverage remains unverified. Legacy snapshots are unchanged and have no comparable-quality baseline. See [history schema](data/HISTORY_SCHEMA.md).
