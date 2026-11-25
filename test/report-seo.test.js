import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const reportHtml = read('../report.html');
const indexHtml = read('../index.html');
const sitemap = read('../sitemap.xml');

test('report page includes canonical and social metadata', () => {
  assert.ok(reportHtml.includes('<html lang="el">'));
  assert.ok(reportHtml.includes('name="description"'));
  assert.ok(reportHtml.includes('name="robots" content="index, follow"'));
  assert.ok(reportHtml.includes('rel="canonical" href="https://www.workinpatras.gr/report.html"'));
  assert.ok(reportHtml.includes('property="og:url" content="https://www.workinpatras.gr/report.html"'));
  assert.ok(reportHtml.includes('name="twitter:card" content="summary_large_image"'));
  assert.ok(reportHtml.includes('"@type":"CollectionPage"'));
});

test('sitemap discovers report and homepage metadata uses canonical host', () => {
  assert.ok(sitemap.includes('<loc>https://www.workinpatras.gr/report.html</loc>'));
  assert.ok(indexHtml.includes('rel="canonical" href="https://www.workinpatras.gr/"'));
  assert.ok(!indexHtml.includes('https://workinpatras.netlify.app/og-image.png'));
  assert.ok(indexHtml.includes('https://www.workinpatras.gr/og-image.png'));
});

test('archive links to indexed static articles with their own analytical content', () => {
  const { windows, entries } = JSON.parse(read('../reports/index.json'));
  assert.deepEqual(windows.map(window => window.duration), [3, 6, 12]);
  for (const entry of entries) {
    const revision = entry.revisions.at(-1);
    const article = read('..' + revision.url + 'index.html');
    assert.ok(article.includes('id="sector-table"'));
    assert.ok(article.includes('"@type":"Article"'));
    assert.ok(article.includes('https://www.workinpatras.gr' + revision.url));
    assert.ok(sitemap.includes('<loc>https://www.workinpatras.gr' + revision.url + '</loc>'));
    assert.ok(reportHtml.includes('href="' + revision.url + '"'));
  }
});

test('report discovery links, sitemap URLs and crawl directives agree', () => {
  const robots = read('../robots.txt');
  assert.match(robots, /Sitemap: https:\/\/www\.workinpatras\.gr\/sitemap\.xml/);
  assert.match(robots, /Allow: \//);
  assert.ok(indexHtml.includes('href="/report.html">Δείτε τις αναφορές και τα στατιστικά εργασίας'));
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.equal(new Set(urls).size, urls.length);
  assert.match(sitemap, /<loc>https:\/\/www\.workinpatras\.gr\/report\.html<\/loc>\s*<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  const { entries } = JSON.parse(read('../reports/index.json'));
  for (const entry of entries) {
    const revision = entry.revisions.at(-1);
    const article = read('..' + revision.url + 'index.html');
    assert.ok(article.includes('rel="canonical" href="https://www.workinpatras.gr' + revision.url + '"'));
    assert.ok(article.includes('name="robots" content="index, follow"'));
    assert.ok(article.includes('href="/report.html"'));
    assert.ok(urls.includes('https://www.workinpatras.gr' + revision.url));
  }
});
