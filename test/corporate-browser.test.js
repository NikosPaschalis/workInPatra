import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {resolve,extname,sep} from "node:path";
import {chromium} from "playwright";
const types={".html":"text/html",".js":"application/javascript",".css":"text/css",".json":"application/json"};
test("production grid renders only age-eligible records and excludes preview data",async()=>{
 const browser=await chromium.launch({headless:true});
 try{
 const page=await browser.newPage();
 await page.clock.install({time:new Date("2026-11-24T12:00:00Z")});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 const base={source:"corporate",company:"Fixture employer",category:"tech",location:"Patras",corporateStatus:"verified",tags:["Software"],url:"https://example.com/job"};
 const jobs=[{...base,title:"Recent fixture",date:"2026-11-23"},{...base,title:"Undated fixture",date:null,firstSeenAt:"2026-11-24"},{...base,title:"Old fixture",date:"2026-10-01"},{...base,title:"Preview must not render",date:"2026-11-23",previewOnly:true}];
 await page.route("**/*",async route=>{
 const url=new URL(route.request().url());
 if(url.hostname!=="www.workinpatras.gr")return route.abort();
 const p=url.pathname==="/"?"/index.html":url.pathname;
 if(p==="/data/jobs.json")return route.fulfill({json:{jobs}});
 if(p==="/data/direct-jobs.json")return route.fulfill({json:{jobs:[]}});
 const f=resolve("."+p);
 if(!f.startsWith(process.cwd()+sep))return route.abort();
 try{return await route.fulfill({body:await readFile(f),contentType:types[extname(f)]||"application/octet-stream"});}catch{return route.fulfill({status:404,body:""});}
 });
 await page.goto("https://www.workinpatras.gr/?src=corporate&days=30");
 await page.waitForFunction(()=>document.querySelectorAll(".job-card").length===2);
 assert.equal(await page.locator(".card-source-badge").filter({hasText:"Εταιρική σελίδα"}).count(),2);
 assert.equal(await page.locator(".card-link[href^='https://']").count(),2);
 assert.equal(await page.getByText("Old fixture",{exact:true}).count(),0);
 assert.equal(await page.getByText("Preview must not render",{exact:true}).count(),0);
 assert.equal(await page.locator(".card-date").filter({hasText:"Εντοπίστηκε:"}).count(),1);
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
