/* Shared data rules. No credentials or private datasets. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RadarCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const normalize = s => String(s ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
  const html = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = v => v === null || v === undefined || String(v).trim() === '' ? null : (Number.isFinite(Number(String(v).replace(/,/g, ''))) ? Number(String(v).replace(/,/g, '')) : null);
  const safeUrl = value => { try { const u = new URL(value); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch { return ''; } };
  const parkPrefix = /^(national park|zion|utah mighty 5|grand circle|joshua tree|death valley|junior ranger|yellowstone|smoky mountains|acadia|yosemite|grand canyon|saguaro|big bend)/i;
  const STATES = ['待验证', '研究中', '已核验', '批准立项', '补充资料', '不立项'];
  const HEADERS = ['词根', '关键词', '来源网址', '来源站点', '发现时间', '去重状态', '月搜索量', 'CPC ($)', '源表 Ads（待核验）', 'DR（待核验）', '联想词来源', '指标查询状态', '搜索结果核验', '备注', '目标国家', '语言', '指标来源', '指标查询时间', '逐月搜索量 JSON', '趋势状态', 'DR 来源', 'DR 查询时间'];
  const RIVAL_HEADERS = ['竞品名称','域名','页面网址','页面功能或特点','DR（待核验）','月流量（待核验）','Sitemap','Sitemap 状态','发现日期','备注'];
  const REVIEW_HEADERS = ['关键词', '审核状态', '审核备注', '更新时间'];
  const POOL_HEADERS = ['词池 ID','词池名称','目标国家','语言','关键词工作表','竞品工作表','审核工作表','创建时间'];
  const REGISTRY = '05_关键词词池';
  const LEGACY = Object.freeze({id:'national-parks', name:'国家公园', country:'US', language:'en', legacy:true, cloud:true, masterTab:'Untitled', keywordTab:'国家公园_候选池_20261103', competitorTab:'国家公园_真实同行_20261103', reviewTab:'04_国家公园_审核记录'});
  const emptyCache = () => ({official:[], candidates:[], competitors:[], reviews:Object.create(null), pending:[], conflicts:[], snapshotAt:null, lastLocalEdit:null});
  const clone = v => JSON.parse(JSON.stringify(v));
  function migrate(oldCache) {
    const cache = {...emptyCache(), ...(oldCache || {})};
    for (const k of ['official','candidates','competitors','pending','conflicts']) if (!Array.isArray(cache[k])) cache[k] = [];
    if (!cache.reviews || typeof cache.reviews !== 'object' || Array.isArray(cache.reviews)) cache.reviews = {};
    return {pools:[clone(LEGACY)], activePoolId:LEGACY.id, caches:{[LEGACY.id]:cache}};
  }
  function createPool(name, country='US', language='en', id) {
    name = String(name || '').trim();
    if (!name || name.length > 50) throw Error('词池名称需要 1–50 个字符');
    if (!['US','GB','CA','AU','DE','FR','ES','SG'].includes(country)) throw Error('请选择支持的目标国家');
    if (!['en','de','fr','es','zh-CN'].includes(language)) throw Error('请选择支持的语言');
    id ||= 'p_' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().replace(/-/g,'').slice(0,14) : Date.now().toString(36) + Math.random().toString(36).slice(2,8));
    if (!/^p_[a-z0-9]{6,30}$/.test(id)) throw Error('词池 ID 格式不正确');
    const prefix = '词池_' + id.slice(2);
    return {id,name,country,language,legacy:false,cloud:false,keywordTab:prefix+'_关键词',competitorTab:prefix+'_竞品',reviewTab:prefix+'_审核',createdAt:new Date().toISOString()};
  }
  const poolRow = p => [p.id,p.name,p.country,p.language,p.keywordTab,p.competitorTab,p.reviewTab,p.createdAt || ''];
  function parsePoolRows(rows) {
    return rows.slice(1).filter(r => r[0]).map(r => {
      const p = createPool(r[1],r[2],r[3],r[0]);
      if (r[4] !== p.keywordTab || r[5] !== p.competitorTab || r[6] !== p.reviewTab) throw Error('词池登记表中的工作表名称不匹配，请检查：' + r[1]);
      return {...p,cloud:true,createdAt:r[7] || ''};
    });
  }
  function parseMaster(rows) {
    return rows.slice(1).map((r,i) => ({r,i})).filter(({r}) => parkPrefix.test(normalize(r[0]))).map(({r,i}) => ({keyword:String(r[0]).trim(),volume:number(r[1]),cpc:number(r[2]),ads:number(r[3]),dr:number(r[4]),trend:r[5] || '待核验',gap:r[9] || '',rating:r[10] || '',source:'master',row:i+2,metricSource:'',metricDate:'',drSource:'',drDate:'',note:''}));
  }
  function parseCandidates(rows) {
    return rows.slice(1).map((r,i) => ({r,i})).filter(({r}) => normalize(r[1])).map(({r,i}) => ({keyword:String(r[1]).trim(),seed:r[0] || '',url:safeUrl(r[2]),domain:r[3] || '',date:r[4] || '',volume:number(r[6]),cpc:number(r[7]),ads:number(r[8]),dr:number(r[9]),autocomplete:r[10] || '',dataforseo:r[11] || '待查询',serp:r[12] || '待验证',note:r[13] || '',country:r[14] || '',language:r[15] || '',metricSource:r[16] || '',metricDate:r[17] || '',monthly:r[18] || '',trend:r[19] || '待核验',drSource:r[20] || '',drDate:r[21] || '',source:'candidate',row:i+2}));
  }
  function candidateRow(x,p) {
    return [x.seed || '',x.keyword,x.url || '',x.domain || '',x.date || new Date().toISOString(),'自动去重',x.volume ?? '',x.cpc ?? '',x.ads ?? '',x.dr ?? '',x.autocomplete || '手动录入',x.dataforseo || '未查询',x.serp || '待验证',x.note || '',p.country,p.language,x.metricSource || '',x.metricDate || '',x.monthly || '',x.trend || '待核验',x.drSource || '',x.drDate || ''];
  }
  function parseRivals(rows) { return rows.slice(1).filter(r => normalize(r[1])).map(r => ({name:r[0] || '',domain:r[1] || '',url:safeUrl(r[2]),features:r[3] || '',dr:number(r[4]),traffic:number(r[5]),sitemap:safeUrl(r[6]),sitemapStatus:r[7] || '待核验',date:r[8] || '',notes:r[9] || ''})); }
  function parseReviews(rows) {
    const out = Object.create(null);
    rows.slice(1).forEach((r,i) => { const k=normalize(r[0]); if(k) out[k]={status:STATES.includes(r[1]) ? r[1] : '待验证',note:r[2] || '',updated:r[3] || '',row:i+2}; });
    return out;
  }
  function records(cache) {
    const map = new Map();
    for (const item of [...cache.candidates,...cache.official]) map.set(normalize(item.keyword), item);
    return [...map.values()].map(x => ({...x,review:(Object.hasOwn(cache.reviews,normalize(x.keyword))?cache.reviews[normalize(x.keyword)]:null) || {status:'待验证',note:'',updated:''}}));
  }
  const isOfficial = x => x.source === 'master' || x.review?.status === '批准立项';
  function addCandidates(cache,items,pool) {
    const known = new Set(records(cache).map(x => normalize(x.keyword)));
    const added=[]; let duplicates=0, invalid=0;
    for(const item of items) {
      const keyword = normalize(item.keyword);
      if(keyword.length<2 || keyword.length>200 || !/[\p{L}\p{N}]/u.test(keyword)) { invalid++; continue; }
      if(known.has(keyword)) { duplicates++; continue; }
      known.add(keyword);
      const x={...item,keyword,source:'candidate',country:pool.country,language:pool.language,date:item.date || new Date().toISOString(),volume:null,cpc:null,ads:null,dr:null,metricSource:'',metricDate:'',trend:'待核验',pending:true};
      cache.candidates.push(x); cache.pending.push({id:uniqueId(),type:'candidate',item:clone(x)}); added.push(x);
    }
    cache.lastLocalEdit=new Date().toISOString();
    return {added,duplicates,invalid};
  }
  function uniqueId(){return Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);}
  function enqueueReview(cache,keyword,status,note) {
    if(!STATES.includes(status)) throw Error('审核状态无效');
    const k=normalize(keyword), old=cache.pending.find(op => op.type==='review' && normalize(op.keyword)===k);
    const baseUpdated=old ? old.baseUpdated : (cache.reviews[k]?.updated || '');
    cache.pending=cache.pending.filter(op => !(op.type==='review' && normalize(op.keyword)===k));
    const createdAt=new Date().toISOString();
    cache.pending.push({id:uniqueId(),type:'review',keyword,status,note,baseUpdated,createdAt});
    Object.defineProperty(cache.reviews,k,{value:{status,note,updated:createdAt,pending:true},writable:true,enumerable:true,configurable:true}); cache.lastLocalEdit=createdAt;
  }
  function overlay(cloud,pending) {
    const next=clone(cloud);
    for(const op of pending) {
      if(op.type==='candidate' && ![...next.official,...next.candidates].some(x=>normalize(x.keyword)===normalize(op.item.keyword))) next.candidates.push({...op.item,pending:true});
      if(op.type==='review') next.reviews[normalize(op.keyword)]={status:op.status,note:op.note,updated:op.createdAt,pending:true};
      if(op.type==='competitor' && !next.competitors.some(x=>normalize(x.domain)===normalize(op.item.domain))) next.competitors.push({...op.item,pending:true});
    }
    return next;
  }
  function buildQueries(seedsText,modifiersText) {
    const seeds=[...new Set(String(seedsText || '').split(/[\n\r]+/).map(normalize).filter(Boolean))];
    if(!seeds.length || seeds.length>5) throw Error('请输入 1–5 个词根，每行一个');
    if(seeds.some(s=>s.length>100)) throw Error('每个词根最多 100 个字符');
    const mods=[...new Set(['',...String(modifiersText || '').split(/[,，\n\r]+/).map(normalize).filter(Boolean)])];
    const map=new Map();
    for(const seed of seeds) for(const modifier of mods) {
      const query=normalize(seed+' '+modifier);
      if(!map.has(query)) map.set(query,{query,seed,modifier});
    }
    if(map.size>60) throw Error('每次最多 60 个联想查询，请减少词根或词缀');
    return [...map.values()];
  }
  function suggestionUrl(query,pool,callback) {
    if(callback && !/^__radar_suggest_[a-z0-9_]+$/.test(callback)) throw Error('回调名称无效');
    const params=new URLSearchParams({client:'firefox',hl:pool.language,gl:pool.country.toLowerCase(),q:query});
    if(callback) params.set('callback',callback);
    return 'https://suggestqueries.google.com/complete/search?'+params;
  }
  function formatCount(v) { return v===null || v===undefined || v==='' ? '—' : Number(v).toLocaleString('en-US'); }
  return {normalize,html,number,safeUrl,STATES,HEADERS,RIVAL_HEADERS,REVIEW_HEADERS,POOL_HEADERS,REGISTRY,LEGACY,emptyCache,clone,migrate,createPool,poolRow,parsePoolRows,parseMaster,parseCandidates,candidateRow,parseRivals,parseReviews,records,isOfficial,addCandidates,uniqueId,enqueueReview,overlay,buildQueries,suggestionUrl,formatCount};
});
