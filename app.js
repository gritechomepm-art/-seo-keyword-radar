/* SEO Radar 2.0 — private Sheets, isolated pools, Google suggestions, local XLSX. */
'use strict';
const C=window.RadarCore, H=C.html, $=id=>document.getElementById(id);
const CONFIG_KEY='seo_radar_v14_config', OLD_CACHE='seo_radar_v14_cache', ROOT_KEY='seo_radar_v2_workspace';
function readStorage(key,fallback){try{const v=JSON.parse(localStorage.getItem(key)||'null');return v&&typeof v==='object'?v:C.clone(fallback);}catch{return C.clone(fallback);}}
let settings={clientId:'',keywordId:'',competitorId:'',...readStorage(CONFIG_KEY,{})};
let root=readStorage(ROOT_KEY,{version:2,bindings:{}});if(!root.bindings||typeof root.bindings!=='object')root={version:2,bindings:{}};
const bindingKey=()=>settings.keywordId+'|'+settings.competitorId;
function getBucket(){const key=bindingKey();if(!Object.hasOwn(root.bindings,key)){root.bindings[key]=C.migrate(root.migrated?null:readStorage(OLD_CACHE,null));root.migrated=true;}return root.bindings[key];}
let bucket=getBucket();
function pool(){return bucket.pools.find(p=>p.id===bucket.activePoolId)||bucket.pools[0];}
function cache(){const id=pool().id;return bucket.caches[id]||=(C.emptyCache());}
function persist(){try{localStorage.setItem(ROOT_KEY,JSON.stringify(root));return true;}catch{notify('浏览器存储空间不足，请立即导出 JSON 备份');return false;}}
let token='',expiresAt=0,oauthClient=null,working=false,capturing=false,currentView='overview',keywordKind='all',activeReview='',toastTimer,lastError='',lastCapture={poolId:'',items:[],selected:new Set(),failures:[],completed:0,total:0,stopped:false};
let captureController=null;
const COUNTRY={US:'美国',GB:'英国',CA:'加拿大',AU:'澳大利亚',DE:'德国',FR:'法国',ES:'西班牙',SG:'新加坡'},LANG={en:'英文',de:'德文',fr:'法文',es:'西班牙文','zh-CN':'中文'};
const VIEWS={overview:['工作总览','下一步，研究哪个关键词？','收集线索、核验数据，让每次立项更有依据。'],keywords:['关键词库','让每一条关键词，都有来处','查看候选、已有指标与审核进度，保留你的研究证据。'],capture:['采集关键词','从一个词根，发现新的方向','采集结果先预览，再保存到你选择的词池。'],competitors:['竞品研究','看看同行，真正做了什么','记录实际页面和可验证的差异，不凭印象下结论。'],reviews:['审核与立项','把线索，变成值得投入的方向','结合需求、竞争与变现依据，逐条记录判断。'],settings:['连接与备份','你的研究，妥善保存在这里','管理表格连接、同步状态和完整备份。']};
const MODIFIERS={product:'for travel, for laptop, usb c, magnetic, review, 10000mah, 20000mah',travel:'with kids, winter, itinerary, packing list, hotels, shuttle',letters:'abcdefghijklmnopqrstuvwxyz'.split('').join(', ')};
function saveCaptureDraft(){bucket.captureDrafts||={};bucket.captureDrafts[pool().id]={seeds:$('captureSeeds').value,mods:$('captureMods').value,preset:$('modifierPreset').value};persist();}
function saveCapturePreview(){if(lastCapture.poolId!==pool().id)return;bucket.capturePreviews||={};bucket.capturePreviews[pool().id]={...lastCapture,selected:[...lastCapture.selected],inProgress:capturing};saveCaptureDraft();}
function loadCapture(){invalidatePlugin();const saved=bucket.capturePreviews?.[pool().id];lastCapture={poolId:pool().id,items:[],selected:new Set(),failures:[],completed:0,total:0,stopped:false,...(saved||{})};lastCapture.selected=new Set(saved?.selected||[]);if(saved?.inProgress)lastCapture.stopped=true;const draft=bucket.captureDrafts?.[pool().id],preset=draft?.preset||(pool().legacy?'travel':'product');$('modifierPreset').value=preset;$('captureSeeds').value=draft?.seeds||'';$('captureMods').value=draft?.mods??MODIFIERS[preset]??'';}

function notify(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('toast').hidden=true;},5000);}
function showError(message=''){lastError=message;$('errorBanner').textContent=message;$('errorBanner').hidden=!message;}
function connected(){return Boolean(token&&Date.now()<expiresAt);}
const client=new RadarSheets.Client({getToken:()=>connected()?token:'',onUnauthorized:()=>{token='';expiresAt=0;renderConnection();}});
function busyUI(){const busy=working||capturing;for(const id of ['poolSelect','newPoolBtn','addBtn','addRivalBtn','syncBtn','captureBtn'])$(id).disabled=busy;$('connectBtn').disabled=working;$('cancelCaptureBtn').hidden=!capturing;for(const el of document.querySelectorAll('dialog button[type=submit],#saveNextBtn'))el.disabled=working;$('saveCaptureBtn').disabled=busy||!lastCapture.selected.size;$('pluginParseBtn').disabled=busy;$('pluginImportBtn').disabled=busy||!pluginPreview?.items.some(x=>x.selected&&!x.duplicate);}
function timeLabel(value){if(!value)return'尚未同步';const date=new Date(value);if(!Number.isFinite(date.getTime()))return'时间待核验';return date.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});}
function renderConnection(){
 const data=cache(),status=$('status');let text,kind;
 if(working){text='正在同步…';kind='waiting';}
 else if(lastError){text='同步需要处理';kind='error';}
 else if(data.conflicts.length){text=data.conflicts.length+' 条审核冲突';kind='error';}
 else if(data.pending.length){text=data.pending.length+' 条待同步';kind='waiting';}
 else if(connected()){text='已连接 · '+(data.snapshotAt?'已同步':'待同步');kind='connected';}
 else{text=data.snapshotAt?'本地快照 · 请重新连接':'尚未连接 Google';kind='waiting';}
 status.textContent=text;status.className='connection '+kind;status.title=text;
 $('connectBtn').hidden=connected();$('syncBtn').textContent=working?'同步中…':'同步';
 const banner=$('connectionBanner');banner.hidden=connected()&&!data.pending.length&&!data.conflicts.length;
 if(!connected())banner.innerHTML=(data.snapshotAt?'已加载上次的研究快照。':'可以先新建词池、收集候选线索。')+' <button class="text-button" data-connect>连接 Google，'+(data.pending.length?'同步本机的 '+data.pending.length+' 条改动':'读取云端数据')+'</button>';
 else if(data.conflicts.length)banner.innerHTML='有 '+data.conflicts.length+' 条审核记录在其他设备发生变化。<button class="text-button" data-go="reviews">查看并处理</button>';
 else if(data.pending.length)banner.textContent='还有 '+data.pending.length+' 项记录尚未写入云端；本机已保留，可以重试同步。';
 $('lastSyncFooter').textContent=data.snapshotAt?'最近同步 '+timeLabel(data.snapshotAt):'研究数据由你掌握';busyUI();
}
function fillSettings(){for(const [id,key]of[['oauthClient','clientId'],['keywordSheet','keywordId'],['competitorSheet','competitorId']])$(id).value=settings[key]||'';}
function showView(name,updateHash=true){
 if(currentView==='capture')saveCaptureDraft();if(!VIEWS[name])name='overview';currentView=name;
 for(const section of document.querySelectorAll('.view'))section.classList.toggle('active',section.id==='view-'+name);
 for(const button of document.querySelectorAll('[data-view]')){const active=button.dataset.view===name;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}
 $('breadcrumbView').textContent=VIEWS[name][0];$('pageTitle').textContent=VIEWS[name][1];$('pageSubtitle').textContent=VIEWS[name][2];$('pageEyebrow').textContent=name==='overview'?'YOUR RESEARCH, ONE CLEAR WORKSPACE':'SEO RADAR / '+VIEWS[name][0];
 $('addBtn').hidden=name==='settings';$('exportBtn').hidden=name==='settings';
 if(name==='settings'){fillSettings();renderSyncInfo();}
 $('sidebar').classList.remove('menu-open');$('menuBtn').setAttribute('aria-expanded','false');
 if(updateHash)history.replaceState(null,'','#'+name);window.scrollTo({top:0,behavior:'instant'});
}
function badge(status){const cls={'研究中':'research','已核验':'verified','批准立项':'approved','补充资料':'supplement','不立项':'rejected'}[status]||'';return'<span class="badge '+cls+'">'+H(status)+'</span>';}
function metric(x,key){const value=x[key];if(value===null||value===undefined||value==='')return'<span class="num">—</span>';
 const isDR=key==='dr',estimated=/插件估算/.test(x.metricSource||''),verified=isDR?Boolean(x.drSource&&x.drDate):Boolean(x.metricSource&&x.metricDate)&&!estimated;
 return'<span class="num">'+(key==='cpc'?'$'+Number(value).toFixed(2):H(C.formatCount(value)))+'</span>'+(!verified?'<span class="metric-unverified">'+(!isDR&&estimated?'插件估算':'待核验')+'</span>':'');
}
function empty(title,description,button='',view='capture'){return'<div class="empty-state"><div class="empty-icon">✧</div><h3>'+H(title)+'</h3><p>'+H(description)+'</p>'+(button?'<button class="button secondary" data-go="'+view+'">'+H(button)+'</button>':'')+'</div>';}
function renderTable(list,target,reviewMode=false){
 if(!list.length){$(target).innerHTML=empty('这里还没有符合条件的关键词','可以采集新线索、手动添加，或调整筛选条件。','去采集关键词');return;}
 const rows=list.map(x=>'<tr><td class="keyword-cell"><span class="keyword-name">'+H(x.keyword)+'</span><span class="keyword-sub">'+H(reviewMode?(x.review.note||x.note||'等待补充研究证据'):(x.seed||x.domain||(x.source==='master'?'原正式关键词':'手动线索')))+'</span></td><td>'+metric(x,'volume')+'</td><td>'+metric(x,'cpc')+'</td><td>'+metric(x,'dr')+'</td><td>'+badge(x.review.status)+(x.review.pending||x.pending?'<span class="keyword-sub">本机待同步</span>':'')+'</td><td>'+(reviewMode?'<span class="keyword-sub">'+H(timeLabel(x.review.updated))+'</span>':'<span class="keyword-sub">'+H(C.commercialScreen(x))+'</span>'+ (x.rating?'<span class="badge source" title="源表评级，未代表人工批准">'+H(x.rating.includes('高潜')?'源表高潜':x.rating.includes('放弃')?'源表放弃':'源表待观察')+'</span>':''))+'</td><td><button class="row-button" data-review="'+H(x.keyword)+'">查看 / 审核</button></td></tr>').join('');
 const mobile=list.map(x=>'<article class="keyword-card"><div class="card-title-row"><strong>'+H(x.keyword)+'</strong>'+badge(x.review.status)+'</div><div class="card-metrics"><div><small>月搜索量</small>'+metric(x,'volume')+'</div><div><small>CPC</small>'+metric(x,'cpc')+'</div><div><small>DR</small>'+metric(x,'dr')+'</div></div><div class="card-meta-row"><span class="keyword-sub">'+H(C.commercialScreen(x))+'</span><button class="row-button" data-review="'+H(x.keyword)+'">查看 / 审核</button></div></article>').join('');
 $(target).innerHTML='<div class="table-wrap desktop-table"><table><thead><tr><th class="keyword-cell">关键词 / 线索</th><th>月搜索量</th><th>CPC ($)</th><th>DR</th><th>审核状态</th><th>'+(reviewMode?'更新':'商业初筛 / 待核验')+'</th><th>操作</th></tr></thead><tbody>'+rows+'</tbody></table></div><div class="mobile-cards">'+mobile+'</div>';
}
function allRecords(){return C.records(cache());}
function openQueue(){return allRecords().filter(x=>['待验证','研究中','补充资料'].includes(x.review.status)).sort((a,b)=>({'研究中':0,'补充资料':1,'待验证':2}[a.review.status]-{'研究中':0,'补充资料':1,'待验证':2}[b.review.status]));}
function renderOverview(){
 const records=allRecords(),stats=[['待核验线索',records.filter(x=>x.review.status==='待验证').length,'从一条证据开始','⌕'],['研究进行中',records.filter(x=>['研究中','补充资料'].includes(x.review.status)).length,'继续补充你的判断','◷'],['已批准立项',records.filter(x=>x.review.status==='批准立项').length,'人工审核后的决定','✓'],['待云端同步',cache().pending.length,connected()?'连接后自动保存':'本机已保留改动','↥']];
 $('kpis').innerHTML=stats.map(x=>'<div class="kpi"><div class="kpi-label">'+x[0]+'<span class="kpi-icon" aria-hidden="true">'+x[3]+'</span></div><strong class="kpi-number">'+x[1]+'</strong><div class="kpi-caption">'+x[2]+'</div></div>').join('');
 const queue=openQueue().slice(0,4);
 $('nextQueue').innerHTML=queue.length?queue.map((x,i)=>'<div class="queue-item"><span class="queue-index">'+String(i+1).padStart(2,'0')+'</span><div class="queue-main"><div class="queue-word">'+H(x.keyword)+'</div><div class="queue-meta">'+H(x.seed||x.domain||'已有研究线索')+' · '+H(x.review.status)+'</div></div><button class="row-button" data-review="'+H(x.keyword)+'">继续研究 →</button></div>').join(''):empty(records.length?'这一轮审核已完成':'给研究一个新的起点',records.length?'可以采集更多线索，或查看已经记录的决定。':'建立一个主题词池，从词根收集候选。','开始采集');
 $('progressBars').innerHTML=['待验证','研究中','已核验','批准立项'].map(s=>{const n=records.filter(x=>x.review.status===s).length;return'<div class="progress-row"><div class="label-row"><span>'+s+'</span><strong>'+n+'</strong></div><div class="progress-track"><div class="progress-fill" style="width:'+(records.length?n/records.length*100:0)+'%"></div></div></div>';}).join('');
 renderTable([...records].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,6),'overviewTable');
}
function filteredKeywords(){const q=C.normalize($('keywordSearch').value),state=$('keywordState').value,sort=$('keywordSort').value;const rows=allRecords().filter(x=>(!$('commercialOnly').checked||C.commercialScreen(x).startsWith('商业初筛通过'))&&(keywordKind==='all'||(keywordKind==='official'?C.isOfficial(x):!C.isOfficial(x)))&&(!state||x.review.status===state)&&(!q||C.normalize([x.keyword,x.seed,x.note,x.review.note,x.gap].join(' ')).includes(q)));rows.sort((a,b)=>sort==='volume'?(b.volume??-1)-(a.volume??-1):sort==='cpc'?(b.cpc??-1)-(a.cpc??-1):sort==='az'?a.keyword.localeCompare(b.keyword):String(b.date||'').localeCompare(String(a.date||'')));return rows;}
function renderKeywords(){const all=allRecords(),rows=filteredKeywords();$('allTotal').textContent=all.length;$('candidateTotal').textContent=all.filter(x=>!C.isOfficial(x)).length;$('officialTotal').textContent=all.filter(C.isOfficial).length;renderTable(rows,'keywordTable');$('resultCount').textContent='显示 '+rows.length+' / '+all.length+' 条';$('sourceSheetLink').hidden=!settings.keywordId;if(settings.keywordId)$('sourceSheetLink').href='https://docs.google.com/spreadsheets/d/'+encodeURIComponent(settings.keywordId)+'/edit';}
function filteredReviews(){const q=C.normalize($('reviewSearch').value),filter=$('reviewFilter').value;return allRecords().filter(x=>(!q||C.normalize(x.keyword+' '+x.review.note).includes(q))&&(!filter||(filter==='open'?['待验证','研究中','补充资料'].includes(x.review.status):x.review.status===filter)));}
function renderReviews(){const rows=filteredReviews();$('reviewCount').textContent=rows.length;renderTable(rows,'reviewTable',true);$('conflictList').innerHTML=cache().conflicts.map(x=>'<div class="conflict-card"><strong>'+H(x.keyword)+'</strong><p>云端状态：'+H(x.remoteStatus||'已变化')+'；本机状态：'+H(x.localStatus||'待处理')+'。请选择要保留的版本。</p><button class="row-button" data-remote="'+H(x.keyword)+'">采用云端记录</button><button class="row-button" data-overwrite="'+H(x.keyword)+'">使用本机记录</button></div>').join('');}
function renderRivals(){const rivals=cache().competitors;$('competitorCards').innerHTML=rivals.length?rivals.map(x=>'<article class="competitor-card"><div class="competitor-avatar">'+H((x.name||x.domain||'?').slice(0,1).toUpperCase())+'</div><h3>'+H(x.name||x.domain)+'</h3><div class="competitor-domain">'+H(x.domain)+'</div><p>'+H(x.features||x.notes||'等待补充页面观察')+'</p><div class="competitor-stats"><span class="badge source">DR '+H(C.formatCount(x.dr))+' · 待核验</span><span class="badge source">流量 '+H(C.formatCount(x.traffic))+' · 待核验</span></div>'+(x.url?'<a class="text-link" href="'+H(C.safeUrl(x.url))+'" target="_blank" rel="noopener noreferrer">打开参考页面 ↗</a>':'')+'</article>').join(''):empty('先记录一位值得研究的同行','添加你实际查看过的页面，以及它解决了什么问题。');}
function renderSyncInfo(){const data=cache(),p=pool(),lines=[['当前词池',p.name],['Google 授权',connected()?'有效':'尚未连接 / 已过期'],['最近云端同步',timeLabel(data.snapshotAt)],['待写入队列',data.pending.length+' 项'],['审核冲突',data.conflicts.length+' 项'],['词池保存位置',p.cloud?'云端工作表':'本机 · 连接后创建云端表']];$('syncInfo').innerHTML=lines.map(([label,value])=>'<div class="sync-line"><span>'+H(label)+'</span><strong>'+H(value)+'</strong></div>').join('');}
function renderAll(){
 const p=pool(),records=allRecords();$('poolSelect').innerHTML=bucket.pools.map(x=>'<option value="'+H(x.id)+'"'+(x.id===p.id?' selected':'')+'>'+H(x.name)+'</option>').join('');$('poolMeta').textContent=(COUNTRY[p.country]||p.country)+' · '+(LANG[p.language]||p.language)+(p.cloud?'':' · 本机词池');$('breadcrumbPool').textContent=p.name;$('captureDestination').textContent='保存位置：'+p.name+' / 候选词 · '+(COUNTRY[p.country]||p.country)+' / '+(LANG[p.language]||p.language);$('keywordCount').textContent=records.length;$('todoNav').textContent=openQueue().length;renderOverview();renderKeywords();renderRivals();renderReviews();renderSyncInfo();renderConnection();
}
function saveSettings(){
 const next={clientId:$('oauthClient').value.trim(),keywordId:$('keywordSheet').value.trim(),competitorId:$('competitorSheet').value.trim()};
 if(!/^[a-zA-Z0-9._-]+\.apps\.googleusercontent\.com$/.test(next.clientId)){notify('请输入正确的 Google OAuth Web Client ID');return false;}
 for(const field of ['keywordId','competitorId'])if(!/^[a-zA-Z0-9_-]{15,}$/.test(next[field])){notify('请填写 Spreadsheet ID，而不是完整网址');return false;}
 const oldBinding=bindingKey(),firstSetup=!settings.keywordId,changed=Object.keys(next).some(k=>next[k]!==settings[k]);
 try{localStorage.setItem(CONFIG_KEY,JSON.stringify(next));}catch{notify('连接设置保存失败，请检查浏览器存储权限');return false;}
 settings=next;
 if(oldBinding!==bindingKey()){if(firstSetup&&!root.bindings[bindingKey()])root.bindings[bindingKey()]=bucket;bucket=getBucket();lastCapture={poolId:'',items:[],selected:new Set(),failures:[],completed:0,total:0,stopped:false};renderCapture();}
 if(changed){token='';expiresAt=0;oauthClient=null;showError('');}
 persist();renderAll();notify('连接配置已保存');return true;
}
function connectGoogle(){
 if(!settings.clientId||!settings.keywordId||!settings.competitorId){showView('settings');notify('请先填写并保存连接配置');return;}
 if(!window.google?.accounts?.oauth2){showError('Google 登录组件尚未加载，请检查网络后重试');return;}
 if(working||capturing){notify('请等待当前任务完成');return;}
 const signature=JSON.stringify(settings);
 try{if(!oauthClient)oauthClient=google.accounts.oauth2.initTokenClient({client_id:settings.clientId,scope:'https://www.googleapis.com/auth/spreadsheets',callback:res=>{if(signature!==JSON.stringify(settings)){notify('连接配置已变化，请重新授权');oauthClient=null;return;}if(res.error||!res.access_token){showError('Google 授权未完成：'+(res.error_description||res.error||'未收到授权'));renderConnection();return;}token=res.access_token;expiresAt=Date.now()+Math.max(0,Number(res.expires_in||3600)-30)*1000;showError('');syncNow();},error_callback:error=>{showError(error.type==='popup_failed_to_open'?'登录弹窗被拦截，请允许本站弹窗后重试':'Google 登录弹窗已关闭，可重新连接');renderConnection();}});oauthClient.requestAccessToken({prompt:'consent'});}catch(err){showError('Google 授权初始化失败：'+err.message);renderConnection();}
}
async function syncNow(quiet=false){
 if(working||capturing)return;
 if(!connected()){if(!quiet)notify('请先连接 Google；本机记录会继续保留');renderConnection();return;}
 if(!navigator.onLine){if(!quiet)notify('当前离线，本机记录已保留');renderConnection();return;}
 working=true;showError('');renderConnection();const p=pool(),id=p.id;
 try{
  const remote=await client.loadPools(settings);for(const r of remote){const index=bucket.pools.findIndex(x=>x.id===r.id);if(index<0)bucket.pools.push(r);else bucket.pools[index]={...bucket.pools[index],...r};}
  const active=bucket.pools.find(x=>x.id===id);if(!active.cloud)await client.ensurePool(settings,active);
  const local=bucket.caches[id]||C.emptyCache();let cloud=await client.read(settings,active);
  const result=await client.flush(settings,active,cloud,local.pending||[]);
  if(result.written)cloud=await client.read(settings,active);
  bucket.caches[id]={...C.overlay(cloud,result.remains),pending:result.remains,conflicts:result.conflicts,snapshotAt:new Date().toISOString(),lastLocalEdit:local.lastLocalEdit};
  if(result.errors.length)showError('部分记录尚未同步：'+[...new Set(result.errors)].join('；'));
  else if(!quiet)notify(result.conflicts.length?'数据已读取，请处理审核冲突':'当前词池已同步');
  persist();
 }catch(err){showError('同步失败：'+err.message);persist();}
 finally{working=false;renderAll();}
}
function addManual(){if(working)return notify('同步进行中，请稍后保存');const words=$('newWords').value.split(/[\r\n,，;；]+/).map(x=>x.trim()).filter(Boolean);if(words.length>100)return notify('每次最多添加 100 个关键词，请分批保存');const url=C.safeUrl($('newUrl').value.trim());const items=words.map(keyword=>({keyword,seed:$('newSeed').value.trim(),url,domain:url?new URL(url).hostname:'',note:$('newNote').value.trim(),autocomplete:'手动录入'}));const result=C.addCandidates(cache(),items,pool());persist();$('addDialog').close();$('addForm').reset();renderAll();notify('新增 '+result.added.length+' 条，去重 '+result.duplicates+' 条'+(result.invalid?'，无效 '+result.invalid+' 条':''));if(connected())syncNow(true);}
function openReview(keyword){const x=allRecords().find(item=>C.normalize(item.keyword)===C.normalize(keyword));if(!x)return;activeReview=x.keyword;$('reviewWord').textContent=x.keyword;$('reviewPoolLabel').textContent=pool().name+' / 关键词研究';$('reviewState').value=x.review.status;$('reviewNote').value=x.review.note||'';const conflict=cache().conflicts.find(c=>C.normalize(c.keyword)===C.normalize(keyword));$('reviewConflict').hidden=!conflict;$('reviewConflict').textContent=conflict?'此记录存在云端冲突。请先在审核列表选择保留哪一版本。':'';
 $('reviewContext').innerHTML='<div class="review-metrics">'+[['月搜索量','volume'],['CPC ($)','cpc'],['DR','dr']].map(([label,key])=>'<div class="review-metric"><span>'+label+'</span><strong>'+metric(x,key)+'</strong></div>').join('')+'</div><div class="context-line"><b>线索来源：</b>'+H(x.autocomplete||x.domain||(x.source==='master'?'已有源表':'手动录入'))+'</div><div class="context-line"><b>发现时间：</b>'+H(x.date?timeLabel(x.date):'未记录')+'</div><div class="context-line"><b>指标来源：</b>'+H(x.metricSource&&x.metricDate?x.metricSource+' / '+timeLabel(x.metricDate):'待核验；现有数字不代表已完成来源核验')+'</div>'+(x.url?'<div class="context-line"><a href="'+H(x.url)+'" target="_blank" rel="noopener noreferrer">查看线索来源 ↗</a></div>':'')+'<div class="context-line"><a href="https://www.google.com/search?'+H(new URLSearchParams({q:x.keyword,gl:pool().country.toLowerCase(),hl:pool().language}).toString())+'" target="_blank" rel="noopener noreferrer">查看目标市场搜索结果 ↗</a></div>'+((x.gap||x.note)?'<div class="context-note">'+H(x.gap||x.note)+'</div>':'');
 $('reviewSaveHint').textContent=connected()?'保存后写入当前词池的审核工作表。':'保存到本机，连接 Google 后同步。';$('reviewContext').insertAdjacentHTML('beforeend','<div class="context-note">'+H(C.commercialScreen(x))+'。请核验前五名竞品与最低 DR、趋势范围和内容缺口，将工具、日期及链接填入下方证据；初筛不代表批准立项。</div><div class="context-line"><a target="_blank" rel="noopener noreferrer" href="https://trends.google.com/trends/explore?'+H(new URLSearchParams({geo:pool().country,date:'today 12-m',q:x.keyword}).toString())+'">查看目标市场趋势 ↗</a></div>');if(!$('reviewDialog').open)$('reviewDialog').showModal();
}
function saveReview(next=false){if(working)return notify('同步进行中，请稍后保存');if(cache().conflicts.some(c=>C.normalize(c.keyword)===C.normalize(activeReview)))return notify('请先在审核列表处理这条记录的冲突');const queue=filteredReviews().map(x=>x.keyword),index=queue.findIndex(x=>C.normalize(x)===C.normalize(activeReview));C.enqueueReview(cache(),activeReview,$('reviewState').value,$('reviewNote').value.trim());persist();renderAll();if(next){const nextWord=queue.slice(index+1).find(x=>C.normalize(x)!==C.normalize(activeReview));if(nextWord)openReview(nextWord);else{$('reviewDialog').close();notify('这一轮已处理完，记录已保存');}}else{$('reviewDialog').close();notify('审核记录已保存');}if(connected())syncNow(true);}
function addRival(){if(working)return notify('同步进行中，请稍后保存');const url=C.safeUrl($('rivalUrl').value);if(!url)return notify('请输入有效的 http 或 https 页面网址');const domain=new URL(url).hostname.replace(/^www\./,'');if(cache().competitors.some(x=>C.normalize(x.domain)===C.normalize(domain)))return notify('当前词池已记录这个域名');const item={name:$('rivalName').value.trim(),url,domain,features:$('rivalFeatures').value.trim(),notes:'',date:new Date().toISOString(),pending:true,dr:null,traffic:null};cache().competitors.push(item);cache().pending.push({id:C.uniqueId(),type:'competitor',item});persist();$('rivalDialog').close();$('rivalForm').reset();renderAll();notify('竞品已保存到当前词池');if(connected())syncNow(true);}
function suggest(query,p,signal){return new Promise((resolve,reject)=>{
 if(signal.aborted)return reject(new DOMException('已停止','AbortError'));
 const callback='__radar_suggest_'+C.uniqueId(),script=document.createElement('script');let done=false;
 const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);script.remove();window[callback]=()=>{};setTimeout(()=>{delete window[callback];},60000);};
 const finish=(error,value)=>{if(done)return;done=true;cleanup();error?reject(error):resolve(value);};
 const abort=()=>finish(new DOMException('已停止','AbortError'));
 const timer=setTimeout(()=>finish(Error('联想请求超时')),9000);window[callback]=data=>{if(!Array.isArray(data)||!Array.isArray(data[1]))return finish(Error('联想接口返回格式异常'));finish(null,data[1].filter(v=>typeof v==='string'));};
 script.charset='utf-8';script.referrerPolicy='no-referrer';script.src=C.suggestionUrl(query,p,callback);script.onerror=()=>finish(Error('联想接口被拦截或网络不可用'));signal.addEventListener('abort',abort,{once:true});document.head.appendChild(script);
 });}
async function captureKeywords(){
 if(working||capturing)return;let queries;try{queries=C.buildQueries($('captureSeeds').value,$('captureMods').value);}catch(err){return notify(err.message);}
 const p=C.clone(pool());capturing=true;captureController=new AbortController();const signal=captureController.signal;
 lastCapture={poolId:p.id,items:[],selected:new Set(),failures:[],completed:0,total:queries.length,stopped:false};const map=new Map(),known=new Set(allRecords().map(x=>C.normalize(x.keyword)));renderCapture();busyUI();$('captureProgress').hidden=false;$('captureProgressBar').max=queries.length;
 const deadline=setTimeout(()=>{lastCapture.deadline=true;captureController.abort();},120000);
 for(const request of queries){if(signal.aborted)break;$('captureProgressText').textContent='正在采集 '+(lastCapture.completed+1)+' / '+queries.length+'：'+request.query;
  try{const suggestions=await suggest(request.query,p,signal);for(const value of suggestions){const keyword=C.normalize(value);if(keyword.length<2||keyword.length>200)continue;if(!map.has(keyword))map.set(keyword,{keyword,seed:request.seed,modifier:request.modifier,query:request.query,url:C.suggestionUrl(request.query,p),domain:'suggestqueries.google.com',date:new Date().toISOString(),autocomplete:'Google Autocomplete',source:'candidate',country:p.country,language:p.language,volume:null,cpc:null,ads:null,dr:null,trend:'待核验',note:'联想查询：'+request.query,existing:known.has(keyword)});}}
  catch(err){if(err.name==='AbortError')break;lastCapture.failures.push({query:request.query,error:err.message});}
  lastCapture.completed++;lastCapture.items=[...map.values()].sort((a,b)=>a.keyword.localeCompare(b.keyword));lastCapture.selected=new Set(lastCapture.items.filter(x=>!x.existing).map(x=>x.keyword));$('captureProgressBar').value=lastCapture.completed;saveCapturePreview();renderCapture();
  if(!signal.aborted)await new Promise(resolve=>setTimeout(resolve,180));
 }
 clearTimeout(deadline);lastCapture.stopped=signal.aborted;capturing=false;captureController=null;lastCapture.items=[...map.values()].sort((a,b)=>a.keyword.localeCompare(b.keyword));lastCapture.selected=new Set(lastCapture.items.filter(x=>!x.existing).map(x=>x.keyword));saveCapturePreview();renderCapture();busyUI();notify(lastCapture.failures.length?'采集结束，部分请求失败，请查看结果说明':lastCapture.stopped?'采集已停止，已返回结果可以保留':'联想词采集完成');
}
function renderCapture(){const state=lastCapture,rows=state.poolId===pool().id?state.items:[];$('captureCount').textContent=rows.length;$('exportCaptureBtn').disabled=!rows.length;$('captureSelection').hidden=!rows.some(x=>!x.existing);$('captureSelectAll').checked=rows.filter(x=>!x.existing).every(x=>state.selected.has(x.keyword));$('captureSummary').textContent=rows.length?'共 '+rows.length+' 条联想建议，其中 '+rows.filter(x=>x.existing).length+' 条已在当前词池。':'结果会先出现在这里，选中后再保存到候选池。';
 const status=$('captureStatus');status.hidden=!state.total;status.className='capture-status'+(state.failures.length?(rows.length?' partial':' error'):'');
 if(state.total){const good=state.completed-state.failures.length;status.textContent=(capturing?'采集中。':state.stopped?(state.deadline?'采集达到时间上限，已停止。':'已停止采集。'):'本次采集结束。')+' 完成 '+state.completed+' / '+state.total+' 次查询；成功 '+good+' 次，失败 '+state.failures.length+' 次。'+(state.failures.length?'失败示例：'+state.failures[0].query+'（'+state.failures[0].error+'）。可以调整词缀后重试。':'')+(rows.length?' 联想建议的搜索量、CPC 和趋势均待核验。':'');}
 $('captureProgress').hidden=!capturing;if(!capturing&&state.total)$('captureProgressText').textContent='已完成 '+state.completed+' / '+state.total;
 if(rows.length)$('captureTable').innerHTML='<div class="table-wrap"><table><thead><tr><th aria-label="选择"></th><th class="keyword-cell">联想候选词</th><th class="query-cell">来源查询</th><th>状态</th></tr></thead><tbody>'+rows.map(x=>'<tr><td><input type="checkbox" data-capture-key="'+H(x.keyword)+'" aria-label="选择 '+H(x.keyword)+'"'+(x.existing?' disabled':state.selected.has(x.keyword)?' checked':'')+'></td><td class="keyword-cell"><span class="keyword-name">'+H(x.keyword)+'</span></td><td class="query-cell"><span class="keyword-sub">'+H(x.query)+'</span></td><td><span class="badge '+(x.existing?'':'pending')+'">'+(x.existing?'已有':'待保存')+'</span></td></tr>').join('')+'</tbody></table></div>';
 else $('captureTable').innerHTML=empty(state.total&&!capturing?'本次没有可显示的联想结果':'下一条好线索，从这里发现',state.failures.length?'存在失败请求，不能据此判断该词没有需求。请检查网络或稍后重试。':'填写研究词根，点击“开始采集”。');
 $('saveCaptureBtn').textContent='保存所选 '+state.selected.size+' 条到候选池';$('saveCaptureBtn').disabled=working||capturing||!state.selected.size;
}
function saveCapture(){if(working||capturing||lastCapture.poolId!==pool().id)return;const items=lastCapture.items.filter(x=>lastCapture.selected.has(x.keyword)&&!x.existing);const result=C.addCandidates(cache(),items,pool());if(!persist())return;const known=new Set(allRecords().map(x=>C.normalize(x.keyword)));for(const x of lastCapture.items)x.existing=known.has(C.normalize(x.keyword));lastCapture.selected.clear();saveCapturePreview();renderAll();renderCapture();notify('已保存 '+result.added.length+' 条到 '+pool().name+' 候选池');if(connected())syncNow(true);}

function localToday(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
let pluginPreview=null;
function pluginSignature(){return JSON.stringify([bindingKey(),pool().id,$('pluginTool').value,$('pluginSource').value,$('pluginDate').value,$('pluginRaw').value]);}
function invalidatePlugin(){pluginPreview=null;$('pluginPreview').innerHTML='';$('pluginImportBtn').disabled=true;$('pluginSummary').textContent='输入或词池已变更，请重新解析预览。';$('pluginWarnings').hidden=true;}
function parsePlugin(){
 try{
  const url=C.safeUrl($('pluginSource').value),date=$('pluginDate').value;
  if(!url)throw Error('请填写同行的完整 http/https 网址');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>localToday())throw Error('请填写有效的采集日期，不能晚于今天');
  const result=C.parsePluginText($('pluginRaw').value),known=new Set(allRecords().map(x=>C.normalize(x.keyword))),seen=new Set();
  pluginPreview={signature:pluginSignature(),items:result.items.map(x=>{const duplicate=known.has(x.keyword)||seen.has(x.keyword);seen.add(x.keyword);return {...x,duplicate,selected:!duplicate,url,domain:new URL(url).hostname,metricSource:$('pluginTool').value+'（插件估算）',metricDate:date,autocomplete:'插件文本导入',note:'插件估算指标；DR、前五名竞争、趋势和内容缺口均待人工核验。'};})};
  $('pluginWarnings').hidden=!result.warnings.length;$('pluginWarnings').textContent=result.warnings.join('；');renderPlugin();
 }catch(err){invalidatePlugin();$('pluginSummary').textContent='解析失败：'+err.message;}
}
function renderPlugin(){
 if(!pluginPreview)return;const rows=pluginPreview.items;
 $('pluginSummary').textContent='解析 '+rows.length+' 条；重复 '+rows.filter(x=>x.duplicate).length+' 条。目标词池：'+pool().name+'（'+pool().country+' / '+pool().language+'）。确认后保存到本机队列；连接 Google 后同步。';
 $('pluginPreview').innerHTML='<div class="table-wrap"><table><thead><tr><th>选择</th><th>关键词</th><th>Volume</th><th>CPC ($)</th><th>Ads</th><th>初筛 / 状态</th></tr></thead><tbody>'+rows.map((x,i)=>'<tr><td><input type="checkbox" data-plugin-index="'+i+'" aria-label="导入 '+H(x.keyword)+'"'+(x.duplicate?' disabled':x.selected?' checked':'')+'></td><td>'+H(x.keyword)+'</td><td>'+H(C.formatCount(x.volume))+'</td><td>'+H(x.cpc==null?'—':x.cpc)+'</td><td>'+H(C.formatCount(x.ads))+'</td><td>'+H(x.duplicate?'重复 · 跳过':C.commercialScreen(x))+'</td></tr>').join('')+'</tbody></table></div>';
 $('pluginImportBtn').disabled=working||capturing||!rows.some(x=>x.selected&&!x.duplicate);
}
function importPlugin(){
 if(working||capturing||!pluginPreview)return;
 if(pluginPreview.signature!==pluginSignature()){invalidatePlugin();return notify('输入或词池已变更，请重新解析');}
 const before=C.clone(cache());const result=C.addCandidates(cache(),pluginPreview.items.filter(x=>x.selected&&!x.duplicate),pool(),{pluginImport:true});
 if(!persist()){bucket.caches[pool().id]=before;return;}
 invalidatePlugin();$('pluginSummary').textContent='已保存 '+result.added.length+' 条到 '+pool().name+' 的本机队列；跳过重复 '+result.duplicates+' 条。'+(connected()?'正在尝试同步，请查看顶部同步状态。':'尚未连接 Google，尚未写入云端表格。');
 renderAll();notify('插件候选词已保存；竞争和趋势仍待人工核验');if(connected())syncNow(true);
}
function download(name,data,type){const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function exportExcel(captureOnly=false){
 const p=pool(),rows=captureOnly?lastCapture.items.map(x=>({...x,review:{status:x.existing?'已有候选':'待保存',note:'',updated:''}})):currentView==='keywords'?filteredKeywords():currentView==='reviews'?filteredReviews():allRecords();if(!rows.length)return notify('当前没有可导出的数据');
 const columns=['关键词','词根','月搜索量','CPC ($)','DR','源表 Ads','审核状态','审核备注','来源网址','来源站点','发现时间','目标国家','语言','指标来源','指标查询时间','DR 来源','DR 查询时间','趋势（待核验则不推断）','源表评级','本机待同步'];
 const sheets=[{name:captureOnly?'本次联想结果':'关键词',rows:[columns,...rows.map(x=>[x.keyword,x.seed||'',x.volume??'',x.cpc??'',x.dr??'',x.ads??'',x.review.status,x.review.note||'',x.url||'',x.domain||'',x.date||'',p.country,p.language,x.metricSource||'',x.metricDate||'',x.drSource||'',x.drDate||'',x.source==='master'&&!x.metricSource?'源表值待核验':x.trend||'待核验',x.rating||'',x.pending||x.review.pending?'是':'否'])]}];
 if(!captureOnly)sheets.push({name:'竞品',rows:[C.RIVAL_HEADERS,...cache().competitors.map(x=>[x.name,x.domain,x.url,x.features,x.dr??'',x.traffic??'',x.sitemap||'',x.sitemapStatus||'待核验',x.date||'',x.notes||''])]});
 sheets.push({name:'导出说明',rows:[['项目','说明'],['词池',p.name],['导出时间',new Date().toISOString()],['目标市场',p.country+' / '+p.language],['数据说明','空白表示未知；有值不等于已核验。Google 联想建议不包含搜索量。'],['导出范围',captureOnly?'本次采集结果（含已存在的词）':currentView==='keywords'||currentView==='reviews'?'当前筛选结果':'当前词池全部关键词'],['备份说明','Excel 为数据导出，不是含原始公式的 Sheets 完整备份。完整本机备份请用 JSON。']]});
 const filename=(p.name.replace(/[\\/:*?"<>|]/g,'_')+(captureOnly?'_联想结果':'_研究数据')+'_'+new Date().toISOString().slice(0,10)+'.xlsx');download(filename,RadarExcel.workbook(sheets),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');notify('Excel 已导出，未知指标保持空白');
}
function backup(){download('SEO_Radar_Backup_'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({version:'2.0',exportedAt:new Date().toISOString(),...bucket},null,2),'application/json;charset=utf-8');notify('所有本机词池及待同步记录已备份');}
async function restore(file){try{const data=JSON.parse(await file.text());let imported;if(data.version==='2.0'&&Array.isArray(data.pools)&&data.caches){imported={pools:[C.clone(C.LEGACY)],activePoolId:C.LEGACY.id,caches:{}};const seen=new Set([C.LEGACY.id]);for(const p of data.pools){if(p.id===C.LEGACY.id)continue;const valid=C.createPool(p.name,p.country,p.language,p.id);if(seen.has(p.id))throw Error('备份包含重复词池');seen.add(p.id);imported.pools.push({...valid,cloud:false,createdAt:p.createdAt||valid.createdAt});}for(const p of imported.pools)imported.caches[p.id]=C.migrate(data.caches[p.id]).caches[C.LEGACY.id];if(imported.pools.some(p=>p.id===data.activePoolId))imported.activePoolId=data.activePoolId;}else if(Array.isArray(data.candidates)){imported=C.migrate({...data,official:data.official||data.keywords||[]});}else throw Error('不是支持的 Radar 备份');if(!confirm('恢复将替换当前连接下的本机词池缓存与待同步记录。确认已导出旧备份？'))return;root.bindings[bindingKey()]=imported;bucket=imported;loadCapture();persist();renderAll();renderCapture();notify('已恢复本机数据，连接 Google 后可核对并同步');}catch(err){notify('恢复失败：'+err.message);}}
function switchPool(id){if(working||capturing)return;if(!bucket.pools.some(p=>p.id===id))return;saveCapturePreview();saveCaptureDraft();bucket.activePoolId=id;showError('');persist();loadCapture();$('keywordSearch').value='';$('reviewSearch').value='';renderAll();renderCapture();if(connected())syncNow(true);}
function setup(){
 $('pluginDate').value=localToday();
 $('pluginParseBtn').addEventListener('click',parsePlugin);$('pluginImportBtn').addEventListener('click',importPlugin);
 for(const id of ['pluginTool','pluginSource','pluginDate','pluginRaw'])$(id).addEventListener('input',invalidatePlugin);
 $('pluginPreview').addEventListener('change',event=>{const i=event.target.dataset.pluginIndex;if(i===undefined||!pluginPreview)return;const x=pluginPreview.items[Number(i)];if(x&&!x.duplicate)x.selected=event.target.checked;renderPlugin();});
 const options=C.STATES.map(s=>'<option value="'+s+'">'+s+'</option>').join('');$('keywordState').insertAdjacentHTML('beforeend',options);$('reviewFilter').insertAdjacentHTML('beforeend',options);$('reviewState').innerHTML=options;loadCapture();
 document.addEventListener('click',event=>{const view=event.target.closest('[data-view],[data-go]');if(view)showView(view.dataset.view||view.dataset.go);const review=event.target.closest('[data-review]');if(review)openReview(review.dataset.review);const close=event.target.closest('[data-close]');if(close)close.closest('dialog').close();if(event.target.closest('[data-connect]'))connectGoogle();const kind=event.target.closest('[data-kind]');if(kind){keywordKind=kind.dataset.kind;for(const b of $('keywordTabs').querySelectorAll('button'))b.classList.toggle('active',b===kind);renderKeywords();}const overwrite=event.target.closest('[data-overwrite]'),remote=event.target.closest('[data-remote]');if(overwrite||remote){if(working)return;const word=(overwrite||remote).dataset[overwrite?'overwrite':'remote'],k=C.normalize(word),conflict=cache().conflicts.find(c=>C.normalize(c.keyword)===k);if(!conflict)return;if(overwrite){const op=cache().pending.find(op=>op.type==='review'&&C.normalize(op.keyword)===k);if(op)op.baseUpdated=conflict.remoteUpdated||'';}else cache().pending=cache().pending.filter(op=>!(op.type==='review'&&C.normalize(op.keyword)===k));cache().conflicts=cache().conflicts.filter(c=>C.normalize(c.keyword)!==k);persist();renderAll();if(connected())syncNow(true);else notify('版本选择已保留，连接 Google 后完成同步');}});
 $('menuBtn').addEventListener('click',()=>{const open=$('sidebar').classList.toggle('menu-open');$('menuBtn').setAttribute('aria-expanded',String(open));});$('poolSelect').addEventListener('change',event=>switchPool(event.target.value));$('newPoolBtn').addEventListener('click',()=>$('poolDialog').showModal());
 $('poolForm').addEventListener('submit',event=>{event.preventDefault();if(working||capturing)return;try{if(bucket.pools.length>=100)throw Error('每个工作区最多 100 个词池');const p=C.createPool($('poolName').value,$('poolCountry').value,$('poolLanguage').value);if(bucket.pools.some(x=>C.normalize(x.name)===C.normalize(p.name)&&x.country===p.country&&x.language===p.language))throw Error('相同名称和市场的词池已经存在');bucket.pools.push(p);bucket.caches[p.id]=C.emptyCache();$('poolDialog').close();$('poolForm').reset();switchPool(p.id);$('captureMods').value=MODIFIERS.product;$('modifierPreset').value='product';saveCaptureDraft();showView('capture');notify('已建立 '+p.name+(connected()?'，正在准备云端工作表':'，先保存在本机'));}catch(err){notify(err.message);}});
 $('addBtn').addEventListener('click',()=>{$('manualDestination').textContent='保存到 '+pool().name+' / 候选池';$('addDialog').showModal();});$('addForm').addEventListener('submit',event=>{event.preventDefault();addManual();});$('reviewForm').addEventListener('submit',event=>{event.preventDefault();saveReview(false);});$('saveNextBtn').addEventListener('click',()=>saveReview(true));$('addRivalBtn').addEventListener('click',()=>$('rivalDialog').showModal());$('rivalForm').addEventListener('submit',event=>{event.preventDefault();addRival();});
 $('settingsForm').addEventListener('submit',event=>{event.preventDefault();if(!working)saveSettings();});$('connectSettingsBtn').addEventListener('click',()=>{if(!working&&saveSettings())connectGoogle();});$('connectBtn').addEventListener('click',connectGoogle);$('syncBtn').addEventListener('click',()=>syncNow());$('retryBtn').addEventListener('click',()=>syncNow());$('backupBtn').addEventListener('click',backup);$('importBackupBtn').addEventListener('click',()=>$('backupFile').click());$('backupFile').addEventListener('change',async event=>{if(event.target.files[0])await restore(event.target.files[0]);event.target.value='';});
 $('exportBtn').addEventListener('click',()=>exportExcel());$('exportCaptureBtn').addEventListener('click',()=>exportExcel(true));$('captureBtn').addEventListener('click',captureKeywords);$('cancelCaptureBtn').addEventListener('click',()=>captureController?.abort());$('modifierPreset').addEventListener('change',event=>{if(MODIFIERS[event.target.value])$('captureMods').value=MODIFIERS[event.target.value];saveCaptureDraft();});$('captureMods').addEventListener('input',()=>{$('modifierPreset').value='custom';});$('saveCaptureBtn').addEventListener('click',saveCapture);$('captureSelectAll').addEventListener('change',event=>{lastCapture.selected=new Set(event.target.checked?lastCapture.items.filter(x=>!x.existing).map(x=>x.keyword):[]);saveCapturePreview();renderCapture();});$('captureTable').addEventListener('change',event=>{const key=event.target.dataset.captureKey;if(!key)return;event.target.checked?lastCapture.selected.add(key):lastCapture.selected.delete(key);$('saveCaptureBtn').textContent='保存所选 '+lastCapture.selected.size+' 条到候选池';$('saveCaptureBtn').disabled=!lastCapture.selected.size;saveCapturePreview();});
 $('captureSeeds').addEventListener('change',saveCaptureDraft);$('captureMods').addEventListener('change',saveCaptureDraft);for(const id of ['keywordSearch','keywordState','keywordSort','commercialOnly'])$(id).addEventListener('input',renderKeywords);for(const id of ['reviewSearch','reviewFilter'])$(id).addEventListener('input',renderReviews);
 window.addEventListener('hashchange',()=>showView(location.hash.slice(1),false));window.addEventListener('online',()=>{renderConnection();if(connected())syncNow(true);});window.addEventListener('offline',renderConnection);window.addEventListener('beforeunload',event=>{if(working||capturing){event.preventDefault();event.returnValue='';}});setInterval(()=>{if(connected()&&navigator.onLine)syncNow(true);else renderConnection();},300000);
 persist();renderAll();renderCapture();showView(location.hash.slice(1)||'overview',false);
}
setup();

