import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {resolve,extname} from "node:path";
import {chromium} from "playwright";
const host="deploy-preview-18--workinpatras.netlify.app";
const types={".html":"text/html",".js":"application/javascript",".css":"text/css",".json":"application/json"};
test("browser renders reviewed corporate cards, dates, links, report and isolates production",async()=>{
 const browser=await chromium.launch({headless:true});
 try{
 const page=await browser.newPage();
 await page.clock.install({time:new Date("2026-11-24T12:00:00Z")});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 let requests=0;
 await page.route("**/*",async route=>{
 const url=new URL(route.request().url());
 if(![host,"www.workinpatras.gr"].includes(url.hostname))return route.abort();
 const path=url.pathname==="/"?"/index.html":url.pathname;
 if(path==="/data/corporate-review-v5.json")requests++;
 if(["/data/jobs.json","/data/direct-jobs.json"].includes(path))return route.fulfill({json:{jobs:[]}});
 const f=resolve("."+path);
 if(!f.startsWith(process.cwd()+"/"))return route.abort();
 try{return await route.fulfill({body:await readFile(f),contentType:types[extname(f)]||"application/octet-stream"});}catch{return route.fulfill({status:404,body:""});}
 });
 await page.goto("https://"+host+"/?src=corporate&days=30");
 await page.waitForFunction(()=>document.querySelectorAll(".job-card").length===22);
 assert.equal(await page.locator(".card-source-badge").filter({hasText:"Εταιρική σελίδα"}).count(),22);
 assert.equal(await page.locator(".card-link[href^='https://']").count(),22);
 assert.equal(await page.getByText("Salesperson #JD Sports Πάτρα",{exact:true}).count(),1);
 assert.equal(await page.getByText("Salesperson #Sneaker10 Πάτρα",{exact:true}).count(),0);
 assert.equal(await page.getByText("Stores Technician - Κατάστημα Πάτρας",{exact:true}).count(),0);
 assert.ok(await page.locator(".card-date").filter({hasText:"Εντοπίστηκε:"}).count()>0);
 assert.equal(await page.getByText("Includes approximately 12 months in Hamburg after onboarding",{exact:true}).count(),1);
 await page.goto("https://"+host+"/report.html");
 await page.waitForFunction(()=>document.getElementById("corporate-report-note")?.textContent.includes("28 πραγματικές"));
 assert.equal(await page.locator("#corporate-report-rows tr").count(),14);
 assert.match(await page.locator("#corporate-report-note").textContent(),/22 στην προβολή/);
 const n=requests;
 await page.goto("https://www.workinpatras.gr/?src=corporate&days=30");
 await page.waitForFunction(()=>!document.getElementById("btn-refresh")?.classList.contains("spinning"));
 assert.equal(await page.locator(".job-card").count(),0);assert.equal(requests,n);
 assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
