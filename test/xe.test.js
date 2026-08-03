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
