const test=require('node:test');
const assert=require('node:assert/strict');
const P=require('../promo-links.js');
test('promotion seeds distinguish cooler backpack, power station, and dashcam',()=>{
 const s=P.makeState();assert.equal(s.items.length,3);assert.match(s.items[0].category,/非车载冰箱/);
 assert.equal(s.items[0].affiliateUrl,'https://pboost.me/I6puEkFE?uid=pm_winter_gear_cooler');
 assert.equal(s.items[1].affiliateUrl,'');assert.equal(s.items[2].affiliateUrl,'');
 assert.ok(s.items.every(x=>P.validate(x)));assert.equal(s.pending.length,3);
});
test('source evidence never gets overwritten by merchant or affiliate URL',()=>{
 const x={...P.SEEDS[0],sourceUrl:'https://example.com/evidence'};
 const y=P.validate(x);assert.equal(y.sourceUrl,'https://example.com/evidence');
 assert.notEqual(y.sourceUrl,y.affiliateUrl);assert.notEqual(y.landingPage,y.affiliateUrl);
});
test('rejects mismatched UIDs and false verified links',()=>{
 const x={...P.SEEDS[0]};
 assert.throws(()=>P.validate({...x,uid:'wrong_uid'}),/UID 不匹配/);
 assert.throws(()=>P.validate({...x,affiliateUrl:''}),/已验证状态必须/);
 assert.throws(()=>P.validate({...x,landingPage:'http://parkmemoir.com'}),/HTTPS/);
 assert.throws(()=>P.validate({...x,affiliateUrl:'https://example.com/product'}),/uid 与本行/);
});
test('UID is appended to actual PB tracking base, never inferred from merchant URL',()=>{
 assert.equal(P.withUid('https://pboost.me/abc','pm_test_campaign'),'https://pboost.me/abc?uid=pm_test_campaign');
 assert.throws(()=>P.withUid('https://us.ankersolix.com/products/c1000-gen2','bad uid'),/UID/);
});
function cloud(){
 let rows=[P.HEADERS];
 return{
  get rows(){return rows},
  ensureTabs:async()=>{},
  values:async()=>rows,
  append:async(_id,_tab,_range,vals)=>{rows.push(...vals);},
  put:async(_id,_tab,range,vals)=>{const row=Number(range.match(/^A(\d+)/)[1]);rows[row-1]=vals[0];}
 };
}
const settings={keywordId:'test_keywords_workbook'};
test('first Google sync writes 3 seed records and later reads them without duplicates',async()=>{
 const api=cloud(),a={},b={};let first=await P.sync(api,settings,a);
 assert.equal(first.pending,0);assert.equal(api.rows.length,4);
 let again=await P.sync(api,settings,b);assert.equal(again.pending,0);assert.equal(again.conflicts,0);assert.equal(api.rows.length,4);
 assert.equal(b.promotions.items[1].status,'待生成 PB 深链');
});
test('cloud timestamp conflict retains local edits, never silently overwrites',async()=>{
 const api=cloud(),b={};await P.sync(api,settings,b);
 const x=b.promotions.items[1],old=x.remoteUpdated;x.note='local change';b.promotions.pending.push({id:x.id,baseUpdated:old});
 api.rows[2][14]='changed on another browser';api.rows[2][15]='2099-01-01T00:00:00.000Z';
 const res=await P.sync(api,settings,b);
 assert.equal(res.conflicts,1);assert.equal(res.pending,1);
 assert.equal(api.rows[2][14],'changed on another browser');
});
