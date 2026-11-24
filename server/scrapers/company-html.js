import { categorizeCorporateRole } from "../corporate-categories.js";
import { normalizeText } from "../../scripts/job-identity.js";
const UA="WorkInPatrasBot/1.0 (+https://www.workinpatras.gr/)";
const norm=s=>normalizeText(s);
export function robotsPolicy(body,path){
 const groups=[];let group=null,hadRules=false;
 for(const line of body.split(/\r?\n/)){
  const match=line.replace(/#.*$/,"").trim().match(/^([^:]+):\s*(.*)$/);
  if(!match)continue;
  const key=match[1].trim().toLowerCase(),value=match[2].trim();
  if(key==="user-agent"){
   if(!group||hadRules){group={agents:[],rules:[],delay:0};groups.push(group);hadRules=false;}
   group.agents.push(value.toLowerCase());
  }else if(group){
   hadRules=true;
   if((key==="allow"||key==="disallow")&&value)group.rules.push({key,value});
   if(key==="crawl-delay"&&Number.isFinite(Number(value)))group.delay=Math.max(group.delay,Number(value));
  }
 }
 const specific=groups.filter(g=>g.agents.some(a=>a!=="*"&&"workinpatrasbot".startsWith(a)));
 const applicable=specific.length?specific:groups.filter(g=>g.agents.includes("*"));
 const rules=applicable.flatMap(g=>g.rules).filter(r=>{
  const end=r.value.endsWith("$"),part=end?r.value.slice(0,-1):r.value;
  const regex=part.split("*").map(s=>s.replace(/[.*+?^$(){}|[\]\\]/g,"\\$&")).join(".*");
  return new RegExp("^"+regex+(end?"$":"")).test(path);
 }).sort((a,b)=>b.value.replace(/[*$]/g,"").length-a.value.replace(/[*$]/g,"").length||(a.key==="allow"?-1:1));
 return {allowed:rules[0]?.key!=="disallow",delay:Math.max(0,...applicable.map(g=>g.delay))};
}
async function getText(url,fetchImpl,accept){
 const res=await fetchImpl(url,{headers:{"User-Agent":UA,Accept:accept},signal:AbortSignal.timeout(15000),redirect:"follow"});
 if(res.url&&new URL(res.url).origin!==url.origin)throw new Error("Unexpected cross-origin redirect");
 if(res.status===404&&url.pathname==="/robots.txt")return "";
 if(!res.ok)throw new Error("Company site HTTP "+res.status);
 const text=await res.text();
 if(text.length>3000000)throw new Error("Company page exceeds size cap");
 return text;
}
export async function parseCompanyHtml(html,company,now=new Date()){
 const {chromium}=await import("playwright");
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();
  // Parse inert HTML in a blank page. No company scripts, cookies or additional network requests.
  await page.route("**/*",r=>r.abort());
  const raw=await page.evaluate(({html,id,base})=>{
   const d=new DOMParser().parseFromString(html,"text/html");
   d.querySelectorAll("script,style,noscript,template").forEach(e=>e.remove());
   const txt=e=>{if(!e)return "";const walker=d.createTreeWalker(e,NodeFilter.SHOW_TEXT);const a=[];while(walker.nextNode())a.push(walker.currentNode.nodeValue);return a.join(" ").replace(/\s+/g," ").trim()};
   const all=txt(d.body);
   const links=e=>[...e.querySelectorAll("a[href]")].map(a=>{try{return {a,url:new URL(a.getAttribute("href"),base)}}catch{return null}}).filter(Boolean);
   const detail=u=>u.origin===new URL(base).origin&&/^\/careers\/[^/]+\/?$/.test(u.pathname);
   const head=e=>[...e.querySelectorAll("h1,h2,h3,h4,h5")];
   function ancestor(el,pred){for(let e=el,i=0;e&&i<11;e=e.parentElement,i++)if(pred(e))return e;return null;}
   const result=[];
   if(id==="irida-renesas"){
    if(!/Current Job Vacancies/i.test(all))throw Error("Irida list marker missing");
    const candidates=links(d).filter(x=>detail(x.url)),seen=new Set();
    for(const {a,url} of candidates){
     const key=url.pathname.replace(/\/$/,"");
     if(seen.has(key))continue;
     const block=ancestor(a,e=>{const s=txt(e);return /Date Posted:/i.test(s)&&/Location:/i.test(s)&&new Set(links(e).filter(x=>detail(x.url)).map(x=>x.url.pathname.replace(/\/$/,""))).size===1});
     if(!block)throw Error("Irida role metadata missing: "+key);
     const s=txt(block),date=s.match(/Date Posted:\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i)?.[1];
     const loc=s.match(/Location:\s*(.*?)\s*(?:Openings:|Apply here|$)/i)?.[1];
     const title=head(block).map(txt).find(t=>t&&!/^\(/.test(t)&&!/Current Job Vacancies/i.test(t));
     if(!title||!date||!loc)throw Error("Irida malformed role");
     seen.add(key);result.push({id:key.split("/").at(-1),title,date,loc,url:url.href});
    }
   }else if(id==="althom"){
    if(!/Open positions/i.test(all))throw Error("ALTHOM list marker missing");
    for(const h of d.querySelectorAll("h3")){
     const block=ancestor(h,e=>head(e).filter(x=>x.tagName==="H3").length===1&&/\b[A-Z]{2,}_[A-Z0-9_]+\b/.test(txt(e))&&/(Patras,\s*Greece|Hamburg,\s*Germany)/i.test(txt(e)));
     if(!block)continue;
     const s=txt(block),code=s.match(/\b[A-Z]{2,}_[A-Z0-9_]+\b/)?.[0];
     if(!code)throw Error("ALTHOM code missing");
     const loc=/Patras,\s*Greece/i.test(s)?"Patras, Greece":"Hamburg, Germany";
     result.push({id:code,title:txt(h),loc,url:base,date:null,locationNote:/twelve months in Hamburg/i.test(s)?"Includes approximately 12 months in Hamburg after onboarding":""});
    }
   }else if(id==="noesis"){
    if(!/Job Title:/i.test(all))throw Error("Noesis list marker missing");
    for(const h of d.querySelectorAll("h2,h3,h4")){
     const block=ancestor(h,e=>/Job Title:\s*.+?Location:\s*.+?Job Type:/i.test(txt(e))&&head(e).filter(x=>x.tagName===h.tagName).length===1);
     if(!block)continue;
     const m=txt(block).match(/Job Title:\s*(.*?)\s*Location:\s*(.*?)\s*Job Type:/i);
     if(m)result.push({title:m[1],id:m[1].toLowerCase().replace(/[^a-z0-9]+/g,"-"),loc:m[2],date:null,url:base});
    }
   }else if(id==="advisable"){
    for(const {a,url} of links(d).filter(x=>detail(x.url))){
     const s=txt(a);
     if(!/\b(Patras|Athens)\b/i.test(s)||!/(Full-Time|Part-Time|Contract|Internship)/i.test(s))continue;
     const title=head(a).map(txt).find(Boolean);
     if(!title)throw Error("Advisable title heading missing");
     result.push({id:url.pathname.split("/").filter(Boolean).at(-1),title,loc:/\bPatras\b/i.test(s)?"Patras, Greece":"Athens, Greece",date:null,url:url.href});
    }
   }else throw Error("Unsupported HTML company");
   // A missing list or selectors must not be misreported as zero active jobs.
   if(!result.length)throw Error("No recognizable job cards");
   return result;
  },{html,id:company.id,base:company.careerUrl});
  const seen=new Map();
  for(const p of raw){
   const loc=norm(p.loc);
   if(!["patras","patra","patras, greece","patras / greece","athens or patras","athens or patras, greece","πατρα"].includes(loc))continue;
   if(!p.title||!p.id)throw new Error("Missing role identity");
   const url=new URL(p.url);
   if(url.protocol!=="https:"||url.origin!==new URL(company.careerUrl).origin)throw new Error("Invalid official career link");
   const parsed=Date.parse(p.date||"");
   if(p.date&&!Number.isFinite(parsed))throw new Error("Invalid source publication date");
   const role=categorizeCorporateRole(p.title);
   const job={source:"corporate",sourceKey:"corporate:"+company.id,companyId:company.id,company:company.name,externalId:p.id,title:p.title,location:p.loc,locationNote:p.locationNote||"",url:url.href,date:Number.isFinite(parsed)?new Date(parsed).toISOString():null,dateRaw:p.date||"",dateProvenance:Number.isFinite(parsed)?"source_metadata":"unavailable",...role,tags:[role.subcategoryLabel],lastVerifiedAt:now.toISOString(),corporateStatus:"verified"};
   const old=seen.get(p.id);if(old&&old.title!==job.title)throw new Error("Conflicting role id");
   seen.set(p.id,job);
  }
  return [...seen.values()];
 }finally{await browser.close()}
}
export async function fetchCompanyHtml(company,{fetchImpl=globalThis.fetch,now=new Date(),delay=ms=>new Promise(r=>setTimeout(r,ms)),parse=parseCompanyHtml}={}){
 const url=new URL(company.careerUrl);
 const robots=await getText(new URL("/robots.txt",url),fetchImpl,"text/plain");
 if(/^\s*</.test(robots))throw new Error("Unrecognized robots response");
 const policy=robotsPolicy(robots,url.pathname+url.search);
 if(!policy.allowed)throw new Error("robots.txt disallows career page");
 if(policy.delay>10)throw new Error("robots crawl delay exceeds pilot budget");
 if(policy.delay>0)await delay(policy.delay*1000);
 const html=await getText(url,fetchImpl,"text/html");
 return parse(html,company,now);
}
