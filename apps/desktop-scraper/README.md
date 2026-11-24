# WorkInPatra Desktop Scraper

The desktop scraper is a manual review companion for the WorkInPatra publishing pipeline. It runs Kariera, JobFind, and XE independently on a local Windows PC, validates the results, preserves approved drafts in Electron's user-data directory, and uploads only to `data/manual-pending.json`. It never writes `data/jobs.json`, dispatches production workflows, or sends social notifications.

The **Open Kariera window** button opens the Patra results page in a separate, sandboxed Electron window for interactive testing. The window keeps Electron's normal browser identity, permits navigation only to HTTPS pages on `kariera.gr`, and denies permissions and pop-ups outside that site. Opening the window alone does not extract the DOM, alter the user agent, download the page, or feed its contents into the scraper; capture starts only after the user explicitly selects **Save & process Kariera snapshot**.

After the Patra results page has finished loading, **Save & process Kariera snapshot** performs an explicit Chromium `HTMLOnly` save into the project's `data/kariera-html-snapshots` folder. It then passes that file to the existing fixture-backed Kariera worker, which parses, categorizes, validates, and adds the jobs to the normal review queue without another network request. Snapshot saving is restricted to the exact public Patra results URL and never captures account pages or uploads the HTML. If Cloudflare presents a verification step, the user must complete it manually in the visible window before saving; the app does not solve or retry challenges.

## Install and package

Requirements: Windows x64 and Node.js. Forge 8 normally requires Node 22.13+, but the included launcher uses Electron 45's embedded Node 24 when the host is older.

```powershell
npm ci
npm run desktop:install-browser
npm run desktop:start
```

Build the unpacked Windows app or Squirrel/ZIP distributables:

```powershell
npm run desktop:package
npm run desktop:make
```

Artifacts are written under `out/`. The unpacked executable is `out/WorkInPatra Desktop Scraper-win32-x64/WorkInPatraScraper.exe`.

`desktop:install-browser` installs Chromium in `node_modules/playwright-core/.local-browsers`. Forge unpacks that directory beside `app.asar`, so packaged builds do not depend on a developer's global Playwright cache.

## Scan and review

1. Select one or more sources and click **Run selected scrapers**.
2. Sources run independently and report `Running`, `Success`, `Blocked`, `Failed`, `Skipped`, or `Cancelled`.
3. Search, filter, sort, inspect, and open individual listings.
4. Approve or reject listings explicitly. **Select all eligible** excludes suspected duplicates and review items.
5. Export results or sanitized diagnostics as JSON.

Approval records `manuallyVerifiedAt`. Scan time is never used as publication time. Relative source labels remain in `dateRaw` with `date: null`. Drafts and failed-upload state persist in Electron's application-data directory outside this repository. Local drafts are neither published nor uploaded. **Clear local history** intentionally removes results and approvals.

## GitHub token and upload

Create a fine-grained personal access token restricted to `NikosPaschalis/workInPatra` with only **Contents — Read and write**. Actions, Administration, Secrets, and Workflow permissions are not needed.

Persistent credentials use Electron `safeStorage` and Windows DPAPI; session-only authentication is available when persistence is unchecked. Tokens are never returned to the renderer or written to logs.

Before upload the app reads current `data/jobs.json`, `data/kariera-pending.json`, and `data/manual-pending.json`; revalidates approval, fields, source domains, locations, and duplicates; writes only `data/manual-pending.json` with its current SHA; and fetches the returned commit for verification. A 409/422 conflict causes one bounded refetch/revalidation retry. Local approvals remain intact after failure.

GitHub authentication also refreshes those three files from `main` and immediately reclassifies the review queue as published, queued, suspected duplicate, or new. Snapshot processing repeats that refresh when a credential is available. Upload performs a second live duplicate check, so stale review data cannot create duplicate queue entries. JobFind and XE are available but unchecked by default; Kariera is the only default source.

For first-time setup, a missing `data/manual-pending.json` is treated as an empty queue. The first approved desktop upload creates that file on `main`; subsequent uploads update it by SHA.

The repository and branch are fixed to `NikosPaschalis/workInPatra` and `main`; IPC exposes no arbitrary GitHub write operation.

## Production relationship

The desktop app is independent of scheduled scraping. The existing workflow runs scheduled scrapers, applies the backward-compatible Kariera queue, applies the shared manual queue, commits the combined dataset/queue state, then sends consolidated notifications.

Manual entries receive `curatedUntil` 45 days after approval and survive successful snapshot replacement until expiry. Rediscovery uses canonical URL identity. The notification ledger uses canonical URL or normalized title/company identities to avoid repeats caused by tracking parameters, queue retries, reappearance, or cross-source duplicates.

GitHub Actions schedules are best-effort: the two cron expressions do not guarantee execution at the exact minute.

## Security

- Context isolation and renderer sandbox enabled; Node integration disabled.
- Restrictive local-file CSP and no privileged remote content.
- Narrow validated IPC; credentials remain in the main process.
- Job URLs are source/domain validated before `shell.openExternal`.
- Standard Playwright behavior only: no fingerprint overrides, stealth plugins, proxy rotation, CAPTCHA handling, or challenge bypass.
- HTTP 401/403/429 and detected challenge pages stop that source without automatic retry.
- Diagnostics redact token patterns and authorization headers.

## Tests

```powershell
npm test
$env:RUN_ELECTRON_SMOKE='1'; node --test test/electron-smoke.test.js
```

Worker tests use local HTML fixtures and make no live source requests. For an Electron fixture run, set `WORKINPATRA_FIXTURE_DIR` to `test/fixtures/desktop`. This environment-only path is not exposed through renderer IPC.

## Troubleshooting

- Browser missing: run `npm run desktop:install-browser`, rebuild, and verify `resources/app.asar.unpacked/node_modules/playwright-core/.local-browsers`.
- Blocked source: review the sanitized detail and continue with other sources; do not bypass the site's controls.
- GitHub 401/403: verify repository restriction and Contents read/write permission.
- Repeated conflict: retain local approvals and retry after refreshing later.
- Packaging EBUSY/EPERM: Forge retries scanner locks and uses a native copy fallback only for generated output.

## Known limitations

- No clean-machine Windows installation or code-signing test was possible in this environment.
- Live source access can change or be denied; automated tests use fixtures and mocked APIs.
- GitHub writes are mocked in tests. No live repository write is performed automatically.
- Windows x64 is the only packaged and verified target.
