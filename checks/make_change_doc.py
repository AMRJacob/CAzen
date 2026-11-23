# A made-up ASI bound as one PDF: a cover and its second page, two pages reissued into 09 91 00
# (page 3, and a new page 3A), a whole new section 08 43 13, and one D-size drawing.
# Also old_painting.pdf: the 09 91 00 already in the project, pages 1-5.
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
def spec_page(c, num, title, label, head=False, end=False, body='Body text for the section.'):
    c.setPageSize(letter)
    if head:
        c.setFont('Helvetica-Bold',13); c.drawString(72,720,f'SECTION {num}'); c.drawString(72,700,title)
    c.setFont('Helvetica',11); c.drawString(72,640,'PART 2 - PRODUCTS'); c.drawString(72,620,body)
    if end: c.drawString(72,560,f'END OF SECTION {num}')
    c.setFont('Helvetica',9); c.drawString(72,40,title); c.drawString(400,40,f'{num} - {label}')
    c.showPage()
c=canvas.Canvas('change_doc.pdf')
c.setPageSize(letter)
c.setFont('Helvetica',10); c.drawString(72,750,'STAND-IN ARCHITECTS')
c.setFont('Helvetica-Bold',18); c.drawString(72,700,"ARCHITECT'S SUPPLEMENTAL INSTRUCTIONS")
c.setFont('Helvetica',11)
for y,t in [(650,'PROJECT: Stand-in Office'),(630,'ASI No.: 004'),(610,'Date: November 20, 2026'),(590,'Subject: Revised storefront head and painting'),
            (540,'Item 1: SECTION 09 91 00 - replace page 3 and add page 3A.'),(520,'Item 2: SECTION 08 43 13 - added to the project manual.')]:
    c.drawString(72,y,t)
c.setFont('Helvetica',9); c.drawString(450,40,'Page 1 of 2'); c.showPage()
c.setPageSize(letter); c.setFont('Helvetica',11); c.drawString(72,700,'Item 3: Sheet A-201, revised storefront heads.'); c.setFont('Helvetica',9); c.drawString(450,40,'Page 2 of 2'); c.showPage()
spec_page(c,'09 91 00','PAINTING','3',body='REVISED page three.')
spec_page(c,'09 91 00','PAINTING','3A',body='NEW page three A.')
spec_page(c,'08 43 13','STOREFRONTS','1',head=True)
spec_page(c,'08 43 13','STOREFRONTS','2',end=True)
c.setPageSize((36*72,24*72)); c.setFont('Helvetica-Bold',30); c.drawString(36*72-300,60,'A-201'); c.setFont('Helvetica',16); c.drawString(36*72-300,110,'FLOOR PLAN'); c.showPage()
c.save()
o=canvas.Canvas('old_painting.pdf')
for k in range(1,6): spec_page(o,'09 91 00','PAINTING',str(k),head=k==1,end=k==5,body=f'Original page {k}.')
o.save()
