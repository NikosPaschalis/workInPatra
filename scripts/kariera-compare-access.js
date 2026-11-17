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
let httpOk = false, browserOk = false, apiOk = false;
// Historic JSON API used by this project in May 2026. Confirm availability rather than assuming it still works.
try {
  const apiUrl = 'https://www.kariera.gr/api/v2/jobseeker/jobs?locationQ=achaia--patra&page=0&limit=50';
  const res = await fetch(apiUrl, {headers:{Accept:'application/json','Accept-Language':'el-GR,el;q=0.9','Referer':url},signal:AbortSignal.timeout(timeoutMs)});
  const body = await res.text();
  let data = null;
  try {data=JSON.parse(body);} catch {}
  const shape = Array.isArray(data)?data: data?.jobs ?? data?.results ?? data?.data?.jobs ?? data?.data?.results ?? data?.items ?? [];
  const n = Array.isArray(shape)?shape.length:0;
  apiOk = res.ok && n>=10;
  console.log(JSON.stringify({method:'historic-json-api',status:res.status,ok:res.ok,bytes:body.length,parsedJobs:n,keys:data&&!Array.isArray(data)&&typeof data==='object'?Object.keys(data).slice(0,8):[],apiOk}));
} catch(e){console.error('historic-json-api error:',e.message);}
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
console.log(JSON.stringify({httpOk,browserOk,apiOk,conclusion:apiOk?'historic-api-worked':httpOk&&!browserOk?'http-only':browserOk&&!httpOk?'browser-only':httpOk&&browserOk?'both-work':'none-worked'}));
if (!httpOk && !browserOk && !apiOk) process.exitCode=1;
