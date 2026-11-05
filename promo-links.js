/* Affiliate promotion configuration: independent of keyword evidence URLs.
   Local-first and synced to the existing keyword workbook only after Google authorization. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadarPromo=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const TAB='06_推广链接配置';
const FIELDS=['id','sourceUrl','landingPage','category','brand','model','merchantUrl','affiliateUrl','channel','uid','commission','verifiedAt','expiresAt','status','note','updatedAt'];
const HEADERS=['配置 ID','来源网址（研究证据）','PARKMEMOIR 对应落地页','品类','品牌','型号 / ASIN','商品官网网址（非联盟）','PartnerBoost 联盟深链','推广渠道','活动 UID','佣金（已核验才填）','核验日期','活动截止日期','链接状态','备注','更新时间'];
const LANDING='https://parkmemoir.com/which-national-parks-are-open-in-winter/';
const SEEDS=[
{id:'rivonova-20l-cooler-seo',sourceUrl:'',landingPage:LANDING,category:'保温冷藏背包（非车载冰箱）',brand:'RIVONOVA',model:'20L Black Cooler Backpack',merchantUrl:'',affiliateUrl:'https://pboost.me/I6puEkFE?uid=pm_winter_gear_cooler',channel:'SEO / PARKMEMOIR',uid:'pm_winter_gear_cooler',commission:'15%（按此前记录，结算前复核）',verifiedAt:'2026-11-05',expiresAt:'',status:'已记录已验证链接',note:'先前已确认的 PB 跟踪链接；这不是 12V 压缩机车载冰箱。链接实际跳转及 SKU 资格应在发布前再次复核。'},
{id:'anker-c1000gen2-seo',sourceUrl:'',landingPage:LANDING,category:'户外电源 / TIER 04',brand:'Anker SOLIX',model:'C1000 Gen 2 · 1024Wh',merchantUrl:'https://us.ankersolix.com/products/c1000-gen2',affiliateUrl:'',channel:'SEO / PARKMEMOIR',uid:'pm_winter_gear_power_anker',commission:'',verifiedAt:'',expiresAt:'',status:'待生成 PB 深链',note:'品牌申请已通过；官网地址不是联盟链接。需在 PartnerBoost 为此型号生成深链并验证计佣。'},
{id:'vantrue-n4pros-seo',sourceUrl:'',landingPage:LANDING,category:'行车记录仪 / TIER 03',brand:'Vantrue',model:'N4 Pro S · 4K 三路',merchantUrl:'https://www.vantrue.com/products/n4-pro-s',affiliateUrl:'',channel:'SEO / PARKMEMOIR',uid:'pm_winter_gear_dashcam_vantrue',commission:'',verifiedAt:'',expiresAt:'',status:'待生成 PB 深链',note:'品牌申请已通过；需生成 N4 Pro S 的商品级 PB 深链并验证此 SKU 计佣。'}
];
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url=s=>{try{const u=new URL(String(s||'').trim());return u.protocol==='https:'?u.href:'';}catch{return '';}};
function validate(x){
 const out={};for(const k of FIELDS)out[k]=String(x[k]??'').trim();
 if(!/^[a-z0-9][a-z0-9_-]{2,79}$/.test(out.id))throw Error('配置 ID 格式无效');
 if(!out.brand||!out.model)throw Error('品牌和商品型号不能为空');
 if(!url(out.landingPage)||!out.landingPage.startsWith('https://parkmemoir.com/'))throw Error('落地页必须是 PARKMEMOIR 的 HTTPS 页面');
 for(const k of ['sourceUrl','merchantUrl','affiliateUrl'])if(out[k]&&!url(out[k]))throw Error(k+' 必须是有效 HTTPS 网址');
 if(!/^[a-zA-Z0-9_-]{5,96}$/.test(out.uid))throw Error('UID 应为 5–96 位字母、数字、下划线或连字符');
 if(out.affiliateUrl){const actual=new URL(out.affiliateUrl).searchParams.get('uid');if(actual!==out.uid)throw Error('联盟链接中的 uid 与本行活动 UID 不匹配');}
 if(out.status==='已记录已验证链接'&&(!out.affiliateUrl||!out.verifiedAt))throw Error('已验证状态必须有联盟链接和核验日期');
 if(out.expiresAt&&out.verifiedAt&&out.expiresAt<out.verifiedAt)throw Error('活动结束日期不能早于核验日期');
 return out;
}
function makeState(){const now=new Date().toISOString();const items=SEEDS.map(x=>({...x,updatedAt:now,remoteUpdated:''}));return{items,pending:items.map(x=>({id:x.id,baseUpdated:''})),conflicts:[],lastSync:''};}
function state(bucket){if(!bucket.promotions||!Array.isArray(bucket.promotions.items))bucket.promotions=makeState();return bucket.promotions;}
function toRow(x){return FIELDS.map(k=>x[k]||'');}
function fromRow(r,row){const x={};FIELDS.forEach((k,i)=>x[k]=String(r[i]??''));x.remoteUpdated=x.updatedAt;x.sheetRow=row;return x;}
function withUid(base,uid){const u=url(base);if(!u)throw Error('先在 PartnerBoost 复制商品级 HTTPS 跟踪链接，而不是官网商品地址');if(!/^[a-zA-Z0-9_-]{5,96}$/.test(uid))throw Error('UID 格式不正确');const p=new URL(u);p.searchParams.set('uid',uid);return p.toString();}
function csv(rows){return '\ufeff'+rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');}
async function sync(client,settings,bucket){
 const s=state(bucket);await client.ensureTabs(settings.keywordId,[{title:TAB,headers:HEADERS,strict:true}]);
 const getRemote=async()=>{const rows=await client.values(settings.keywordId,TAB,'A1:P1000');return rows.slice(1).map((r,i)=>fromRow(r,i+2)).filter(x=>x.id);};
 let remote=await getRemote();const remoteMap=new Map(remote.map(x=>[x.id,x]));const conflicts=[];const remains=[];
 for(const op of s.pending){
  const local=s.items.find(x=>x.id===op.id);if(!local)continue;
  const there=remoteMap.get(op.id);
  if(there&&(there.updatedAt||'')!==(op.baseUpdated||'')){
   if(JSON.stringify(toRow({...local,updatedAt:''}))===JSON.stringify(toRow({...there,updatedAt:''})))continue;
   conflicts.push({id:op.id,cloudUpdated:there.updatedAt,baseUpdated:op.baseUpdated});remains.push(op);continue;
  }
  try{
   const clean=validate(local),now=new Date().toISOString();clean.updatedAt=now;
   if(there)await client.put(settings.keywordId,TAB,'A'+there.sheetRow+':P'+there.sheetRow,[toRow(clean)]);
   else await client.append(settings.keywordId,TAB,'A:P',[toRow(clean)]);
   Object.assign(local,clean,{remoteUpdated:now});remoteMap.set(clean.id,{...clean,remoteUpdated:now});
  }catch(e){remains.push(op);s.pending=remains.concat(s.pending.slice(s.pending.indexOf(op)+1));throw Error('推广配置同步未完成（本地保留）：'+e.message);}
 }
 remote=await getRemote();const newest=new Map(remote.map(x=>[x.id,x]));
 for(const op of remains){const local=s.items.find(x=>x.id===op.id);if(local)newest.set(op.id,local);}
 s.items=[...newest.values()];s.pending=remains;s.conflicts=conflicts;s.lastSync=new Date().toISOString();return{written:s.items.length,pending:s.pending.length,conflicts:conflicts.length};
}
function install({getBucket,persist,client,getSettings,connected,notify}){
 const $=id=>document.getElementById(id);
 const field=(id,label,placeholder='',type='text')=>'<label class="field-label" for="promo-'+id+'">'+label+'</label><input id="promo-'+id+'" type="'+type+'" placeholder="'+escape(placeholder)+'">';
 $('promoMount').innerHTML='<div class="panel"><div class="panel-heading wrap"><div><div class="section-kicker">AFFILIATE LINK CONTROL</div><h2>商品 / 渠道 / 链接配置</h2><p class="helper">来源证据 ≠ 落地页 ≠ 商品官网 ≠ PartnerBoost 跟踪链接。官网地址不可充当计佣链接。</p></div><button class="button secondary small" id="promoExport" type="button">导出配置 CSV</button></div><div id="promoSummary" class="field-help"></div><div id="promoTable" class="promo-table-wrap"></div></div>'+
 '<form class="panel promo-form" id="promoForm"><h2 id="promoFormTitle">编辑推广配置</h2><div class="promo-grid">'+
 field('id','配置 ID','小写英数字/连接符')+field('brand','品牌')+field('model','商品型号 / ASIN')+field('category','品类 / 对应 TIER')+field('sourceUrl','来源网址（研究证据）','','url')+field('landingPage','PARKMEMOIR 对应落地页','','url')+field('merchantUrl','商品官网地址（非联盟）','','url')+field('affiliateUrl','PartnerBoost 跟踪深链','','url')+
 '<div><label class="field-label" for="promo-channel">推广渠道</label><select id="promo-channel"><option>SEO / PARKMEMOIR</option><option>Google Ads</option><option>Social</option><option>Email</option></select></div>'+
 field('uid','活动 UID')+field('commission','已核验佣金（未知留空）')+field('verifiedAt','核验日期','','date')+field('expiresAt','活动截止日期','','date')+
 '<div><label class="field-label" for="promo-status">链接状态</label><select id="promo-status"><option>待生成 PB 深链</option><option>待验证</option><option>已记录已验证链接</option><option>已停用</option></select></div></div>'+
 '<label class="field-label" for="promo-note">备注 / SKU 资格与活动限制</label><textarea id="promo-note" rows="2"></textarea><div class="button-row"><button class="button secondary" id="promoUid" type="button">给 PB 深链添加 UID</button><button class="button" type="submit">保存配置</button><button class="button secondary" id="promoReset" type="button">新建渠道配置</button></div><p class="field-help">必须先从 PartnerBoost 取得商品专属深链；这里仅添加 UID，不生成或验证计佣资格。保存后可连接 Google 将配置同步到“06_推广链接配置”。</p></form>';
 let active='';
 const IDs=FIELDS.filter(k=>k!=='updatedAt');
 function select(id){
  const x=state(getBucket()).items.find(v=>v.id===id);if(!x)return;active=x.id;for(const k of IDs)if($('promo-'+k))$('promo-'+k).value=x[k]||'';
  $('promo-id').readOnly=true;$('promoFormTitle').textContent='编辑 '+x.brand+' / '+x.model;$('promoForm').scrollIntoView({behavior:'smooth',block:'start'});
 }
 function reset(){active='';$('promoForm').reset();$('promo-id').readOnly=false;$('promoFormTitle').textContent='新增商品 / 渠道配置';$('promo-landingPage').value=LANDING;$('promo-status').value='待生成 PB 深链';}
 function render(){
  const s=state(getBucket());$('promoSummary').textContent=s.items.length+' 条配置 · '+s.pending.length+' 条本地待同步 · '+s.conflicts.length+' 条冲突 · '+(s.lastSync?'上次 Google 同步 '+s.lastSync.slice(0,16).replace('T',' '):'未同步');
  $('promoTable').innerHTML='<table class="promo-table"><thead><tr><th>品牌 / 商品</th><th>品类</th><th>推广渠道 / UID</th><th>联盟链接</th><th>处理</th></tr></thead><tbody>'+
  s.items.map(x=>'<tr><td><strong>'+escape(x.brand)+'</strong><small>'+escape(x.model)+'</small></td><td>'+escape(x.category)+'</td><td>'+escape(x.channel)+'<small>'+escape(x.uid)+'</small></td><td><span class="promo-status">'+escape(x.status)+'</span><small>'+(x.affiliateUrl?'已填写 PB 链接':'未填写，官网链接不计佣')+'</small></td><td><button type="button" class="text-button" data-promo-edit="'+escape(x.id)+'">编辑</button> '+(x.affiliateUrl?'<button type="button" class="text-button" data-promo-copy="'+escape(x.id)+'">复制链接</button>':'<button type="button" class="text-button" data-promo-target="'+escape(x.id)+'">复制官网网址</button>')+(s.conflicts.some(c=>c.id===x.id)?'<small>云端冲突：请在表格核对后手动处理</small>':'')+'</td></tr>').join('')+'</tbody></table>';
 }
 $('promoForm').addEventListener('submit',e=>{e.preventDefault();try{
  const s=state(getBucket());const x={};for(const k of IDs)x[k]=$('promo-'+k)?.value??'';x.updatedAt=new Date().toISOString();const old=s.items.find(v=>v.id===x.id);
  if(active&&active!==x.id)throw Error('不可修改已有配置 ID');
  if(!active&&old)throw Error('该配置 ID 已存在；请编辑已有记录或使用新渠道 ID');
  const clean=validate(x);const base=old?.remoteUpdated||'';
  if(old)Object.assign(old,clean);else s.items.push({...clean,remoteUpdated:''});
  s.pending=s.pending.filter(op=>op.id!==x.id);s.pending.push({id:x.id,baseUpdated:base});persist();render();notify('推广配置已存本机；'+(connected()?'点击顶部同步写入 Google Sheets':'连接 Google 后同步'));select(x.id);
 }catch(err){notify('保存失败：'+err.message);}});
 $('promoReset').addEventListener('click',reset);
 $('promoUid').addEventListener('click',()=>{try{$('promo-affiliateUrl').value=withUid($('promo-affiliateUrl').value,$('promo-uid').value);$('promo-status').value='待验证';notify('仅添加 UID；仍需真实点击并在 PB 核验订单归因');}catch(e){notify(e.message);}});
 $('promoExport').addEventListener('click',()=>{const rows=[HEADERS,...state(getBucket()).items.map(toRow)];const blob=new Blob([csv(rows)],{type:'text/csv;charset=utf-8'}),a=document.createElement('a'),o=URL.createObjectURL(blob);a.href=o;a.download='SEO_Radar_推广配置_'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(o),1500);});
 $('promoTable').addEventListener('click',async e=>{const el=e.target.closest('[data-promo-edit],[data-promo-copy],[data-promo-target]');if(!el)return;const id=el.dataset.promoEdit||el.dataset.promoCopy||el.dataset.promoTarget;const x=state(getBucket()).items.find(v=>v.id===id);if(!x)return;if(el.dataset.promoEdit)return select(id);try{const link=el.dataset.promoTarget?x.merchantUrl:x.affiliateUrl;if(!link)return notify('当前没有对应网址');await navigator.clipboard.writeText(link);notify('网址已复制');}catch{notify('浏览器阻止复制，请点击编辑后手动复制');}});
 render();select(SEEDS[0].id);return{render,sync:()=>sync(client,getSettings(),getBucket())};
}
return{TAB,HEADERS,SEEDS,validate,withUid,toRow,fromRow,makeState,state,sync,install};
});
