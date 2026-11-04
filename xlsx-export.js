/* Minimal OOXML exporter: stored ZIP, inline strings, typed numbers. No CDN required. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadarExcel=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const utf8=new TextEncoder();
  const xml=s=>String(s??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const table=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
  function crc32(bytes){let crc=0xffffffff;for(const b of bytes)crc=table[(crc^b)&255]^(crc>>>8);return(crc^0xffffffff)>>>0;}
  function cat(parts){const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of parts){out.set(p,offset);offset+=p.length;}return out;}
  function header(length,values){const a=new Uint8Array(length),v=new DataView(a.buffer);for(const [offset,value,size]of values)size===2?v.setUint16(offset,value,true):v.setUint32(offset,value,true);return a;}
  function zip(files){
    const chunks=[],central=[];let offset=0;
    for(const [path,text]of files){
      const name=utf8.encode(path),data=utf8.encode(text),crc=crc32(data);
      const local=header(30,[[0,0x04034b50,4],[4,20,2],[6,0x800,2],[12,33,2],[14,crc,4],[18,data.length,4],[22,data.length,4],[26,name.length,2]]);
      chunks.push(local,name,data);
      const entry=header(46,[[0,0x02014b50,4],[4,20,2],[6,20,2],[8,0x800,2],[14,33,2],[16,crc,4],[20,data.length,4],[24,data.length,4],[28,name.length,2],[42,offset,4]]);
      central.push(entry,name);offset+=local.length+name.length+data.length;
    }
    const directory=cat(central),end=header(22,[[0,0x06054b50,4],[8,files.length,2],[10,files.length,2],[12,directory.length,4],[16,offset,4]]);
    return cat([...chunks,directory,end]);
  }
  function column(n){let out='';for(n++;n>0;n=Math.floor((n-1)/26))out=String.fromCharCode(65+(n-1)%26)+out;return out;}
  function sheetXml(rows){
    const count=Math.max(1,...rows.map(r=>r.length)),last=column(count-1)+Math.max(1,rows.length);
    const data=rows.map((row,i)=>'<row r="'+(i+1)+'"'+(i===0?' ht="26" customHeight="1"':'')+'>'+row.map((value,j)=>{
      const pos=column(j)+(i+1),style=i===0?' s="1"':'';
      if(value===null||value===undefined||value==='')return'<c r="'+pos+'"'+style+'/>';
      if(typeof value==='number'&&Number.isFinite(value))return'<c r="'+pos+'"'+style+'><v>'+value+'</v></c>';
      return'<c r="'+pos+'" t="inlineStr"'+style+'><is><t xml:space="preserve">'+xml(value)+'</t></is></c>';
    }).join('')+'</row>').join('');
    return'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:'+last+'"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols>'+Array.from({length:count},(_,j)=>'<col min="'+(j+1)+'" max="'+(j+1)+'" width="'+(j===0?38:22)+'" customWidth="1"/>').join('')+'</cols><sheetData>'+data+'</sheetData>'+(rows.length?'<autoFilter ref="A1:'+last+'"/>':'')+'</worksheet>';
  }
  function workbook(sheets){
    if(!sheets.length)throw Error('没有可导出的工作表');
    const seen=new Set();
    sheets=sheets.map((s,i)=>{let name=String(s.name||'Sheet'+(i+1)).replace(/[\\/?*\[\]:]/g,' ').slice(0,28)||'Sheet';while(seen.has(name))name=name.slice(0,25)+'_'+i;seen.add(name);return{...s,name};});
    const ns='http://schemas.openxmlformats.org/';
    const files=[
      ['[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+sheets.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>'],
      ['_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="'+ns+'package/2006/relationships"><Relationship Id="rId1" Type="'+ns+'officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml','<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="'+ns+'spreadsheetml/2006/main" xmlns:r="'+ns+'officeDocument/2006/relationships"><sheets>'+sheets.map((s,i)=>'<sheet name="'+xml(s.name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>'],
      ['xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="'+ns+'package/2006/relationships">'+sheets.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="'+ns+'officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'<Relationship Id="rId'+(sheets.length+1)+'" Type="'+ns+'officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ['xl/styles.xml','<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="'+ns+'spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF55715B"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
      ...sheets.map((s,i)=>['xl/worksheets/sheet'+(i+1)+'.xml',sheetXml(s.rows)])
    ];
    return zip(files);
  }
  return{workbook};
});
