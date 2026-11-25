import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {resolve,extname,sep} from "node:path";
import {chromium} from "playwright";
const types={".html":"text/html",".js":"application/javascript",".css":"text/css",".json":"application/json"};
test("shifted and estimated dates are not marked new on the public site",async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:900}});
  await page.clock.install({time:new Date("2026-11-24T12:00:00Z")});
  const base={source:"jobfind",company:"Fixture",category:"sales",url:"https://example.com/a",date:"2026-11-24",firstSeenAt:"2026-11-18",tags:[]};
  const jobs=[{...base,title:"Renewed",dateChanged:true},{...base,title:"Estimated",url:"https://example.com/b",dateProvenance:"relative_estimate"},{...base,title:"Confirmed",url:"https://example.com/c",firstSeenAt:"2026-11-24",dateProvenance:"source_metadata"}];
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/*",async route=>{
   const url=new URL(route.request().url());if(url.hostname!=="www.workinpatras.gr")return route.abort();
   const p=url.pathname==="/"?"/index.html":url.pathname;
   if(p==="/data/jobs.json")return route.fulfill({json:{jobs}});
   if(p==="/data/direct-jobs.json")return route.fulfill({json:{jobs:[]}});
   const file=resolve("."+p);if(!file.startsWith(process.cwd()+sep))return route.abort();
   try{return await route.fulfill({body:await readFile(file),contentType:types[extname(file)]||"application/octet-stream"});}catch{return route.fulfill({status:404,body:""});}
  });
  await page.goto("https://www.workinpatras.gr/");await page.waitForFunction(()=>document.querySelectorAll(".job-card").length===3);
  assert.equal(await page.locator(".card-new-badge:not(.hidden)").count(),1);
  assert.equal(await page.locator(".card-date").filter({hasText:"Ημ. πηγής:"}).count(),1);
  assert.equal(await page.locator(".card-date").filter({hasText:"Περίπου:"}).count(),1);
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
