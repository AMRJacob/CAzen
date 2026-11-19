import { layOut, ratioOf, captionOf } from '../src/lib/photoSheet.ts'
const ok=(c:boolean,n:string,more='')=>console.log(c?'ok  ':'FAIL',n,more)
const room={width:532,height:678,pad:5,line:9.5,lines:()=>1}
const mix=[4/3,4/3,3/4,4/3,16/9,3/4,3/4,4/3,1,4/3,4/3,3/4,16/9,4/3,4/3,3/4,4/3].map((ratio,i)=>({id:'p'+i,ratio}))
for (const perRow of [2,3,4]) {
  const {boxes,pages}=layOut(mix,{...room,perRow})
  ok(boxes.length===mix.length,`${perRow} a row: every photograph is placed`,`${pages} pages`)
  const rows=new Map<string,typeof boxes>(); for(const b of boxes){const k=b.page+':'+b.y.toFixed(2); rows.set(k,[...(rows.get(k)??[]),b])}
  ok([...rows.values()].every(r=>r.every(b=>Math.abs(b.ph-r[0].ph)<0.01)),`${perRow} a row: one height across each row`)
  ok(boxes.every(b=>b.x>=-0.01&&b.x+b.w<=room.width+0.01&&b.y+b.h<=room.height+0.01),`${perRow} a row: nothing off the page`)
  ok(boxes.every(b=>Math.abs(b.pw/b.ph-mix.find(m=>m.id===b.id)!.ratio)<0.001),`${perRow} a row: no photograph stretched`)
  const used=[...Array(pages)].map((_,p)=>Math.max(...boxes.filter(b=>b.page===p).map(b=>b.y+b.h))/room.height)
  console.log('     share of each page used:',used.map(u=>Math.round(u*100)+'%').join(' '))
  const full=[...rows.values()].slice(0,-1).filter(r=>Math.abs(r.reduce((s,b)=>s+b.w,0)-room.width)<0.5).length
  console.log('     rows filling the width:',full,'of',rows.size-1,'(last row aside)')
}
const one=layOut([{id:'a',ratio:3/4}],{...room,perRow:2}); ok(one.boxes[0].ph<=room.height&&one.pages===1,'a lone portrait fits a page')
ok(layOut([],{...room,perRow:2}).pages===0,'no photographs, no pages')
ok(Math.abs(ratioOf(2000,1500,{x:0,y:0,w:0.5,h:1})-2/3)<1e-9,'a crop changes the shape')
ok(captionOf(3,'hay bale')==='03 – HAY BALE'&&captionOf(12,'')==='12','captions are numbered')
