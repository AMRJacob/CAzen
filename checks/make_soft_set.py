"""soft_set.pdf: two 36x24 sheets. A-101 drawn as linework; M-101 a 100 dpi picture of linework over the whole sheet, with a text layer (as a CAD export with raster content has)."""
from reportlab.pdfgen import canvas
from PIL import Image, ImageDraw
W,H=36*72,24*72
img=Image.new('L',(3600,2400),255); d=ImageDraw.Draw(img)
for x in range(100,3500,60): d.line([(x,100),(x,2300)],fill=0,width=1)
for y in range(100,2300,60): d.line([(100,y),(3500,y)],fill=0,width=1)
img.save('/tmp/soft.png')
c=canvas.Canvas('soft_set.pdf',pagesize=(W,H))
for x in range(72,W-72,36): c.line(x,72,x,H-72)
c.setFont('Helvetica-Bold',28); c.drawString(W-300,60,'A-101'); c.setFont('Helvetica',14); c.drawString(W-300,100,'FLOOR PLAN'); c.showPage()
c.drawImage('/tmp/soft.png',0,0,W,H)
c.setFont('Helvetica-Bold',28); c.drawString(W-300,60,'M-101'); c.setFont('Helvetica',14); c.drawString(W-300,100,'MECHANICAL PLAN'); c.showPage(); c.save()
c=canvas.Canvas('soft_sheet.pdf',pagesize=(W,H)); c.drawImage('/tmp/soft.png',0,0,W,H); c.setFont('Helvetica',14); c.drawString(W-300,100,'MECHANICAL PLAN'); c.showPage(); c.save()
