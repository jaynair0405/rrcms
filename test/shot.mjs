process.env.APP_BASE_PATH = '/rrcms';
process.env.SESSION_SECRET = 'test-secret';
import { chromium } from 'playwright';
import express from 'express';
import crypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const ROLE_PERMS = { sysadmin:['master.edit','rr.view','rr.edit','contract.view','contract.edit','staff.view','audit.view','report.export'] };
let user = { id:1, username:'sdee', full_name:'S D Kulkarni', role_id:1, division_id:null, running_room_id:null,
  contractor_id:null, must_change_pw:0, role_code:'sysadmin', role_name:'Sr. DEE (TRO)', scope_level:'cr' };

const RRS = [
 ['RR001','CSMT','A',48,198,1,0,'working',198,198,'BB','Mumbai','Electrical',19,19,'Contractor A'],
 ['RR010','KYN','A',10,74,0,0,'working',74,74,'BB','Mumbai','Electrical',18,17,'Contractor J'],
 ['RR020','IGP','A',15,67,1,1,'working',94,60,'BSL','Bhusaval','Electrical',45,45,'Contractor D'],
 ['RR023','BSL','A',125,250,6,1,'working',284,187,'BSL','Bhusaval','Electrical',57,55,'Contractor G'],
 ['RR037','PA (STN)','A',37,207,2,1,'working',460,160,'PA','Pune','Mechanical',50,49,'Contractor E'],
 ['RR042','KWV','B',2,15,0,1,'partial',29,15,'SUR','Solapur','Electrical',11,11,'Contractor J'],
].map(r=>({id:+r[0].slice(2),code:r[0],name:r[1],category:r[2],physical_rooms:r[3],total_beds:r[4],female_rooms:r[5],
  has_meal_facility:r[6],ac_status:r[7],status:'operational',ref_crews_per_day:r[8],ref_peak_occupancy:r[9],
  div_code:r[10],div_name:r[11],control_dept:r[12],sanctioned:r[13],on_roll:r[14],contractor:r[15]}));

function rowsFor(sql){
  const s=sql.replace(/\s+/g,' ');
  if(s.includes('FROM sessions')) return [user];
  if(s.includes('FROM role_permissions')) return ROLE_PERMS.sysadmin.map(code=>({code}));
  if(s.includes('COUNT(*) AS rr_count')) return [{rr_count:44,beds:2675,rooms:604,crews_day:3521,peak:2424,meal_sites:33,female_sites:28,female_rooms:37}];
  if(s.includes('FROM divisions d JOIN running_rooms')) return [
    {code:'BB',name:'Mumbai',rr_count:19,beds:813,crews_day:844,peak:815,female_sites:8},
    {code:'BSL',name:'Bhusaval',rr_count:6,beds:736,crews_day:986,peak:621,female_sites:6},
    {code:'NGP',name:'Nagpur',rr_count:7,beds:424,crews_day:586,peak:407,female_sites:4},
    {code:'PA',name:'Pune',rr_count:7,beds:430,crews_day:733,peak:351,female_sites:6},
    {code:'SUR',name:'Solapur',rr_count:5,beds:272,crews_day:372,peak:230,female_sites:4}];
  if(s.includes('GROUP BY rr.category')) return [{category:'A',n:21,beds:2070},{category:'B',n:19,beds:523},{category:'C',n:4,beds:82}];
  if(s.includes('FROM staff st JOIN')) return [{on_roll:1010,approved:952,pending:58}];
  if(s.includes('FROM running_room_manpower m JOIN running_rooms')) return [{x:1072}];
  if(s.includes('COUNT(DISTINCT c.contractor_id)')) return [{x:16}];
  if(s.includes('FROM feedback_coverage fc')) return [{periods:44,meeting:30,avg_pct:61.2}];
  if(s.includes('FROM monthly_grading g')) return [{head:'cleanliness',avg_rating:4.21,sites:44},{head:'food',avg_rating:3.86,sites:33},{head:'linen',avg_rating:4.13,sites:44}];
  if(s.includes('FROM deficiencies df JOIN')) return [{total:118,open:41}];
  if(s.includes('FROM running_rooms rr JOIN divisions')) return RRS;
  if(s.includes('SELECT code, name FROM divisions')) return [{code:'BB',name:'Mumbai'},{code:'BSL',name:'Bhusaval'},{code:'NGP',name:'Nagpur'},{code:'PA',name:'Pune'},{code:'SUR',name:'Solapur'}];
  if(s.includes('FROM designations dg WHERE')) return [
    ['manager','Manager','skilled',0,'Degree/diploma in Hotel Management, preferably 3 years in a 3-star hotel',0,41],
    ['supervisor','Supervisor','skilled',0,'Diploma in Hotel Management with good computer knowledge',3,128],
    ['head_cook','Head Cook','skilled',1,'Degree/diploma in Hotel Management',0,33],
    ['cook_veg','Cook (Veg)','semi_skilled',1,null,1,96],
    ['asst_cook','Asstt. Cook','unskilled',1,null,1,171],
    ['call_boy','Call Boy','unskilled',0,'Adequate knowledge of Hindi and Marathi',3,158],
    ['sweeper','Sweeper','unskilled',0,null,1,124],
  ].map((r,i)=>({id:i+1,code:r[0],name:r[1],skill_category:r[2],is_kitchen_role:r[3],qualification_note:r[4],min_per_site:r[5],on_roll:r[6],is_active:1}));
  if(s.includes('FROM manpower_norms n')){
    const M={Manager:{50:0,100:1,150:1,200:1,250:1},Supervisor:{50:3,100:3,150:3,200:3,250:3},
      'Head Cook':{50:0,100:1,150:1,200:1,250:1},'Cook (Veg)':{50:3,100:3,150:6,200:6,250:6},
      'Asstt. Cook':{50:3,100:9,150:9,200:9,250:9},'Call Boy':{50:3,100:6,150:6,200:6,250:9},
      Sweeper:{50:3,100:4,150:4,200:5,250:6}};
    const out=[];let i=0;
    for(const [name,bands] of Object.entries(M)){i++;for(const [b,n] of Object.entries(bands)) out.push({band_beds:+b,name,sort_order:i,sanctioned_count:n});}
    return out;
  }
  if(s.includes('FROM deficiency_clauses')) return [
    ['A1','A','Housekeeping & Cleaning','Providing unqualified Manager / Supervisor / Head Cook',600,'per day per staff','daily',0,null,1],
    ['A9','A','Housekeeping & Cleaning','Short deployment of manpower against prescribed strength',500,'per person per day','daily',0,null,1],
    ['B9','B','Meals & Kitchen Services','Crew complaint on food quality, quantity or non-supply',1000,'per case','daily',0,null,1],
    ['C5','C','Linen Washing & Bed Attending','Failure to serve call book in time — crew late on duty',500,'per case','daily',0,null,1],
    ['D4','D','Consumables & Records','Failure to provide biometric attendance system after 1 month',1000,'per week','weekly',0,null,0],
    ['M10','M','Monthly / Periodic','Irregularity noticed during inspection or poor performance (Sr.DEE/TRO)',10000,'per case','monthly',0,null,0],
    ['GC','G','Occupant Grading','Poor cleanliness grading by occupants (minimum 50% occupant feedback)',null,'formula — see formula_note','monthly',1,'(5 - R) / 5 x 10% of total monthly bill, where R is banded from the average occupant rating: 4.01-5 -> 5, 3.01-4 -> 4, 2.01-3 -> 3, 1.01-2 -> 2, 0-1 -> 0',0],
  ].map(r=>({clause_code:r[0],group_code:r[1],group_name:r[2],description:r[3],rate:r[4],unit:r[5],frequency:r[6],is_formula:r[7],formula_note:r[8],in_daily_checklist:r[9],is_active:1}));
  return [];
}
const stub={query:async sql=>[rowsFor(sql),[]],execute:async()=>[{insertId:1},[]]};
const host=express(); host.use('/rrcms', require('../src/app')({pool:stub}));
const srv=host.listen(0); const port=srv.address().port;
const mac=crypto.createHmac('sha256','test-secret').update('sid').digest('base64url');

const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext({viewport:{width:1440,height:950}});
await ctx.addCookies([{name:'rrcms_sid',value:encodeURIComponent('sid.'+mac),domain:'localhost',path:'/'}]);
const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const PAGES=[['login','/rrcms/login'],['dashboard','/rrcms/'],['rooms','/rrcms/running-rooms'],
   ['masters','/rrcms/masters'],['designations','/rrcms/masters/designations'],
   ['manpower','/rrcms/masters/manpower-norms'],['clauses','/rrcms/masters/deficiency-clauses']];
for(const [name,path] of PAGES){
  await p.goto(`http://localhost:${port}${path}`);
  await p.waitForTimeout(200);
  await p.screenshot({path:`app-${name}.png`, fullPage:true});
}

/* NO PAGE MAY SCROLL SIDEWAYS.
 *
 * A page wider than the window does not look broken. It looks like a page with
 * something missing, because whatever sits past the right edge is simply not
 * there until you scroll — and nobody scrolls a form sideways looking for a box
 * they have no reason to think exists. On 07.09.2026 the RR In-charge reported
 * the occupancy screen as having "no text box". It had two; at 1100px the page
 * was 1443px wide and both sat past the fold. The cause was grid children
 * defaulting to min-width:auto and refusing to shrink.
 *
 * Checked at three widths because it only appears below a threshold: at 1500px
 * that same page was perfectly fine, which is why it survived every look at it
 * on a large screen. */
let wide=0;
for(const w of [1500,1200,1000]){
  await p.setViewportSize({width:w,height:950});
  for(const [name,path] of PAGES){
    await p.goto(`http://localhost:${port}${path}`);
    await p.waitForTimeout(120);
    const d=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}));
    if(d.sw>d.cw+1){ wide++; console.log(`  \u2717 ${name} at ${w}px is ${d.sw}px wide — scrolls sideways`); }
  }
}
console.log(wide?`\n  ${wide} page(s) scroll sideways`:'  \u2713 no page scrolls sideways at 1500, 1200 or 1000');

/* A HIDDEN THING MUST BE HIDDEN.
 * `.helppanel` carries display:flex, which is an AUTHOR rule and therefore beats
 * the browser's own [hidden]{display:none}. The panel shipped with a `hidden`
 * attribute that did nothing: 900px of it sat at the bottom of every page it
 * appeared on, below the sidebar, because a third grid item with only two
 * columns declared flows onto a new row. Every screenshot taken while building
 * it was of the TOP of the page. */
await p.setViewportSize({width:1440,height:950});
let leaking=0;
for(const [name,path] of PAGES){
  await p.goto(`http://localhost:${port}${path}`);
  await p.waitForTimeout(120);
  const bad = await p.evaluate(()=>[...document.querySelectorAll('[hidden]')]
    .filter(e=>e.getBoundingClientRect().height>0)
    .map(e=>e.tagName+'#'+(e.id||'')+'.'+(e.className||'')));
  if(bad.length){ leaking++; console.log(`  \u2717 ${name}: hidden but still drawn — ${bad.join(', ')}`); }
}
console.log(leaking?`\n  ${leaking} page(s) draw something marked hidden`:'  \u2713 nothing marked hidden is drawn');
console.log('errors:', errs.length?errs:'none');
await b.close(); srv.close();
process.exit(wide||leaking||errs.length?1:0);
