const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../radar-core.js');
const {Client}=require('../radar-sheets.js');
const settings={keywordId:'test_keywords_workbook',competitorId:'test_competitors_workbook'};
class FakeSheets{
 constructor(){this.next=10;this.calls=[];this.failure=null;this.books={};this.add(settings.keywordId,'Untitled',[['Keyword','Volume','CPC','Ads','DR','Trend','','','','Gap','Rating'],['national park checklist',1000,0.5,1,20,'平稳','','','','待验证','高潜']]);this.add(settings.keywordId,C.LEGACY.keywordTab,[C.HEADERS.slice(0,14)]);this.add(settings.keywordId,'03_国家公园_正式关键词',[['只读公式结果'],['=FILTER(Untitled!A2:K,...)']]);this.add(settings.competitorId,C.LEGACY.competitorTab,[C.RIVAL_HEADERS]);}
 add(id,title,rows,columns){this.books[id]||={};this.books[id][title]={sheetId:this.next++,title,gridProperties:{rowCount:1000,columnCount:columns||Math.max(1,...rows.map(r=>r.length))},rows:structuredClone(rows)};}
 response(status,data){return{ok:status<400,status,json:async()=>data};}
 async fetch(url,options={}){
  const parsed=new URL(url),raw=decodeURIComponent(parsed.pathname.replace('/v4/spreadsheets/','')),method=options.method||'GET',body=options.body?JSON.parse(options.body):null;
  this.calls.push({raw,method,body});
  if(this.failure&&this.failure({raw,method,body}))return this.response(this.failure.status||403,{error:{message:'injected failure'}});
  if(raw.endsWith(':batchUpdate')){const id=raw.slice(0,-12);this.books[id]||={};for(const op of body.requests){if(op.addSheet){const p=op.addSheet.properties;if(this.books[id][p.title])return this.response(400,{error:{message:'exists'}});this.add(id,p.title,[],p.gridProperties.columnCount);}if(op.updateSheetProperties){const p=op.updateSheetProperties.properties,s=Object.values(this.books[id]).find(s=>s.sheetId===p.sheetId);s.gridProperties.columnCount=p.gridProperties.columnCount;}}return this.response(200,{});}
  const cut=raw.indexOf('/values/');
  if(cut<0){const book=this.books[raw];if(!book)return this.response(404,{error:{message:'book not found'}});return this.response(200,{sheets:Object.values(book).map(({rows,...properties})=>({properties}))});}
  const id=raw.slice(0,cut),full=raw.slice(cut+8),append=full.endsWith(':append'),a1=append?full.slice(0,-7):full,match=a1.match(/^'((?:[^']|'')+)'!(.*)$/);assert.ok(match,'quoted A1 range');const title=match[1].replace(/''/g,"'"),s=this.books[id]?.[title];if(!s)return this.response(404,{error:{message:'tab missing'}});
  const bounds=match[2].match(/^([A-Z]+)(\d*)?(?::([A-Z]+)(\d*)?)?$/);assert.ok(bounds,match[2]);const col=letters=>[...letters].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;const startCol=col(bounds[1]),endCol=col(bounds[3]||bounds[1]),startRow=Number(bounds[2]||1)-1,endRow=bounds[4]?Number(bounds[4]):bounds[3]?s.rows.length:Number(bounds[2]||s.rows.length);
  if(method==='GET'){let values=s.rows.slice(startRow,endRow).map(r=>r.slice(startCol,endCol+1));while(values.length&&!values.at(-1).some(v=>v!==''&&v!=null))values.pop();return this.response(200,{values});}
  assert.notEqual(title,'03_国家公园_正式关键词','formula result must never be written');
  if(append){for(const row of body.values){const out=[];row.forEach((v,i)=>out[startCol+i]=v);s.rows.push(out);}}else{for(let i=0;i<body.values.length;i++){s.rows[startRow+i]||=[];for(let j=0;j<body.values[i].length;j++)s.rows[startRow+i][startCol+j]=body.values[i][j];}}
  return this.response(200,{updates:{updatedRows:body.values.length}});
 }
 client(options={}){return new Client({getToken:()=> 'unit-test-token',fetcher:this.fetch.bind(this),...options});}
}
test('v1 cache migration keeps pending edits; different pools keep the same keyword independent',()=>{
 const old={official:[{keyword:'national park checklist',volume:0}],pending:[{type:'review',keyword:'national park checklist',status:'研究中',baseUpdated:'old'}]};const migrated=C.migrate(old);assert.deepEqual(migrated.caches[C.LEGACY.id].pending,old.pending);assert.equal(migrated.caches[C.LEGACY.id].official[0].volume,0);
 const a=C.emptyCache(),b=C.emptyCache(),pa=C.createPool('Power Bank','US','en','p_powerbank1'),pb=C.createPool('Laptop','US','en','p_laptop0001');C.addCandidates(a,[{keyword:'POWER   BANK'}],pa);C.addCandidates(b,[{keyword:'power bank'}],pb);C.enqueueReview(a,'power bank','批准立项','Evidence');assert.equal(C.records(a)[0].review.status,'批准立项');assert.equal(C.records(b)[0].review.status,'待验证');assert.equal(C.addCandidates(a,[{keyword:' power bank '}],pa).duplicates,1);
});
test('unknown metrics remain null; measured zero stays zero; legacy filtering never applies to new pools',()=>{
 const parsed=C.parseCandidates([C.HEADERS,['seed','power bank','','','','',0,'',null,'']]);assert.equal(parsed[0].volume,0);assert.equal(parsed[0].cpc,null);assert.equal(parsed[0].dr,null);const p=C.createPool('Power Bank','US','en','p_powerbank1'),row=C.candidateRow({keyword:'power bank'},p);assert.equal(row[6],'');assert.equal(row[19],'待核验');assert.equal(C.parseMaster([[],['power bank',10000],['zion with kids',100]])[0].keyword,'zion with kids');assert.equal(C.parseCandidates([C.HEADERS,row])[0].keyword,'power bank');
});
test('new cloud pool creation is idempotent and does not touch legacy formula output',async()=>{
 const mock=new FakeSheets(),api=mock.client(),p=C.createPool('Power Bank','US','en','p_powerbank1');await api.ensurePool(settings,p);await api.ensurePool(settings,p);assert.equal(mock.books[settings.keywordId][C.REGISTRY].rows.length,2);assert.ok(mock.books[settings.keywordId][p.keywordTab]);assert.ok(mock.books[settings.keywordId][p.competitorTab]);assert.ok(mock.books[settings.keywordId][p.reviewTab]);assert.equal((await api.loadPools(settings))[0].id,p.id);
 const local=C.emptyCache();C.addCandidates(local,[{keyword:'power bank for travel'}],p);const cloud=await api.read(settings,p),result=await api.flush(settings,p,cloud,local.pending);assert.equal(result.remains.length,0);assert.equal(mock.books[settings.keywordId][p.keywordTab].rows[1][1],'power bank for travel');assert.equal(mock.books[settings.keywordId][C.LEGACY.keywordTab].rows.length,1);
});
test('legacy additions extend provenance columns and write only to the candidate tab',async()=>{
 const mock=new FakeSheets(),api=mock.client(),p=structuredClone(C.LEGACY),local=C.emptyCache();C.addCandidates(local,[{keyword:'national park in january',seed:'national park'}],p);const before=structuredClone(mock.books[settings.keywordId]['03_国家公园_正式关键词'].rows);const result=await api.flush(settings,p,await api.read(settings,p),local.pending);assert.equal(result.written,1);assert.equal(mock.books[settings.keywordId][p.keywordTab].gridProperties.columnCount,22);assert.deepEqual(mock.books[settings.keywordId]['03_国家公园_正式关键词'].rows,before);assert.equal(mock.books[settings.keywordId][p.keywordTab].rows[1][19],'待核验');
});
test('conflicting review is retained and never overwrites a newer cloud decision',async()=>{
 const mock=new FakeSheets(),api=mock.client(),p=structuredClone(C.LEGACY),cloud=C.emptyCache();cloud.reviews['keyword']={status:'已核验',note:'new evidence',updated:'new',row:2};const pending=[{type:'review',keyword:'keyword',status:'批准立项',note:'local',baseUpdated:'old'}],result=await api.flush(settings,p,cloud,pending);assert.equal(result.conflicts.length,1);assert.equal(result.remains.length,1);assert.equal(mock.calls.length,0);
});
test('partial write failure retains the original operation for retry; no failed data is claimed synced',async()=>{
 const mock=new FakeSheets(),api=mock.client(),p=structuredClone(C.LEGACY),local=C.emptyCache();C.addCandidates(local,[{keyword:'national park packing list'}],p);mock.failure=({raw,method})=>method==='POST'&&raw.includes('/values/');const result=await api.flush(settings,p,await api.read(settings,p),local.pending);assert.equal(result.written,0);assert.equal(result.remains.length,1);assert.match(result.errors[0],/injected/);assert.equal(mock.books[settings.keywordId][p.keywordTab].rows.length,1);
});
test('unauthorized write stops retries and keeps all remaining pending operations',async()=>{
 const mock=new FakeSheets(),p=structuredClone(C.LEGACY),local=C.emptyCache();C.addCandidates(local,[{keyword:'national park one'},{keyword:'national park two'}],p);let unauthorized=0;const api=mock.client({onUnauthorized:()=>unauthorized++}),cloud=await api.read(settings,p);mock.failure=({method})=>method==='POST';mock.failure.status=401;const result=await api.flush(settings,p,cloud,local.pending);assert.equal(result.remains.length,2);assert.equal(unauthorized,1);
});
test('unrecognized provenance columns are preserved, not silently overwritten',async()=>{
 const mock=new FakeSheets(),api=mock.client();mock.books[settings.keywordId][C.LEGACY.keywordTab].rows[0][14]='My custom field';mock.books[settings.keywordId][C.LEGACY.keywordTab].gridProperties.columnCount=22;await assert.rejects(()=>api.ensureCandidateColumns(settings,C.LEGACY),/已有其他字段/);assert.equal(mock.books[settings.keywordId][C.LEGACY.keywordTab].rows[0][14],'My custom field');
});
test('suggestion requests include selected market; bounded query generation normalizes and deduplicates',()=>{
 const queries=C.buildQueries('Power Bank\npower bank','usb c,USB C,for travel');assert.equal(queries.length,3);const p=C.createPool('Test','GB','en','p_market0001'),url=new URL(C.suggestionUrl(queries[0].query,p,'__radar_suggest_test'));assert.equal(url.searchParams.get('gl'),'gb');assert.equal(url.searchParams.get('hl'),'en');assert.throws(()=>C.buildQueries('one\ntwo\nthree\nfour\nfive','abcdefghijklmnopqrstuvwxyz'.split('').join(',')),/60/);assert.equal(C.safeUrl('javascript:alert(1)'),'');assert.equal(C.html('<img src=x>'),'&lt;img src=x&gt;');
});

test('a review already applied after a lost acknowledgement is not written or conflicted again',async()=>{
 const mock=new FakeSheets(),api=mock.client(),cloud=C.emptyCache();cloud.reviews['power bank']={status:'研究中',note:'same evidence',updated:'server-new',row:2};const pending=[{type:'review',keyword:'power bank',status:'研究中',note:'same evidence',baseUpdated:'old'}];const result=await api.flush(settings,C.LEGACY,cloud,pending);assert.equal(result.remains.length,0);assert.equal(result.conflicts.length,0);assert.equal(mock.calls.length,0);
});


test('plugin records stay isolated and preserve unknown vs zero metrics',()=>{
 const r=C.parsePluginText('Top Keywords\nhairstyle ai\nTraffic 1.3K Volume 1.1K CPC $0.35 Ads 1\nai hairstyle changer\nTraffic 360 Volume 1.7K CPC $0.97 Ads 4\nportable charger\nVolume 2,000 CPC $0 Ads 0');
 assert.equal(r.items.length,3);assert.deepEqual(r.items.map(x=>[x.volume,x.cpc,x.ads]),[[1100,.35,1],[1700,.97,4],[2000,0,0]]);
 const partial=C.parsePluginText('first keyword\nCPC $0.5\nsecond keyword\nVolume 3K');assert.equal(partial.items[0].volume,null);assert.equal(partial.items[1].cpc,null);assert.equal(partial.items[1].ads,null);
 assert.equal(C.commercialScreen(partial.items[1]),'指标待补齐');assert.match(C.commercialScreen(r.items[0]),/初筛通过/);
});
test('plugin tabular headers control column order and malformed or unlabelled rows are rejected',()=>{
 const r=C.parsePluginText('Keyword\tCPC\tAds\tVolume\tTraffic\nportable charger\t$0.45\t1\t2.5M\t1K\nbad row\t$0.3\t1');
 assert.equal(r.items.length,1);assert.equal(r.items[0].volume,2500000);assert.equal(r.items[0].cpc,.45);assert.ok(r.warnings.length);
 assert.equal(C.parsePluginText('power bank\t1K\t2K\t$0.4\t1').items.length,0);
 const vertical=C.parsePluginText('power bank\nVolume\n1.2K\nCPC\n$0.3\nAds\n0');assert.equal(vertical.items[0].volume,1200);assert.equal(vertical.items[0].ads,0);
 const bad=C.parsePluginText('power bank Volume 1K CPC $0.3 Ads 1.5');assert.equal(bad.items[0].ads,null);assert.ok(bad.warnings.length);
});
test('plugin estimates survive queue, retry, Sheets and round-trip without fabricated DR or trend',async()=>{
 const mock=new FakeSheets(),api=mock.client(),p=C.createPool('Plugin US','US','en','p_plugin0001');await api.ensurePool(settings,p);
 const local=C.emptyCache(),item={...C.parsePluginText('power bank Volume 1.2K CPC $0.5 Ads 0').items[0],metricSource:'SiteData（插件估算）',metricDate:'2026-11-05',url:'https://example.com',domain:'example.com'};
 const result=C.addCandidates(local,[item,{...item,keyword:'POWER BANK'}],p,{pluginImport:true});assert.equal(result.duplicates,1);assert.equal(local.pending[0].item.volume,1200);assert.equal(result.added[0].dr,null);assert.equal(result.added[0].trend,'待核验');assert.equal(C.records(local)[0].review.status,'待验证');
 const cloud=await api.read(settings,p);await api.flush(settings,p,cloud,local.pending);const restored=await api.read(settings,p);assert.equal(restored.candidates[0].volume,1200);assert.equal(restored.candidates[0].ads,0);assert.equal(restored.candidates[0].metricSource,item.metricSource);assert.equal(restored.candidates[0].dr,null);
 const ordinary=C.emptyCache();C.addCandidates(ordinary,[item],p);assert.equal(ordinary.candidates[0].volume,null,'ordinary collection must not manufacture metrics');
});
