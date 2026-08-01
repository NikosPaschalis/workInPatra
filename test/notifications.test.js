import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatFacebookMessage,
  formatTelegramMessage,
} from '../scripts/notify-telegram.js';

const JOB = {
  title: 'Πωλητής',
  company: 'Δοκιμαστική εταιρεία',
  category: 'sales',
  url: 'https://example.com/job',
};

test('Telegram uses the correct singular form for one new job', () => {
  const message = formatTelegramMessage([JOB]);

  assert.match(message, /Μόλις μπήκε 1 ΝΕΑ θέση εργασίας/);
  assert.doesNotMatch(message, /1 ΝΕΕΣ θέσεις εργασίας/);
});

test('Telegram uses the correct plural form for multiple new jobs', () => {
  const message = formatTelegramMessage([JOB, JOB]);

  assert.match(message, /Μόλις μπήκαν 2 ΝΕΕΣ θέσεις εργασίας/);
});

test('Facebook uses the correct singular form for one new job', () => {
  const message = formatFacebookMessage([JOB]);

  assert.match(message, /1 νέα αγγελία εργασίας στην Πάτρα/);
  assert.doesNotMatch(message, /1 νέες αγγελίες/);
});

test('Facebook uses the correct plural form for multiple new jobs', () => {
  const message = formatFacebookMessage([JOB, JOB]);

  assert.match(message, /2 νέες αγγελίες εργασίας στην Πάτρα/);
});
