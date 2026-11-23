import { readSchedule, datesIn, mendDates, suggestLines, outline } from '../src/lib/scheduleRead.ts'
const eq=(a:unknown,b:unknown,n:string)=>{const ok=JSON.stringify(a)===JSON.stringify(b);console.log(ok?'ok  ':'FAIL',n,ok?'':JSON.stringify(a)+' != '+JSON.stringify(b))}
eq(datesIn('x 01/15/26 y 2/3/2026').map(d=>d.day),['2026-01-15','2026-02-03'],'numeric dates')
eq(datesIn('15-Jan-26 03FEB26 A').map(d=>d.day),['2026-01-15','2026-02-03'],'P6 dates')
eq(datesIn('Mon 1/5/26  Fri Jan 16, 2026').map(d=>d.day),['2026-01-05','2026-01-16'],'Project dates')
eq(datesIn('Level 2 framing 12 30').length,0,'numbers are not dates')
eq(datesIn('02/30/26').length,0,'no 30th of February')
eq(mendDates('Pour slab O1/l5/26 Bolts'),'Pour slab 01/15/26 Bolts','scan mended in dates only')
const p6=readSchedule(['Activity ID  Activity Name  Original Duration  Start  Finish','SITEWORK','A1000 Mobilization 5 05-Jan-26 09-Jan-26','A1010 Erosion control & clearing 10 12-Jan-26 A 23-Jan-26','STRUCTURE','A2000 Level 2 framing 15d 02-Feb-26 20-Feb-26 40%','A2010 Substantial Completion 0 30-Jun-26','Page 1 of 3   Data Date 01-Jan-26'])
eq(p6.map(a=>[a.name,a.is_heading,a.starts_on,a.ends_on,a.percent]),[['SITEWORK',true,null,null,0],['Mobilization',false,'2026-01-05','2026-01-09',0],['Erosion control & clearing',false,'2026-01-12','2026-01-23',0],['STRUCTURE',true,null,null,0],['Level 2 framing',false,'2026-02-02','2026-02-20',40],['Substantial Completion',false,'2026-06-30','2026-06-30',0]],'P6 layout')
const msp=readSchedule(['ID Task Name Duration Start Finish Predecessors','1 Foundations 12 days Mon 1/5/26 Tue 1/20/26','2 Slab on grade 6 days Wed 1/21/26 Wed 1/28/26 1','3 Roofing 3 wks Mon 3/2/26 Fri 3/20/26 2'])
eq(msp.map(a=>[a.name,a.starts_on,a.ends_on]),[['Foundations','2026-01-05','2026-01-20'],['Slab on grade','2026-01-21','2026-01-28'],['Roofing','2026-03-02','2026-03-20']],'MS Project layout')
const scan=readSchedule(['| — ee | === |','Drywall hang & finish 15 O3/O2/26 03/2O/26 |===','~~ __ |  | —','Paint l0 03/23/26 04/03/26'],{scanned:true})
eq(scan.map(a=>[a.name,a.starts_on,a.ends_on]),[['Drywall hang & finish','2026-03-02','2026-03-20'],['Paint','2026-03-23','2026-04-03']],'scan with bar noise')
const sov=[{id:'h',description:'DIVISION 09',is_heading:true},{id:'a',description:'Gypsum board assemblies',is_heading:false},{id:'b',description:'Painting',is_heading:false},{id:'c',description:'Concrete foundations',is_heading:false},{id:'d',description:'HVAC',is_heading:false},{id:'e',description:'Electrical',is_heading:false}]
eq(suggestLines('Drywall hang & finish',sov),['a'],'drywall = gypsum board')
eq(suggestLines('Paint Level 2',sov),['b'],'paint')
eq(suggestLines('Pour footings',sov),['c'],'footings → foundations')
eq(suggestLines('Mechanical rough-in',sov),['d'],'mechanical = HVAC')
eq(suggestLines('Owner move-in',sov),[],'nothing forced')
const lv=readSchedule(['A3000 Paint Level 2 10 03/23/26 04/03/26','A3010 Framing Phase 1 15 15 02/02/26 02/20/26'])
eq(lv.map(a=>a.name),['Paint Level 2','Framing Phase 1'],'a number that belongs to the name stays')
import { linesByNumber } from '../src/lib/scheduleRows.ts'
{
  // A page as a reader hands it over: words with places, out of order, with a stray number, a
  // heading, a misread line number, and bar-chart rubbish to the right.
  const W=(text:string,x:number,y:number)=>({text,x,y,w:text.length*7,h:12})
  const row=(no:string,y:number,name:string,a:string,b:string)=>[W(no,40-no.length*7,y),...name.split(' ').map((t,i)=>W(t,60+i*60,y+(i%2))),W(a,420,y),W(b,500,y),W('|||',700,y+1)]
  const words=[W('ID',26,10),W('Task',60,10),W('Name',100,10),W('Start',420,10),W('Finish',500,10),
    W('SITEWORK',60,34),
    ...row('1',52,'Mobilization','01/05/26','01/09/26'),...row('2',70,'Erosion control','01/12/26','01/23/26'),
    ...row('?',88,'Clearing and grubbing','01/26/26','01/30/26'),...row('4',106,'Rough grading','02/02/26','02/13/26'),
    W('STRUCTURE',60,124),
    ...row('5',142,'Footings','02/16/26','02/27/26'),...row('6',160,'Slab on grade','03/02/26','03/06/26'),W('3',33,300)].sort(()=>0.5-Math.sin(1))
  const lines=linesByNumber(words,800)!
  eq(lines.filter(l=>l.no).map(l=>l.no),['1','2','3','4','5','6'],'line numbers found, the unread one filled in, the stray one dropped')
  const read=readSchedule(lines)
  eq(read.map(a=>[a.is_heading?'':a.no,a.name,a.starts_on]),[['','SITEWORK',null],['1','Mobilization','2026-01-05'],['2','Erosion control','2026-01-12'],['3','Clearing and grubbing','2026-01-26'],['4','Rough grading','2026-02-02'],['','STRUCTURE',null],['5','Footings','2026-02-16'],['6','Slab on grade','2026-03-02']],'each number given its own row; headings carry none')
  eq(linesByNumber([W('Mobilization',60,10),W('01/05/26',300,10)],800),null,'no number column, no guessing')
  eq(readSchedule(['12 Roofing 3 wks Mon 3/2/26 Fri 3/20/26']).map(a=>a.no),['12'],'a plain line keeps its leading number')
}
import { diffSchedule, afterIssue, summary, finishSlip } from '../src/lib/scheduleDiff.ts'
{
  const L=(name:string,s:string|null,e:string|null,p=0,h=false)=>({name,is_heading:h,starts_on:s,ends_on:e,percent:p})
  const before=[L('SITEWORK',null,null,0,true),L('Mobilization','2026-01-05','2026-01-09',100),L('Roofing','2026-04-06','2026-04-17'),L('Painting','2026-06-08','2026-06-19')]
  const issue=[L('SITEWORK',null,null,0,true),L('mobilization','2026-01-05','2026-01-09',100),L('Roofing','2026-04-13','2026-04-29',10),L('Punch list','2026-06-22','2026-06-26')]
  const ch=diffSchedule(before,issue)
  eq(ch.map(c=>[c.kind,c.name]),[['moved','Roofing'],['progress','Roofing'],['added','Punch list'],['missing','Painting']],'what an issue changed')
  eq((ch[0] as {start:{days:number},end:{days:number}}).start.days+','+(ch[0] as {end:{days:number}}).end.days,'7,12','by how many days')
  eq(summary(ch),'1 moved, 1 added, 1 not in this issue, 1 with new progress','said in a line')
  const after=afterIssue(before,issue)
  eq(after.map(l=>l.name),['SITEWORK','Mobilization','Roofing','Painting','Punch list'],'the schedule after: nothing dropped, the new one added')
  eq(finishSlip(before,after),7,'the last finish moved a week')
  eq(diffSchedule([],issue).map(c=>c.kind),['added','added','added'],'a first issue is all additions, with nothing missing')
}
{
  // From a real scan (a contractor's MS Project printout): weekday run into the date, a stray
  // letter pair after the name, the chart's copy of the name beside it.
  const r=readSchedule([{no:'3',text:'Mobilization 12days ~~ Mon2/16/26 Fri2/27/26',label:'Mobilization pss'},{no:'6',text:'Site Demo, Clearing, Prep BN 33 days Mon 2/16/26 Fri 3/20/26',label:'Site Demo, Clearing, Prep puss'},{no:'20',text:'Gabion Baskets/Masonry Walls C32 days Mon 1/18/27 Thu 2/18/27',label:'Gabion Baskets/Mos'},{no:'9',text:'Footings 10 days Mon 3/17/26 Fri 3/27/26'},{no:'11',text:'Office Section I'},{no:'12',text:'Steel 5 days Mon 6/15/26 Fri 6/19/26'}],{scanned:true})
  eq(r.map(a=>[a.no??'',a.name,a.starts_on,a.ends_on]),[['3','Mobilization','2026-02-16','2026-02-27'],['6','Site Demo, Clearing, Prep','2026-02-16','2026-03-20'],['20','Gabion Baskets/Masonry Walls','2027-01-18','2027-02-18'],['9','Footings','2026-03-17','2026-03-27'],['','Office Section',null,null],['12','Steel','2026-06-15','2026-06-19']],'a real scan\'s rows: glued weekdays, stray letters, a cut-off chart label')
  eq(r.map(a=>Object.keys(a.unsure??{}).join('+')),['','','','starts','',''],'only the date whose printed weekday it is not is doubted')
}
{ // Indented outline: levels from indents in text heights, with one stray deeper indent clamped.
  const rows=['Job','Design','Drawings','Permit','Build','Footings','Framing','Closeout'].map(name=>({name,is_heading:false,starts_on:null,ends_on:null,percent:0} as any))
  outline(rows,[0.3,1.5,2.7,2.7,1.5,5.1,2.7,1.5])
  eq(rows.map(r=>[r.level,r.is_heading]),[[0,true],[1,true],[2,false],[2,false],[1,false],[1,true],[2,false],[1,false]],'outline levels; a row two levels deeper is kept a sibling')
}
{ // Benchmarks: architect-facing names anywhere, everything under a Milestones heading, no deliveries.
  const { benchmarks } = await import('../src/lib/benchmarks.ts')
  const A=(sort:number,name:string,level:number,s:string|null,e:string|null,h=false)=>({id:String(sort),project_id:'p',contract_id:null,name,is_heading:h,starts_on:s,ends_on:e,percent:0,sort,level,lines:[]})
  const b=benchmarks([A(1,'Job',0,'2026-01-01','2027-03-01',true),A(2,'Pump Delivery',1,'2026-07-01','2026-07-01'),
    A(3,'Tracking Milestones',1,'2026-06-01','2027-03-01',true),A(4,'Existing Plant Modifications',2,'2026-12-09','2026-12-09'),A(5,'North Plant Dried In',2,'2026-12-15','2026-12-15'),
    A(6,'Interior',1,'2026-12-15','2027-03-08',true),A(7,'Drywall',2,'2027-01-01','2027-01-20'),A(8,'Clean & Punch',2,'2027-02-23','2027-03-08'),A(9,'Substantial Completion',2,'2027-03-09','2027-03-09')] as any)
  eq(b.map(x=>[x.activity.name,x.day,x.to]),[['Existing Plant Modifications','2026-12-09',null],['North Plant Dried In','2026-12-15',null],['Clean & Punch','2027-02-23','2027-03-08'],['Substantial Completion','2027-03-09',null]],'benchmarks for the architect')
}
