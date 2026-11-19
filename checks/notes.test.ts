import { guessCategory, fileNote, unfileNote, headingsOf, catchAll } from '../src/lib/noteSort.ts'
const eq=(a:unknown,b:unknown,n:string)=>{const ok=JSON.stringify(a)===JSON.stringify(b);console.log(ok?'ok  ':'FAIL',n,ok?'':JSON.stringify(a)+' != '+JSON.stringify(b))}
const V=['Site / Parking','Structure','Envelope','Interior']
eq(guessCategory('Steel topped out at grid C, deck welds in progress',V),1,'steel → Structure')
eq(guessCategory('roofing membrane down on the east half, flashing at parapet not started',V),2,'roof → Envelope')
eq(guessCategory('curb and sidewalk poured at the north parking lot',V),0,'curb → Site / Parking')
eq(guessCategory('drywall hung level 2, blocking missing at grab bars room 214',V),3,'drywall → Interior')
eq(guessCategory('owner asked about the ribbon cutting',V),-1,'nothing forced')
const M=['Job Progress (Scheduled Progress / Revisions)','Status of Submittals','Payment Requests','Additional Notes']
eq(guessCategory('contractor is two weeks behind on the look-ahead',M),0,'behind → Job Progress')
eq(guessCategory('resinous flooring submittal came in, shop drawings for casework due Friday',M),1,'submittal → Submittals')
eq(guessCategory('pay app 6 is short the retainage release',M),2,'pay app → Payment')
const start='1. Site / Parking\n  a. \n2. Structure\n  a. \n3. Envelope\n  a. \n4. Interior\n  a. '
const one=fileNote(start,1,'Steel topped out at grid C')
eq(one,'1. Site / Parking\n  a. \n2. Structure\n  a. Steel topped out at grid C\n3. Envelope\n  a. \n4. Interior\n  a. ','filed under Structure')
const two=fileNote(one,1,'Deck welds in progress')
eq(two.split('\n').slice(2,5),['2. Structure','  a. Steel topped out at grid C','  b. Deck welds in progress'],'second note is b.')
eq(fileNote(unfileNote(two,1,'Deck welds in progress'),2,'Deck welds in progress').split('\n').slice(2,7),['2. Structure','  a. Steel topped out at grid C','3. Envelope','  a. Deck welds in progress','4. Interior'],'moved to another category')
eq(headingsOf(start),['Site / Parking','Structure','Envelope','Interior','General'],'a catch-all is offered when the page has none')
eq(fileNote(start,4,'Owner asked about the ribbon cutting').split('\n').slice(-2),['5. General','  a. Owner asked about the ribbon cutting'],'and is made when first used')
eq(catchAll(M),3,'Additional Notes is the meeting catch-all')
eq(headingsOf(M.map((h,i)=>`${i+1}. ${h}\n  a. `).join('\n')).length,4,'no second catch-all added')
const g=fileNote(start,4,'Owner asked about the ribbon cutting')
eq(fileNote(unfileNote(g,4,'Owner asked about the ribbon cutting'),3,'Owner asked about the ribbon cutting').split('\n').slice(-2),['4. Interior','  a. Owner asked about the ribbon cutting'],'an emptied catch-all leaves the page')
