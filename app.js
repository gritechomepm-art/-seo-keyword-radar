/* SEO Keyword Radar V1.4 — static GitHub Pages + private Google Sheets OAuth.
   No embedded user data, API secrets, service-account keys or DataForSEO calls. */
'use strict';
const CONFIG_KEY='seo_radar_v14_config';
const CACHE_KEY='seo_radar_v14_cache';
const SCOPES='https://www.googleapis.com/auth/spreadsheets';
const MASTER_TAB='Untitled';
const CANDIDATE_TAB='国家公园_候选池_20261103';
const COMPETITOR_TAB='国家公园_真实同行_20261103';
const REVIEW_TAB='04_国家公园_审核记录';
const PARK_PREFIX=/^(national park|zion|utah mighty 5|grand circle|joshua tree|death valley|junior ranger|yellowstone|smoky mountains|acadia|yosemite|grand canyon|saguaro|big bend)/i;
const REVIEW_STATES=['待验证','研究中','已核验','批准立项','补充资料','不立项'];
const el=(id)=>document.getElementById(id);
const clone=(v)=>JSON.parse(JSON.stringify(v));
const key=(s)=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
const escapeHtml=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatNum=(v)=>v===null||v===undefined||v===''?'—':Number(v).toLocaleString('en-US');
const formatMoney=(v)=>v===null||v===undefined||v===''?'—':'$'+Number(v).toFixed(2);
const toNumber=(v)=>v===null||v===undefined||String(v).trim()===''?null:(Number.isFinite(Number(String(v).replace(/,/g,'')))?Number(String(v).replace(/,/g,'')):null);
const emptyCache=()=>({official:[],candidates:[],competitors:[],reviews:{},pending:[],snapshotAt:null,lastLocalEdit:null,conflicts:[]});
const defaultConfig={clientId:'',keywordId:'',competitorId:''};
function loadStorage(storageKey,fallback){try{const v=JSON.parse(localStorage.getItem(storageKey)||'null');return v&&typeof v==='object'?v:clone(fallback);}catch{return clone(fallback);}}
let settings={...defaultConfig,...loadStorage(CONFIG_KEY,defaultConfig)};
let cache={...emptyCache(),...loadStorage(CACHE_KEY,emptyCache())};
let accessToken='';
let oauthClient=null;
let working=false;
let activeReview='';
let lastConnectionError='';

function persist(){try{localStorage.setItem(CACHE_KEY,JSON.stringify(cache));}catch(err){notify('本地缓存保存失败，请及时导出 JSON 备份。');}}
function setStatus(message,kind='waiting'){
 const e=el('status');e.textContent=message;e.classList.remove('waiting','connected','error');e.classList.add(kind);
}
function notify(msg){const e=el('toast');e.textContent=msg;e.style.display='block';clearTimeout(window.__toastTimeout);window.__toastTimeout=setTimeout(()=>{e.style.display='none'},4200);}
function showView(name){document.querySelectorAll('.view').forEach(e=>e.classList.toggle('active',e.id==='view-'+name));document.querySelectorAll('.nav button').forEach(e=>e.classList.toggle('active',e.dataset.view===name));window.scrollTo({top:0,behavior:'smooth'});}
function saveSettings(){
 const c={clientId:el('oauthClient').value.trim(),keywordId:el('keywordSheet').value.trim(),competitorId:el('competitorSheet').value.trim()};
 for(const [label,v] of [['OAuth Client ID',c.clientId],['关键词表 ID',c.keywordId],['竞品表 ID',c.competitorId]])if(!v){notify(label+'不能为空');return false;}
 if(!/\.apps\.googleusercontent\.com$/.test(c.clientId)){notify('OAuth Client ID 格式不正确');return false;}
 if(!/^[a-zA-Z0-9_-]{15,}$/.test(c.keywordId)||!/^[a-zA-Z0-9_-]{15,}$/.test(c.competitorId)){notify('Google Sheets ID 格式不正确');return false;}
 const changed=Object.keys(c).some(k=>settings[k]!==c[k]);settings=c;localStorage.setItem(CONFIG_KEY,JSON.stringify(settings));
 if(changed){accessToken='';oauthClient=null;setStatus('配置已保存，点击连接 Google');}
 notify('已保存配置到此浏览器，不会上传 GitHub');renderSyncInfo();return true;
}
function connectGoogle(){
 if(!settings.clientId||!settings.keywordId||!settings.competitorId){showView('settings');notify('请先填写并保存连接配置');return;}
 if(!window.google?.accounts?.oauth2){setStatus('Google 登录组件未加载，请检查网络或浏览器拦截','error');return;}
 try{
  if(!oauthClient){oauthClient=google.accounts.oauth2.initTokenClient({client_id:settings.clientId,scope:SCOPES,callback:(res)=>{
   if(res?.error||!res?.access_token){lastConnectionError=res?.error_description||res?.error||'未收到访问令牌';setStatus('授权未完成：'+lastConnectionError,'error');return;}
   accessToken=res.access_token;lastConnectionError='';setStatus('Google 已授权，正在同步…','waiting');syncNow();
  }});}
  // The prompt is initiated from a real button click, not from a background timer.
  oauthClient.requestAccessToken({prompt:'consent'});
 }catch(err){setStatus('Google OAuth 初始化失败：'+String(err.message||err),'error');}
}
async function googleApi(path,{method='GET',body}={}){
 if(!accessToken)throw new Error('访问令牌不存在；请点击连接 Google');
 const response=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+path,{method,headers:{Authorization:'Bearer '+accessToken,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});
 let data;try{data=await response.json()}catch{data={}};
 if(!response.ok){let msg=data?.error?.message||'请求失败 HTTP '+response.status;if(response.status===401){accessToken='';msg='登录授权已过期，请重新连接 Google。';}throw new Error(msg);}
 return data;
}
const vPath=(id,range)=>encodeURIComponent(id)+'/values/'+encodeURIComponent(range);
async function fetchValues(id,range){const x=await googleApi(vPath(id,range));return x.values||[];}
async function putValues(id,range,values){return googleApi(vPath(id,range)+'?valueInputOption=RAW',{method:'PUT',body:{majorDimension:'ROWS',values}});}
async function appendValues(id,range,values){return googleApi(vPath(id,range)+'?valueInputOption=RAW&insertDataOption=INSERT_ROWS',{method:'POST',body:{majorDimension:'ROWS',values}});}
async function listTabs(id){const x=await googleApi(encodeURIComponent(id)+'?fields=sheets.properties.title');return(x.sheets||[]).map(s=>s.properties?.title).filter(Boolean);}
const quoted=(sheet,range)=>"'"+sheet.replace(/'/g,"''")+"'!"+range;
function parseMaster(rows){return rows.slice(1).filter(r=>PARK_PREFIX.test(key(r[0]))).map(r=>({keyword:String(r[0]||'').trim(),volume:toNumber(r[1]),cpc:toNumber(r[2]),ads:toNumber(r[3]),dr:toNumber(r[4]),trend:r[5]||'',gap:r[9]||'',rating:r[10]||'',source:'master'}));}
function parseCandidates(rows){return rows.slice(1).filter(r=>key(r[1])).map(r=>({keyword:String(r[1]||'').trim(),seed:r[0]||'',url:r[2]||'',domain:r[3]||'',date:r[4]||'',volume:toNumber(r[6]),cpc:toNumber(r[7]),ads:toNumber(r[8]),dr:toNumber(r[9]),autocomplete:r[10]||'',dataforseo:r[11]||'',serp:r[12]||'待验证',note:r[13]||'',source:'candidate'}));}
function parseCompetitors(rows){return rows.slice(1).filter(r=>key(r[1])).map(r=>({name:r[0]||'',domain:r[1]||'',url:r[2]||'',features:r[3]||'',dr:toNumber(r[4]),traffic:toNumber(r[5]),sitemap:r[6]||'',sitemapStatus:r[7]||'',date:r[8]||'',notes:r[9]||''}));}
function parseReviews(rows){const o={};rows.slice(1).forEach((r,i)=>{if(!key(r[0]))return;o[key(r[0])]={status:r[1]||'待验证',note:r[2]||'',updated:r[3]||'',row:i+2};});return o;}
async function readCloud(){
 const [master,candidates,competitors,tabs]=await Promise.all([
  fetchValues(settings.keywordId,quoted(MASTER_TAB,'A1:K')),
  fetchValues(settings.keywordId,quoted(CANDIDATE_TAB,'A1:N')),
  fetchValues(settings.competitorId,quoted(COMPETITOR_TAB,'A1:J')),
  listTabs(settings.keywordId)
 ]);
 const reviewRows=tabs.includes(REVIEW_TAB)?await fetchValues(settings.keywordId,quoted(REVIEW_TAB,'A1:D')):[];
 const official=parseMaster(master),cand=parseCandidates(candidates),rivals=parseCompetitors(competitors);
 return {official,candidates:cand,competitors:rivals,reviews:parseReviews(reviewRows),reviewTabExists:tabs.includes(REVIEW_TAB)};
}
async function ensureReviewSheet(cloud){
 if(cloud.reviewTabExists)return;
 await googleApi(encodeURIComponent(settings.keywordId)+':batchUpdate',{method:'POST',body:{requests:[{addSheet:{properties:{title:REVIEW_TAB,gridProperties:{frozenRowCount:1}}}}]}});
 await putValues(settings.keywordId,quoted(REVIEW_TAB,'A1:D1'),[['关键词','审核状态','审核备注','更新时间']]);
 cloud.reviewTabExists=true;
}
function pendingId(){return String(Date.now())+'-'+Math.random().toString(36).slice(2,10);}
function overlayPending(base,pending){
 for(const op of pending){
  if(op.type==='candidate'&&!base.candidates.some(x=>key(x.keyword)===key(op.item.keyword)))base.candidates.push({...op.item,pending:true});
  if(op.type==='review')base.reviews[key(op.keyword)]={status:op.status,note:op.note,updated:op.createdAt,pending:true};
 }
 return base;
}
async function flushPending(cloud){
 const remains=[],conflicts=[];
 const known=new Set([...cloud.official,...cloud.candidates].map(x=>key(x.keyword)));
 for(const op of cache.pending||[]){
  try{
   if(op.type==='candidate'){
    if(known.has(key(op.item.keyword)))continue;
    const x=op.item;
    const row=[x.seed||'',x.keyword,x.url||'',x.domain||'',x.date||new Date().toISOString().slice(0,10),'自动去重','', '', '', '','未调用','未调用','待验证',x.note||''];
    await appendValues(settings.keywordId,quoted(CANDIDATE_TAB,'A:N'),[row]);known.add(key(x.keyword));
   }else if(op.type==='review'){
    const remote=cloud.reviews[key(op.keyword)];
    if((remote?.updated||'')!==(op.baseUpdated||'')){
     conflicts.push({keyword:op.keyword,remoteUpdated:remote?.updated||''});remains.push(op);continue;
    }
    await ensureReviewSheet(cloud);
    const updated=new Date().toISOString();const row=[op.keyword,op.status,op.note,updated];
    if(remote?.row){await putValues(settings.keywordId,quoted(REVIEW_TAB,'A'+remote.row+':D'+remote.row),[row]);}
    else {await appendValues(settings.keywordId,quoted(REVIEW_TAB,'A:D'),[row]);}
    cloud.reviews[key(op.keyword)]={status:op.status,note:op.note,updated,row:remote?.row||0};
   }
  }catch(err){remains.push(op);lastConnectionError=String(err.message||err);}
 }
 return {remains,conflicts};
}
async function syncNow(){
 if(working)return;
 if(!accessToken){setStatus('离线缓存模式 · 点击连接 Google 同步','waiting');notify('先连接 Google，再同步');return;}
 if(!navigator.onLine){setStatus('当前离线：使用本地缓存','waiting');return;}
 working=true;setStatus('同步 Google Sheets 中…','waiting');renderSyncInfo();
 try{
  let cloud=await readCloud();
  const {remains,conflicts}=await flushPending(cloud);
  if(remains.length!==(cache.pending||[]).length)cloud=await readCloud();
  cache={...cache,...overlayPending(cloud,remains),pending:remains,conflicts,snapshotAt:new Date().toISOString()};
  delete cache.reviewTabExists;
  persist();renderAll();
  if(conflicts.length){setStatus('已同步 · '+conflicts.length+' 条审核冲突待处理','error');notify('部分审核记录已在云端改变，请处理冲突');}
  else if(remains.length){setStatus('数据已读取 · '+remains.length+' 项待重试','waiting');}
  else{setStatus('已同步 · 正式 '+cloud.official.length+' / 候选 '+cloud.candidates.length+' / 竞品 '+cloud.competitors.length,'connected');}
  lastConnectionError='';
 }catch(err){lastConnectionError=String(err.message||err);setStatus('同步失败：'+lastConnectionError,'error');renderSyncInfo();}
 finally{working=false;}
}
function enqueueReview(keyword,status,note){
 const k=key(keyword),old=(cache.pending||[]).find(op=>op.type==='review'&&key(op.keyword)===k);
 const current=cache.reviews[k],baseUpdated=old?old.baseUpdated:(current?.updated||'');
 cache.pending=cache.pending.filter(op=>!(op.type==='review'&&key(op.keyword)===k));
 cache.pending.push({id:pendingId(),type:'review',keyword,status,note,baseUpdated,createdAt:new Date().toISOString()});
 cache.reviews[k]={status,note,updated:new Date().toISOString(),pending:true};cache.lastLocalEdit=new Date().toISOString();persist();renderAll();
 if(accessToken&&navigator.onLine)syncNow();else notify('审核已保存到本地，联网并连接 Google 后会同步');
}
function addCandidateLines(){
 const raw=el('newWords').value.trim(),list=[...new Set(raw.split(/[\r\n,，;；]+/).map(key).filter(Boolean))].slice(0,100);
 if(!list.length){notify('至少输入一个关键词');return;}
 const known=new Set([...cache.official,...cache.candidates].map(x=>key(x.keyword))),seed=el('newSeed').value.trim(),url=el('newUrl').value.trim(),note=el('newNote').value.trim();
 let added=0,duplicates=0;
 for(const keyword of list){if(keyword.length<3||keyword.length>160||!/\b[a-z]/i.test(keyword)){duplicates++;continue;}
  if(known.has(keyword)){duplicates++;continue;}
  const x={keyword,seed,url,domain:(()=>{try{return url?new URL(url).hostname:''}catch{return ''}})(),date:new Date().toISOString().slice(0,10),volume:null,cpc:null,ads:null,dr:null,autocomplete:'未调用',dataforseo:'未调用',serp:'待验证',note,source:'candidate',pending:true};
  cache.candidates.push(x);cache.pending.push({id:pendingId(),type:'candidate',item:clone(x),createdAt:new Date().toISOString()});known.add(keyword);added++;
 }
 cache.lastLocalEdit=new Date().toISOString();persist();renderAll();el('addCandidateDialog').close();el('newWords').value='';notify('新增 '+added+' 条，去重/无效 '+duplicates+' 条；已保存在本地');
 if(added&&accessToken&&navigator.onLine)syncNow();
}
function reviewStatus(word){return cache.reviews[key(word)]?.status||'待验证'}
function ratingKind(r){const s=String(r||'');return s.includes('高潜')?'high':s.includes('放弃')?'reject':'other'}
function pill(text,kind=''){return '<span class="tag '+(kind==='high'?'good':kind==='reject'?'bad':kind==='wait'?'wait':'')+'">'+escapeHtml(text)+'</span>'}
function renderKpis(){
 const total=cache.official.length,high=cache.official.filter(x=>ratingKind(x.rating)==='high').length,reviewed=Object.values(cache.reviews).filter(x=>x.status&&x.status!=='待验证').length;
 const rows=[['正式国家公园关键词',total,'来自源表'],['源表高潜候选',high,'未经 SERP 复核'],['待研究新词',cache.candidates.length,'候选表'],['国家公园竞品',cache.competitors.length,'独立竞品表'],['已记录审核',reviewed,'人工审核结果']];
 el('kpis').innerHTML=rows.map(a=>'<div class="kpi"><label>'+a[0]+'</label><strong>'+a[1]+'</strong><small>'+a[2]+'</small></div>').join('');
}
function renderOverview(){
 const cnt=[['源表高潜',cache.official.filter(x=>ratingKind(x.rating)==='high').length],['源表放弃',cache.official.filter(x=>ratingKind(x.rating)==='reject').length],['其他',cache.official.filter(x=>ratingKind(x.rating)==='other').length]];
 el('ratingTotal').textContent=cache.official.length+' 条正式关键词';
 el('ratingBars').innerHTML=cnt.map(([name,n])=>'<div class="barrow"><span>'+name+'</span><div class="barbg"><div class="barfill" style="width:'+(cache.official.length?n/cache.official.length*100:0)+'%"></div></div><b>'+n+'</b></div>').join('')||'<div class="empty">连接后显示最新数据</div>';
 const top=[...cache.official].sort((a,b)=>(b.volume||0)-(a.volume||0)).slice(0,6),max=Math.max(1,...top.map(x=>x.volume||0));
 el('topBars').innerHTML=top.map(x=>'<div class="barrow"><span title="'+escapeHtml(x.keyword)+'">'+escapeHtml(x.keyword.length>23?x.keyword.slice(0,22)+'…':x.keyword)+'</span><div class="barbg"><div class="barfill" style="width:'+((x.volume||0)/max*100)+'%"></div></div><b>'+formatNum(x.volume)+'</b></div>').join('')||'<div class="empty">暂无数据，点击连接 Google</div>';
 const high=[...cache.official].filter(x=>ratingKind(x.rating)==='high').sort((a,b)=>(b.volume||0)-(a.volume||0)).slice(0,8);
 el('priorityRows').innerHTML=high.map(x=>'<tr><td><strong>'+escapeHtml(x.keyword)+'</strong></td><td>'+formatNum(x.volume)+'</td><td>'+formatMoney(x.cpc)+'</td><td>'+formatNum(x.dr)+'</td><td>'+pill('源表高潜','high')+'</td><td>'+pill(reviewStatus(x.keyword),'wait')+'</td><td><button class="secondary" data-review="'+escapeHtml(x.keyword)+'">审核</button></td></tr>').join('')||'<tr><td colspan="7" class="empty">暂无待复核关键词</td></tr>';
}
function renderKeywords(){
 const q=key(el('kwSearch').value),rating=el('kwRating').value,sort=el('kwSort').value;
 const arr=cache.official.filter(x=>(!q||(x.keyword+' '+x.gap).toLowerCase().includes(q))&&(!rating||ratingKind(x.rating)===rating));
 arr.sort((a,b)=>sort==='cpc'?(b.cpc??-1)-(a.cpc??-1):sort==='dr'?(a.dr??999)-(b.dr??999):sort==='az'?a.keyword.localeCompare(b.keyword):(b.volume??-1)-(a.volume??-1));
 el('keywordRows').innerHTML=arr.map(x=>'<tr><td><strong>'+escapeHtml(x.keyword)+'</strong><div class="muted">'+escapeHtml(x.gap)+'</div></td><td>'+formatNum(x.volume)+'</td><td>'+formatMoney(x.cpc)+'</td><td>'+formatNum(x.ads)+'</td><td>'+formatNum(x.dr)+'</td><td>'+escapeHtml(x.trend)+'</td><td>'+pill(x.rating,ratingKind(x.rating))+'</td><td>'+pill(reviewStatus(x.keyword),'wait')+'</td><td><button class="secondary" data-review="'+escapeHtml(x.keyword)+'">审核</button></td></tr>').join('')||'<tr><td colspan="9" class="empty">暂无符合条件的关键词</td></tr>';
}
function renderCandidates(){
 const q=key(el('candidateSearch').value),arr=cache.candidates.filter(x=>!q||key(x.keyword).includes(q));
 el('candidateRows').innerHTML=arr.map(x=>'<tr><td><strong>'+escapeHtml(x.keyword)+'</strong>'+(x.pending?'<div class="warning-line">本地待同步</div>':'')+'</td><td>'+escapeHtml(x.seed||'—')+'</td><td>'+escapeHtml(x.domain||'—')+'</td><td>'+formatNum(x.volume)+'</td><td>'+formatMoney(x.cpc)+'</td><td>'+escapeHtml(x.serp||'待验证')+'</td><td>'+escapeHtml(x.note||'—')+'</td><td><button class="secondary" data-review="'+escapeHtml(x.keyword)+'">审核</button></td></tr>').join('')||'<tr><td colspan="8" class="empty">暂无候选关键词</td></tr>';
}
function renderCompetitors(){
 el('competitorTotal').textContent=cache.competitors.length+' 家';
 el('competitorCards').innerHTML=cache.competitors.map(x=>'<article class="competitor"><h3>'+escapeHtml(x.name||x.domain)+'</h3><div class="muted">'+escapeHtml(x.domain)+'</div><p>'+escapeHtml(x.features||'待研究')+'</p><div>'+pill('DR '+formatNum(x.dr),'wait')+' '+pill('流量 '+formatNum(x.traffic),'wait')+'</div><p>'+escapeHtml(x.sitemapStatus||'Sitemap 待核实')+'</p>'+(x.url&&/^https:\/\//.test(x.url)?'<a class="link" href="'+escapeHtml(x.url)+'" target="_blank" rel="noopener noreferrer">打开工具页 ↗</a>':'')+'</article>').join('')||'<div class="empty">暂无竞品记录</div>';
}
function renderReviews(){
 const q=key(el('reviewSearch').value),f=el('reviewFilter').value;
 const unique=new Map();for(const x of [...cache.official,...cache.candidates])unique.set(key(x.keyword),x);
 const arr=[...unique.values()].filter(x=>(!q||key(x.keyword).includes(q))&&(!f||reviewStatus(x.keyword)===f));
 el('reviewCount').textContent=arr.length+' 条';
 el('reviewRows').innerHTML=arr.map(x=>{const rv=cache.reviews[key(x.keyword)];return '<tr><td><strong>'+escapeHtml(x.keyword)+'</strong></td><td>'+ (x.source==='candidate'?'候选':'正式')+'</td><td>'+pill(x.rating||'待数据',ratingKind(x.rating))+'</td><td>'+pill(reviewStatus(x.keyword),'wait')+(rv?.pending?'<div class="warning-line">待云端同步</div>':'')+'</td><td>'+escapeHtml(rv?.note||'—')+'</td><td>'+escapeHtml(rv?.updated||'—')+'</td><td><button class="secondary" data-review="'+escapeHtml(x.keyword)+'">审核</button></td></tr>';}).join('')||'<tr><td colspan="7" class="empty">暂无记录</td></tr>';
}
function renderSyncInfo(){
 const changes=cache.pending?.length||0,conflicts=cache.conflicts||[];
 el('syncInfo').innerHTML='<p>Google 登录：'+(accessToken?'已授权':'尚未连接 / 已过期')+'</p><p>云端最近同步：'+(cache.snapshotAt?new Date(cache.snapshotAt).toLocaleString():'从未同步')+'</p><p>待写入队列：'+changes+' 条</p><p>审核冲突：'+conflicts.length+' 条</p>'+(lastConnectionError?'<p class="warning-line">最近错误：'+escapeHtml(lastConnectionError)+'</p>':'')+conflicts.map(x=>'<p class="warning-line">'+escapeHtml(x.keyword)+'：云端记录已改变，暂不覆盖。<button class="secondary" data-overwrite="'+escapeHtml(x.keyword)+'">确认以本地审核覆盖</button></p>').join('');
 el('oauthClient').value=settings.clientId||'';el('keywordSheet').value=settings.keywordId||'';el('competitorSheet').value=settings.competitorId||'';
}
function renderAll(){renderKpis();renderOverview();renderKeywords();renderCandidates();renderCompetitors();renderReviews();renderSyncInfo();}
function openReview(keyword){activeReview=keyword;const rv=cache.reviews[key(keyword)];el('reviewWord').textContent=keyword;el('reviewState').value=rv?.status||'待验证';el('reviewNote').value=rv?.note||'';const c=cache.conflicts.find(x=>key(x.keyword)===key(keyword));el('reviewConflict').hidden=!c;el('reviewConflict').textContent=c?'冲突：云端记录已在其他设备变化，此次保存不会自动覆盖。':'';el('reviewDialog').showModal();}
function saveReview(){if(!activeReview)return;enqueueReview(activeReview,el('reviewState').value,el('reviewNote').value.trim());el('reviewDialog').close();}
function downloadFile(name,text,type){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500);}
function exportJson(){const data={version:'1.4',exportedAt:new Date().toISOString(),...cache};downloadFile('SEO_Radar_Backup_'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(data,null,2),'application/json;charset=utf-8');notify('已导出 JSON 备份（包含私人数据，请妥善保管）');}
function exportReviews(){const rows=[['关键词','审核状态','审核备注','更新时间'],...Object.entries(cache.reviews).map(([kw,rv])=>[kw,rv.status,rv.note,rv.updated])];const escaped=(x)=>'"'+String(x??'').replace(/"/g,'""')+'"';downloadFile('SEO_Radar_Reviews.csv','\ufeff'+rows.map(r=>r.map(escaped).join(',')).join('\r\n'),'text/csv;charset=utf-8');}
async function restoreJson(file){try{const data=JSON.parse(await file.text());const official=data.official||data.keywords||[];if(!Array.isArray(official)||!Array.isArray(data.candidates)||!Array.isArray(data.competitors))throw Error('不是支持的 Radar 备份文件');if(!confirm('恢复将覆盖当前浏览器缓存和待同步队列。请确认已保存旧备份。'))return;cache={...emptyCache(),...data,official,pending:data.pending||[],reviews:data.reviews||{}};persist();renderAll();notify('已恢复本地数据备份');}catch(err){notify('导入失败：'+String(err.message||err));}}
function setup(){
 document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
 document.addEventListener('click',e=>{
  const go=e.target.closest('[data-go]');if(go)showView(go.dataset.go);
  const r=e.target.closest('[data-review]');if(r)openReview(r.dataset.review);
  const conflict=e.target.closest('[data-overwrite]');if(conflict){const op=cache.pending.find(x=>x.type==='review'&&key(x.keyword)===key(conflict.dataset.overwrite));const c=cache.conflicts.find(x=>key(x.keyword)===key(conflict.dataset.overwrite));if(op&&c&&confirm('确定覆盖云端此关键词的审核记录？')){op.baseUpdated=c.remoteUpdated||'';cache.conflicts=cache.conflicts.filter(x=>key(x.keyword)!==key(op.keyword));persist();syncNow();}}
  const close=e.target.closest('[data-close]');if(close)close.closest('dialog').close();
 });
 el('saveSettingsBtn').addEventListener('click',saveSettings);
 el('connectBtn').addEventListener('click',connectGoogle);
 el('connectSettingsBtn').addEventListener('click',()=>{if(saveSettings())connectGoogle()});
 el('syncBtn').addEventListener('click',syncNow);el('retryBtn').addEventListener('click',syncNow);
 el('backupBtn').addEventListener('click',exportJson);el('exportReviewsBtn').addEventListener('click',exportReviews);
 el('addCandidateBtn').addEventListener('click',()=>el('addCandidateDialog').showModal());
 el('confirmAddBtn').addEventListener('click',addCandidateLines);
 el('saveReviewBtn').addEventListener('click',saveReview);
 el('importBackupBtn').addEventListener('click',()=>el('backupFile').click());
 el('backupFile').addEventListener('change',e=>{if(e.target.files?.[0])restoreJson(e.target.files[0]);e.target.value='';});
 el('clearCacheBtn').addEventListener('click',()=>{if(confirm('确定清除本浏览器缓存与 Google Sheets 配置？未同步记录也会删除。')){localStorage.removeItem(CACHE_KEY);localStorage.removeItem(CONFIG_KEY);settings=clone(defaultConfig);cache=emptyCache();accessToken='';oauthClient=null;renderAll();setStatus('已清理浏览器缓存','waiting');}});
 ['kwSearch','kwRating','kwSort'].forEach(id=>el(id).addEventListener('input',renderKeywords));el('candidateSearch').addEventListener('input',renderCandidates);
 ['reviewSearch','reviewFilter'].forEach(id=>el(id).addEventListener('input',renderReviews));
 window.addEventListener('online',()=>{if(accessToken)syncNow();else setStatus('已联网 · 请连接 Google 恢复同步','waiting');});
 window.addEventListener('offline',()=>setStatus('当前离线 · 使用本地快照','waiting'));
 window.setInterval(()=>{if(accessToken&&navigator.onLine)syncNow();},300000);
 renderAll();
 if(cache.snapshotAt){setStatus('离线缓存 · 上次同步 '+new Date(cache.snapshotAt).toLocaleString(),'waiting');el('infoBanner').textContent='已加载本地缓存。点击「连接 Google」授权并同步最新数据；令牌不会保存在磁盘。';}
 if(!settings.clientId||!settings.keywordId||!settings.competitorId)showView('settings');
 else el('infoBanner').textContent='已保存连接配置；请点击右上角「连接 Google」授权。GitHub Pages 不保存私人 Sheets 内容。';
}
setup();