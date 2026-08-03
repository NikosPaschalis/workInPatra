import assert from "node:assert/strict";
import test from "node:test";

import {
  ALL_CATEGORIES,
  categorizeJob,
  mapSourceCategory,
  normalizeCategoryText,
} from "../server/categorize.js";

test("the public taxonomy contains nine groups plus the fallback", () => {
  assert.equal(ALL_CATEGORIES.length, 10);
  assert.ok(ALL_CATEGORIES.includes("other"));
  assert.ok(!ALL_CATEGORIES.includes("retail"));
});

test("source category normalization ignores Greek accents and separators", () => {
  assert.equal(
    normalizeCategoryText("Logistics - Αποθήκη / Μεταφορές"),
    "logistics αποθηκη μεταφορεσ"
  );
});

test("Kariera precise categories override misleading words in the title", () => {
  assert.equal(categorizeJob({
    source: "kariera",
    sourceCategory: "SALES_BUSINESS_DEVELOPMENT_ACCOUNT_MANAGEMENT",
    title: "Sales Advisor Τεχνολογίας",
    tags: [],
  }), "sales");

  assert.equal(categorizeJob({
    source: "kariera",
    sourceCategory: "TOURISM",
    title: "Food and Beverage Manager",
    tags: [],
  }), "hospitality");
});

test("a precise title corrects an inaccurate source category", () => {
  assert.equal(categorizeJob({
    source: "kariera",
    sourceCategory: "MARKETING_ADVERTISING",
    title: "Junior Πωλητής/Πωλήτρια | Πάτρα",
    tags: [],
  }), "sales");

  assert.equal(categorizeJob({
    source: "kariera",
    sourceCategory: "MEDICINE_HEALTHCARE",
    title: "Key Account Manager – Nutrition",
    tags: [],
  }), "sales");

  assert.equal(categorizeJob({
    source: "kariera",
    sourceCategory: "WORKERS",
    title: "Καθαριστής καταστήματος",
    tags: [],
  }), "other");
});

test("the source category breaks ties when a title belongs to multiple groups", () => {
  assert.equal(categorizeJob({
    source: "kariera",
    sourceCategory: "FOOD_CAFE",
    title: "Προσωπικό Εστιατορίου - Ταμίας",
    tags: [],
  }), "hospitality");

  assert.equal(categorizeJob({
    source: "kariera",
    sourceCategory: "SALES_BUSINESS_DEVELOPMENT_ACCOUNT_MANAGEMENT",
    title: "Σύμβουλος Πώλησης Ηλεκτρολογικού Υλικού",
    tags: [],
  }), "sales");

  assert.equal(categorizeJob({
    source: "kariera",
    sourceCategory: "SALES_BUSINESS_DEVELOPMENT_ACCOUNT_MANAGEMENT",
    title: "Ιατρικός Επισκέπτης/Επιστημονικός Συνεργάτης",
    tags: [],
  }), "sales");
});

test("JobFind categories map to the common taxonomy", () => {
  assert.equal(
    mapSourceCategory("jobfind", "Digital Marketing - Ecommerce - Design"),
    "marketing"
  );
  assert.equal(
    mapSourceCategory("jobfind", "Logistics - Αποθήκη - Μεταφορές"),
    "logistics"
  );
  assert.equal(
    mapSourceCategory("jobfind", "Προσωπικό Ασφαλείας - Υπηρεσίες Καθαριότητας"),
    "other"
  );
});

test("XE specialties map to the common taxonomy", () => {
  assert.equal(mapSourceCategory("xe", "ηλεκτρολόγοι"), "construction");
  assert.equal(mapSourceCategory("xe", "baby sitters νταντάδες"), "education");
  assert.equal(mapSourceCategory("xe", "καθαριστές απολυμαντές"), "other");
});

test("unknown source categories fall back to normalized title matching", () => {
  assert.equal(categorizeJob({
    source: "kariera",
    sourceCategory: "OTHER",
    title: "Υπάλληλος Αποθήκης",
    tags: [],
  }), "logistics");

  assert.equal(categorizeJob({
    source: "unknown",
    title: "Frontend Developer",
    tags: [],
  }), "tech");
});
