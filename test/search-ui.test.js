import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {resolve,extname} from "node:path";
import {chromium} from "playwright";
const types={".html":"text/html",".js":"application/javascript",".css":"text/css",".json":"application/json"};
const job=(title,category,date,source="jobfind")=>({title,category,date,source,company:"Fixture",url:"https://example.com/"+encodeURIComponent(title)});
const jobs=[job("Πωλητής","sales","2026-11-23"),job("Οδηγός","logistics","2026-11-24"),job("Τεχνικός","construction","2026-11-09"),job("Developer","tech","2026-11-24","corporate"),job("Νοσηλευτής","health","2026-11-23")];
async function setup(page){
 await page.clock.install({time:new Date("2026-11-24T12:00:00Z")});
 await page.route("**/*",async route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=="www.workinpatras.gr")return route.abort();
  const p=url.pathname==="/"?"/index.html":url.pathname;
  if(p==="/data/jobs.json")return route.fulfill({json:{jobs}});
  if(p==="/data/direct-jobs.json")return route.fulfill({json:{jobs:[]}});
  const f=resolve("."+p);
  if(!f.startsWith(process.cwd()+"/"))return route.abort();
  try{return await route.fulfill({body:await readFile(f),contentType:types[extname(f)]||"application/octet-stream"});}catch{return route.fulfill({status:404,body:""});}
 });
}
test("compact discovery works with keyboard, filters, search, URL and stable categories",async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});await setup(page);
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("https://www.workinpatras.gr/");
  await page.waitForFunction(()=>document.querySelectorAll(".job-card").length===5);
  const quick=()=>page.locator("#category-bar button").evaluateAll(bs=>bs.map(b=>b.dataset.cat));
  assert.deepEqual(await quick(),["all","sales","logistics","construction"]);
  assert.equal(await page.locator("#cat-dropdown-panel button").count(),11);
  await page.locator("[data-days='7']").click();
  assert.equal(await page.locator(".job-card").count(),4);assert.deepEqual(await quick(),["all","sales","logistics","construction"]);
  assert.equal(await page.locator("#category-bar [data-cat='construction']").textContent(),"Τεχνικά (0)");
  await page.locator("#more-categories-btn").click();
  assert.equal(await page.locator("#more-categories-btn").getAttribute("aria-expanded"),"true");
  await page.locator("#cat-dropdown-panel [data-cat='tech']").click();
  assert.equal(await page.locator(".job-card").count(),1);
  assert.equal(await page.locator("#selected-extra-categories button").count(),1);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#more-categories-btn").getAttribute("aria-expanded"),"false");
  assert.equal(await page.locator("#more-categories-btn").evaluate(e=>document.activeElement===e),true);
  await page.locator("#selected-extra-categories button").click();
  assert.equal(await page.locator(".job-card").count(),4);
  await page.locator(".popular-chip[data-q='Οδηγός']").click();
  assert.equal(await page.locator(".job-card").count(),1);
  assert.equal(await page.locator(".popular-chip[data-q='Οδηγός']").getAttribute("aria-pressed"),"true");
  assert.equal(await page.locator("#category-bar [data-cat='logistics']").textContent(),"Logistics (1)");
  assert.equal(await page.locator("#category-bar [data-cat='sales']").textContent(),"Πωλήσεις & Λιανική (0)");
  await page.locator("#search-clear").click();assert.equal(await page.locator(".job-card").count(),4);
  await page.locator("#filters-toggle").click();
  await page.locator("label.chip-corporate span").click();
  assert.equal(await page.locator(".job-card").count(),3);
  await page.locator("#filters-clear").click();assert.equal(await page.locator(".job-card").count(),5);
  await page.locator("#filters-done").click();
  await page.goto("https://www.workinpatras.gr/?cat=health&days=7");
  await page.waitForFunction(()=>document.querySelectorAll(".job-card").length===1);
  assert.equal(await page.locator("#selected-extra-categories button").count(),1);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
test("search and controls fit desktop, tablet and small mobile without horizontal overflow",async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const width of [1440,1024,768,390,320]){
   const page=await browser.newPage({viewport:{width,height:900}});await setup(page);
   await page.goto("https://www.workinpatras.gr/");await page.waitForFunction(()=>document.querySelectorAll(".job-card").length===5);
   const metrics=await page.evaluate(()=>{
    const box=s=>document.querySelector(s).getBoundingClientRect();
    const main=box(".filters-bar"),search=box("#search-input"),filters=box("#filters-toggle"),cat=box(".category-bar-wrap"),grid=box("#job-grid");
    const nodes=[...document.querySelectorAll(".filters-bar button:not(.hidden), .category-bar-wrap button:not(.hidden)")].filter(e=>e.getClientRects().length);
    return {width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,inside:nodes.every(e=>{const b=e.getBoundingClientRect();return b.left>=-1&&b.right<=innerWidth+1}),mainHeight:main.height,discoveryHeight:grid.top-main.top,searchWidth:search.width,searchRight:search.right,filterLeft:filters.left,catWidth:cat.width};
   });
   console.log("LAYOUT",width,JSON.stringify(metrics));
   assert.ok(metrics.overflow<=1);assert.ok(metrics.inside);assert.ok(metrics.searchRight<=metrics.filterLeft+1);assert.ok(metrics.searchWidth>=125);
   if(width>=1024)assert.ok(metrics.discoveryHeight<235);
   await page.locator("#filters-toggle").click();
   assert.equal(await page.locator("#advanced-filters").isVisible(),true);
   assert.ok(await page.locator("#filters-done").isVisible());
   await page.locator("#filters-done").click();
   await page.close();
  }
 }finally{await browser.close();}
});
