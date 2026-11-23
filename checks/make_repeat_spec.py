# A small manual with 09 91 00 bound in twice, far apart: pages 2-3 and again at 8-9.
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
secs=[('01 10 00','SUMMARY',2),('09 91 00','PAINTING',2),('03 30 00','CAST-IN-PLACE CONCRETE',2),('04 20 00','UNIT MASONRY',1),('09 91 00','PAINTING',2),('07 92 00','JOINT SEALANTS',2)]
c=canvas.Canvas('repeat_spec.pdf',pagesize=letter)
for num,title,n in secs:
    for k in range(1,n+1):
        if k==1:
            c.setFont('Helvetica-Bold',13); c.drawString(72,720,f'SECTION {num}'); c.drawString(72,700,title)
        c.setFont('Helvetica',11); c.drawString(72,640,f'PART {k} - GENERAL'); c.drawString(72,620,'Body text for the section.')
        if k==n: c.drawString(72,560,f'END OF SECTION {num}')
        c.setFont('Helvetica',9); c.drawString(72,40,f'{title}'); c.drawString(400,40,f'{num} - {k}')
        c.showPage()
c.save()
