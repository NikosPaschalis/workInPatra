import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const reportHtml = read('../report.html');
const reportJs = read('../report.js');
const indexHtml = read('../index.html');
const sitemap = read('../sitemap.xml');

test('report page includes canonical and social metadata', () => {
  assert.ok(reportHtml.includes('<html lang="el">'));
  assert.ok(reportHtml.includes('name="description"'));
  assert.ok(reportHtml.includes('name="robots" content="index, follow"'));
  assert.ok(reportHtml.includes('rel="canonical" href="https://www.workinpatras.gr/report.html"'));
  assert.ok(reportHtml.includes('property="og:url" content="https://www.workinpatras.gr/report.html"'));
  assert.ok(reportHtml.includes('name="twitter:card" content="summary_large_image"'));
  assert.ok(reportHtml.includes('"@type":"WebPage"'));
});

test('sitemap discovers report and homepage metadata uses canonical host', () => {
  assert.ok(sitemap.includes('<loc>https://www.workinpatras.gr/report.html</loc>'));
  assert.ok(indexHtml.includes('rel="canonical" href="https://www.workinpatras.gr/"'));
  assert.ok(!indexHtml.includes('https://workinpatras.netlify.app/og-image.png'));
  assert.ok(indexHtml.includes('https://www.workinpatras.gr/og-image.png'));
});

test('category trend table is generated from snapshots instead of hard-coded months', () => {
  assert.ok(reportHtml.includes('id="category-trends-head"'));
  assert.ok(reportHtml.includes('id="category-trends-rows"'));
  assert.ok(reportJs.includes('function renderCategoryTrends(snapshots)'));
  assert.ok(reportJs.includes('snapshots.slice(-4)'));
  assert.ok(reportJs.includes('renderCategoryTrends(snapshots)'));
  assert.ok(!reportHtml.includes('Οι κατηγορίες που ξεχωρίζουν'));
});
