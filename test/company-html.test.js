import test from "node:test";
import assert from "node:assert/strict";
import {robotsPolicy,parseCompanyHtml,fetchCompanyHtml} from "../server/scrapers/company-html.js";
import {CORPORATE_COMPANIES} from "../server/scrapers/corporate.js";
const company=id=>CORPORATE_COMPANIES.find(c=>c.id===id);
const now=new Date("2026-11-24T12:00:00Z");
test("robots denial takes precedence, prevents page request",async()=>{
 assert.equal(robotsPolicy("User-agent: *\nDisallow: /careers\nAllow: /careers/open$","/careers/open").allowed,true);
 assert.equal(robotsPolicy("User-agent: *\nDisallow: /careers","/careers/").allowed,false);
 let calls=0;
 await assert.rejects(fetchCompanyHtml(company("irida-renesas"),{fetchImpl:async()=>{calls++;return {ok:true,status:200,text:async()=>"User-agent: *\nDisallow: /careers"}},parse:()=>assert.fail()}),/disallows/);
 assert.equal(calls,1);
});
test("Irida parses local date and canonical link; ignores Athens-only",async()=>{
 const html='<h2>Current Job Vacancies</h2><div><h2><a href="/careers/devops/">DevOps Engineer</a></h2><p>Date Posted: 18 November 2026</p><p>Location: Athens or Patras</p><p>Openings: 1</p><a href="/careers/devops/">Apply here</a></div><div><h2><a href="/careers/athens/">Engineer</a></h2><p>Date Posted: 18 November 2026</p><p>Location: Athens</p><p>Openings: 1</p></div>';
 const jobs=await parseCompanyHtml(html,company("irida-renesas"),now);
 assert.equal(jobs.length,1);assert.equal(jobs[0].date,"2026-11-18T00:00:00.000Z");assert.equal(jobs[0].title,"DevOps Engineer");
});
test("ALTHOM retains distinct role codes for shared career URL, excludes Hamburg",async()=>{
 const html='<h2>Open positions</h2><article><span>MECH_DEV</span><h3>Mechanical Design Engineer</h3><p>Patras, Greece</p></article><article><span>CATIA_CAD</span><h3>Industrial Designer</h3><p>Patras, Greece</p></article><article><span>ILS_MGR</span><h3>Manager</h3><p>Hamburg, Germany</p></article>';
 const jobs=await parseCompanyHtml(html,company("althom"),now);
 assert.deepEqual(jobs.map(j=>j.externalId),["MECH_DEV","CATIA_CAD"]);assert.equal(jobs[0].date,null);
});
test("Noesis and Advisable require explicit local location and stable identity",async()=>{
 const noesis=await parseCompanyHtml('<div><h3>Senior RTL Design Engineer</h3><p>Job Title: Senior RTL Design Engineer</p><p>Location: Patras / Greece</p><p>Job Type: Full-Time</p></div>',company("noesis"),now);
 assert.equal(noesis.length,1);
 const adv=await parseCompanyHtml('<a href="/careers/backend-developer"><span>Patras</span><span>Full-Time</span><h3>Backend Developer</h3></a><a href="/careers/athens"><span>Athens</span><span>Full-Time</span><h3>Engineer</h3></a>',company("advisable"),now);
 assert.equal(adv.length,1);assert.equal(adv[0].externalId,"backend-developer");
 await assert.rejects(parseCompanyHtml('<h1>Access denied</h1>',company("noesis"),now),/marker missing/);
});
