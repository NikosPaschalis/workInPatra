import assert from "node:assert/strict";
import test from "node:test";

import {
  extractDates,
  extractJobs,
  extractSourceCategories,
} from "../server/scrapers/kariera.js";

test("extractSourceCategories maps Kariera job ids to their source categories", () => {
  const html = String.raw`
    {\"id\":123,\"title\":\"Sales Advisor\",\"shortDescription\":\"Example\",\"category\":\"SALES_BUSINESS_DEVELOPMENT_ACCOUNT_MANAGEMENT\",\"publishedAt\":\"2026-08-02T17:06:10.400Z\"}
    {\"id\":456,\"title\":\"Food and Beverage Manager\",\"category\":\"TOURISM\",\"publishedAt\":\"2026-08-01T17:06:10.400Z\"}
  `;

  assert.deepEqual(extractSourceCategories(html), {
    123: "SALES_BUSINESS_DEVELOPMENT_ACCOUNT_MANAGEMENT",
    456: "TOURISM",
  });
});

test("extractJobs attaches the matching Kariera source category", () => {
  const html = String.raw`
    {\"@type\":\"ItemList\",\"itemListElement\":[{\"name\":\"Sales Advisor\",\"url\":\"/jobs/example/123\"}]}
    {\"id\":123,\"title\":\"Sales Advisor\",\"category\":\"SALES_BUSINESS_DEVELOPMENT_ACCOUNT_MANAGEMENT\"}
  `;

  assert.equal(
    extractJobs(html)[0].sourceCategory,
    "SALES_BUSINESS_DEVELOPMENT_ACCOUNT_MANAGEMENT"
  );
});

test("extractDates associates a job with its date across large card markup", () => {
  const html = [
    '<a href="/jobs/example-jobs/123">Job</a>',
    ".".repeat(5_000),
    '<time dateTime="2026-07-30T01:01:03.474Z"></time>',
  ].join("");

  assert.deepEqual(extractDates(html), {
    123: "2026-07-30T01:01:03.474Z",
  });
});

test("extractDates maps each time to the nearest preceding job link", () => {
  const html = [
    '<a href="/jobs/example-jobs/123"></a>',
    '<time datetime="2026-07-30T01:01:03.474Z"></time>',
    '<a href="/jobs/example-jobs/456"></a>',
    '<time datetime="2026-07-31T09:37:19.758Z"></time>',
  ].join("");

  assert.deepEqual(extractDates(html), {
    123: "2026-07-30T01:01:03.474Z",
    456: "2026-07-31T09:37:19.758Z",
  });
});

test("extractDates ignores invalid timestamps", () => {
  const html = [
    '<a href="/jobs/example-jobs/123"></a>',
    '<time datetime="not-a-date"></time>',
  ].join("");

  assert.deepEqual(extractDates(html), {});
});


test("extractJobs parses nested ListItem JobPosting data from Next.js Flight chunks", () => {
  const itemList = JSON.stringify({
    "@type": "ItemList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        item: {
          "@type": "JobPosting",
          title: "Accountant",
          url: "/jobs/accounting-jobs/456",
          employmentType: ["FULL_TIME", "PART_TIME"],
          description: "Text containing ]} inside a string",
        },
      },
      { name: "Sales Advisor", url: "/jobs/example/123" },
      { name: "Invalid listing without a URL" },
    ],
  });
  const html = `<script>self.__next_f.push([1,${JSON.stringify(itemList)}]);</script>`;

  assert.deepEqual(
    extractJobs(html).map(({ title, url }) => ({ title, url })),
    [
      { title: "Accountant", url: "https://www.kariera.gr/jobs/accounting-jobs/456" },
      { title: "Sales Advisor", url: "https://www.kariera.gr/jobs/example/123" },
    ]
  );
});

test("extractJobs deduplicates repeated ItemList URLs", () => {
  const html = String.raw`
    {\\"@type\\":\\"ItemList\\",\\"itemListElement\\":[
      {\\"name\\":\\"Sales Advisor\\",\\"url\\":\\"/jobs/example/123\\"},
      {\\"name\\":\\"Duplicate title\\",\\"url\\":\\"/jobs/example/123\\"}
    ]}
  `;

  assert.equal(extractJobs(html).length, 1);
});
