from common import *
S1='44444444-4444-4444-8444-444444444441'; R1='55555555-5555-4555-8555-555555555551'; I1='66666666-6666-4666-8666-666666666661'
path='r2:'+PROJ+'/drawings/A-101.pdf'
extra={
 'sheets':[{'id':S1,'project_id':PROJ,'number':'A-101','title':'FLOOR PLAN','discipline':'A','filed_under':None,'is_void':False,'scale':None}],
 'issuances':[{'id':I1,'project_id':PROJ,'kind':'bid_set','number':'1','title':'Bid Set','issued_on':'2026-09-01'}],
 'sheet_revisions':[{'id':R1,'sheet_id':S1,'issuance_id':I1,'revision_index':0,'revision_label':'Bid Set','file_path':path,'bytes':1500,'title_at_rev':'FLOOR PLAN','created_at':'2026-09-01T00:00:00Z','sheet_date':None,'issuances':{'kind':'bid_set','number':'1','issued_on':'2026-09-01'}}],
 'current_sheets':[{'sheet_id':S1,'project_id':PROJ,'number':'A-101','title':'FLOOR PLAN','discipline':'A','filed_under':None,'is_void':False,'revision_id':R1,'revision_index':0,'revision_label':'Bid Set','file_path':path,'issuance_kind':'bid_set','issuance_number':'1','issued_on':'2026-09-01','revision_count':1}],
}
