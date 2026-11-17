// Notify Telegram and Facebook about direct employer listings exactly once per channel
// in normal runs. A persistent per-channel ledger prevents re-posts on edits.
// Each listing needs a stable unique id; never change it when editing the listing.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { sendTelegram, sendFacebook } from './notify-telegram.js';

const DATA_PATH = 'data/direct-jobs.json';
const LEDGER_PATH = 'data/direct-notifications.json';
const SITE_URL = 'https://www.workinpatras.gr/';

function loadJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, 'utf8'));
}

function saveLedger(ledger) {
  writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + '\n');
}

async function main() {
  const { jobs = [] } = loadJson(DATA_PATH, {});
  const ledger = loadJson(LEDGER_PATH, { telegram: [], facebook: [] });
  for (const channel of ['telegram', 'facebook']) {
    if (!Array.isArray(ledger[channel])) throw new Error('Invalid ledger for ' + channel);
  }
  const ids = new Set();
  for (const job of jobs) {
    if (!job.id || typeof job.id !== 'string') throw new Error('Direct job missing stable id');
    if (ids.has(job.id)) throw new Error('Duplicate direct job id: ' + job.id);
    ids.add(job.id);
  }

  let failed = false;
  for (const [channel, send] of [['telegram', sendTelegram], ['facebook', sendFacebook]]) {
    const sent = new Set(ledger[channel]);
    const pending = jobs.filter(job => job.source === 'direct' && job.title && job.company && !sent.has(job.id));
    if (!pending.length) {
      console.log(channel + ': no new direct jobs');
      continue;
    }
    // Send each direct job individually to ensure an accurate per-job ledger.
    for (const job of pending) {
      const url = new URL(SITE_URL);
      url.searchParams.set('q', job.title);
      url.searchParams.set('src', 'direct');
      const shareJob = { ...job, url: url.toString() };
      try {
        const delivered = await send([shareJob]);
        if (delivered) {
          ledger[channel].push(job.id);
          saveLedger(ledger);
          console.log(channel + ': recorded ' + job.id);
        } else {
          console.log(channel + ': credentials unavailable, will retry next run');
        }
      } catch (error) {
        failed = true;
        console.error(channel + ': delivery failed for ' + job.id, error);
      }
    }
  }
  if (failed) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
