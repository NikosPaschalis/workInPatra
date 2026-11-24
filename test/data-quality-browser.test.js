import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {resolve,extname} from "node:path";
import {chromium} from "playwright";
const types={".html":"text/html",".js":"application/javascript",".css":"text/css",".json":"application/json"};
test("report shows matched sources and legacy unavailable state; shifted and estimated dates are not new",async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:900}});
  await page.clock.install({time:new Date("2026-11-24T12:00:00Z")});
  const base={source:"jobfind",company:"Fixture",category:"sales",url:"https://example.com/a",date:"2026-11-24",firstSeenAt:"2026-11-18",tags:[]};
  const jobs=[{...base,title:"Renewed",dateChanged:true},{...base,title:"Estimated",url:"https://example.com/b",dateProvenance:"relative_estimate"},{...base,title:"Confirmed",url:"https://example.com/c",firstSeenAt:"2026-11-24",dateProvenance:"source_metadata"}];
  const snap=(month,total,extra={})=>({month,total,capturedAt:month+"-28T09:00:00Z",lastFetched:month+"-28T06:00:00Z",bySource:{jobfind:total},byCategory:{sales:total},...extra});
  const previous=snap("2026-09",2),latest=snap("2026-10",5,{quality:{warnings:[{code:"stale"}]},comparableCoverage:{available:true,previousCount:2,currentCount:3,delta:1,sources:["jobfind","xe"],excluded:["kariera"]}});
  let legacy=false;const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/*",async route=>{
   const url=new URL(route.request().url());if(url.hostname!=="www.workinpatras.gr")return route.abort();
   const p=url.pathname==="/"?"/index.html":url.pathname;
   if(p==="/data/jobs.json")return route.fulfill({json:{jobs}});
   if(p==="/data/direct-jobs.json")return route.fulfill({json:{jobs:[]}});
   if(p==="/data/snapshots/index.json")return route.fulfill({json:{snapshots:[{file:"2026-09.json"},{file:"2026-10.json"}]}});
   if(p==="/data/snapshots/2026-09.json")return route.fulfill({json:previous});
   if(p==="/data/snapshots/2026-10.json")return route.fulfill({json:legacy?snap("2026-10",5):latest});
   const file=resolve("."+p);if(!file.startsWith(process.cwd()+"/"))return route.abort();
   try{return await route.fulfill({body:await readFile(file),contentType:types[extname(file)]||"application/octet-stream"});}catch{return route.fulfill({status:404,body:""});}
  });
  await page.goto("https://www.workinpatras.gr/");await page.waitForFunction(()=>document.querySelectorAll(".job-card").length===3);
  assert.equal(await page.locator(".card-new-badge:not(.hidden)").count(),1);
  assert.equal(await page.locator(".card-date").filter({hasText:"Ημ. πηγής:"}).count(),1);
  assert.equal(await page.locator(".card-date").filter({hasText:"Περίπου:"}).count(),1);
  await page.goto("https://www.workinpatras.gr/report.html");await page.waitForFunction(()=>!document.getElementById("report-content").hidden);
  assert.match(await page.locator("#comparable-coverage").textContent(),/2 → 3/);
  assert.match(await page.locator("#comparable-coverage").textContent(),/JobFind, XE/);
  legacy=true;await page.reload();await page.waitForFunction(()=>!document.getElementById("report-content").hidden);
  assert.match(await page.locator("#comparable-coverage").textContent(),/Δεν υπάρχει ακόμη/);
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
