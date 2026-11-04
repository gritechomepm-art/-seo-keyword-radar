from pathlib import Path
import subprocess,tempfile
from openpyxl import load_workbook
root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as d:
    target=Path(d)/'export.xlsx'
    script="const fs=require('fs'),X=require('./xlsx-export.js');fs.writeFileSync(process.argv[1],X.workbook([{name:'关键词',rows:[['关键词','搜索量','CPC','备注'],['power bank',0,null,'=HYPERLINK(\"https://example.com\")'],['中文 & <测试>',1200,1.2,'未核验']]},{name:'来源与说明',rows:[['项目','来源'],['采集','Google Autocomplete']]}]));"
    subprocess.run(['node','-e',script,str(target)],cwd=root,check=True)
    w=load_workbook(target)
    s=w['关键词']
    assert s['B2'].value==0
    assert s['C2'].value is None
    assert s['D2'].data_type=='s'
    assert s['A3'].value=='中文 & <测试>'
    assert s['C3'].value==1.2
    assert s.freeze_panes=='A2'
    assert s.auto_filter.ref=='A1:D3'
    assert s['A1'].font.bold
    assert w['来源与说明']['B2'].value=='Google Autocomplete'
print('PASS: XLSX opened in openpyxl; data types, unknowns, Unicode, formula-like text, styles and metadata verified')
