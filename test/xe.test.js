import assert from "node:assert/strict";
import test from "node:test";

import { extractSourceCategory } from "../server/scrapers/xe.js";

test("extractSourceCategory reads the XE specialty from an encoded job URL", () => {
  const url = "https://www.xe.gr/%CE%B5%CF%81%CE%B3%CE%B1%CF%83%CE%AF%CE%B1/%CE%B8%CE%AD%CF%83%CE%B7-%CE%B5%CF%81%CE%B3%CE%B1%CF%83%CE%AF%CE%B1%CF%82/logistics-%CE%B1%CF%80%CE%BF%CE%B8%CE%AE%CE%BA%CE%B7/example-job";

  assert.equal(extractSourceCategory(url), "logistics αποθήκη");
});

test("extractSourceCategory supports relative XE URLs", () => {
  assert.equal(
    extractSourceCategory("/εργασία/θέση-εργασίας/ηλεκτρολόγοι/example-job"),
    "ηλεκτρολόγοι"
  );
});

test("extractSourceCategory safely handles non-job and invalid URLs", () => {
  assert.equal(extractSourceCategory("https://www.xe.gr/εργασία"), "");
  assert.equal(extractSourceCategory("%invalid"), "");
  assert.equal(extractSourceCategory(""), "");
});


import { parseFooter } from "../server/scrapers/xe.js";
import { parseGreekDate } from "../server/scrapers/_shared.js";

test("parseFooter separates employer, location, salary and relative date", () => {
  assert.deepEqual(
    parseFooter("SKROUTZ DELIVERY SERVICES - Πάτρα - 920 € / μήνα - πριν από 2 εβδομάδες"),
    {
      company: "SKROUTZ DELIVERY SERVICES",
      location: "Πάτρα",
      salaryRaw: "920 € / μήνα",
      dateRaw: "πριν από 2 εβδομάδες",
    }
  );
});

test("parseFooter does not mistake a location-only footer for a company", () => {
  assert.deepEqual(parseFooter("Δεμένικα - πριν από 6 ημέρες"), {
    company: "",
    location: "Δεμένικα",
    salaryRaw: "",
    dateRaw: "πριν από 6 ημέρες",
  });
});

test("parseFooter preserves a company when salary is not published", () => {
  assert.deepEqual(parseFooter("European Academy - Πάτρα - πριν από 7 ημέρες"), {
    company: "European Academy",
    location: "Πάτρα",
    salaryRaw: "",
    dateRaw: "πριν από 7 ημέρες",
  });
});

test("parseGreekDate supports XE relative hours", () => {
  assert.equal(
    parseGreekDate("πριν από 21 ώρες", new Date("2026-11-16T08:00:00.000Z")),
    "2026-11-15T00:00:00.000Z"
  );
});
