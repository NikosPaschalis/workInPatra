import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = name => readFileSync(new URL("../"+name,import.meta.url),"utf8");
test("corporate jobs share the main grid with a neutral source label",()=>{
  const html=read("index.html"),app=read("app.js"),css=read("style.css");
  assert.ok(!html.includes('id="corporate-discovery"'));
  assert.ok(!app.includes("corporate-discovery"));
  assert.ok(!css.includes(".corporate-discovery"));
  assert.ok(html.includes('id="src-corporate"'));
  assert.ok(app.includes('corporate: "Εταιρική σελίδα"'));
  assert.ok(app.includes('card.querySelector(".card-company").textContent = job.company || "—"'));
  assert.ok(!app.includes('if (job.source === "corporate") link.textContent'));
  assert.ok(app.includes("job.previewOnly"));
});
