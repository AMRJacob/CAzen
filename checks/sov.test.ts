import { readSov, sovTotal, money } from '../src/lib/sovPaste.ts'
const eq=(a:unknown,b:unknown,n:string)=>{const ok=JSON.stringify(a)===JSON.stringify(b);console.log(ok?'ok  ':'FAIL',n,ok?'':JSON.stringify(a)+' != '+JSON.stringify(b))}
eq(money('$1,234.50'),1234.5,'money $'); eq(money('(500.00)'),-500,'money paren'); eq(money('Level 2'),null,'not money'); eq(money('2026'),2026,'bare int')
const xl=readSov('Item No.\tDescription of Work\tScheduled Value\n1\tGeneral Conditions\t$125,000.00\n2\tSitework\t88,450.00\nDIVISION 03\n3\tConcrete\t210,000\n\nGRAND TOTAL\t\t423,450.00')
eq(xl.length,4,'excel: 4 lines (header and total dropped)'); eq(xl[0],{item_no:'1',description:'General Conditions',scheduled_value:125000,is_heading:false},'excel line 1'); eq(xl[2].is_heading,true,'heading'); eq(sovTotal(xl),423450,'excel total')
const g=readSov('1\tMobilization\t10,000.00\t5,000.00\t2,000.00\t0.00\t7,000.00\t70%\t3,000.00')
eq(g[0].scheduled_value,10000,'G703 row: first money column is the scheduled value')
const pdf=readSov('1   Mobilization          10,000.00\n2. Earthwork and grading 45,300.00\n09 51 00   Acoustical Ceilings   18,250.00\nRoofing 62,000.00')
eq(pdf.map(l=>[l.item_no,l.description,l.scheduled_value]),[['1','Mobilization',10000],['2','Earthwork and grading',45300],['09 51 00','Acoustical Ceilings',18250],[null,'Roofing',62000]],'pdf spacing')
const yr=readSov('5\tLevel 2 framing\t12,000.00'); eq(yr[0].description,'Level 2 framing','digits inside description kept')
const neg=readSov('12\tDeduct alternate 1\t(4,500.00)'); eq(neg[0].scheduled_value,-4500,'negative')
