// Diagnostic only. Does not publish or modify any job data.
import { chromium } from 'playwright';
import { extractJobs } from '../server/scrapers/kariera.js';

const url = 'https://www.kariera.gr/jobs/jobs-in-achaia--patra';
const timeoutMs = 30000;
function report(method, response, html) {
  const jobs = response.ok ? extractJobs(html) : [];
  const challenge = /Just a moment|cf-chl|cdn-cgi\/challenge-platform/i.test(html);
  console.log(JSON.stringify({method,status:response.status,ok:response.ok,htmlBytes:html.length,challenge,parsedJobs:jobs.length,firstJob:jobs[0]?.title ?? null}));
  return response.ok && jobs.length >= 10;
}
let httpOk = false, browserOk = false;
try {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url,{headers:{'Accept':'text/html,application/xhtml+xml','Accept-Language':'el-GR,el;q=0.9,en-US;q=0.8'},signal:controller.signal});
    httpOk = report('http-fetch',res,await res.text());
  } finally {clearTimeout(timer);}
} catch(e){console.error('http-fetch error:',e.message);}
let browser;
try {
  browser = await chromium.launch({headless:true});
  const page = await browser.newPage({locale:'el-GR'});
  const res = await page.goto(url,{waitUntil:'domcontentloaded',timeout:timeoutMs});
  if(res) browserOk = report('playwright',{status:res.status(),ok:res.ok()},await page.content());
  else console.error('playwright: no response');
} catch(e){console.error('playwright error:',e.message);}
finally {if(browser) await browser.close();}
console.log(JSON.stringify({httpOk,browserOk,conclusion:httpOk&&!browserOk?'http-only':browserOk&&!httpOk?'browser-only':httpOk&&browserOk?'both-work':'neither-works'}));
if (!httpOk && !browserOk) process.exitCode=1;
