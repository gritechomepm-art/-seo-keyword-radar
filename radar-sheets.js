/* Google Sheets adapter. Every write is scoped to the selected pool. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./radar-core.js'):root.RadarCore);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadarSheets=api;})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  const range=(tab,cells)=>"'"+tab.replace(/'/g,"''")+"'!"+cells;
  const col=n=>{let s='';for(;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
  class Client {
    constructor({getToken,fetcher=globalThis.fetch,onUnauthorized=()=>{}}){this.getToken=getToken;this.fetcher=fetcher;this.onUnauthorized=onUnauthorized;}
    async request(path,{method='GET',body}={}){
      const token=this.getToken();if(!token)throw Error('请先连接 Google');
      const response=await this.fetcher('https://sheets.googleapis.com/v4/spreadsheets/'+path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(25000)});
      let data={};try{data=await response.json();}catch{}
      if(!response.ok){const error=Error(data?.error?.message||'Google Sheets 请求失败（HTTP '+response.status+'）');error.status=response.status;if(response.status===401){this.onUnauthorized();error.auth=true;error.message='Google 授权已过期，请重新连接';}throw error;}return data;
    }
    async meta(id){const data=await this.request(encodeURIComponent(id)+'?fields=sheets.properties(sheetId,title,gridProperties)');return(data.sheets||[]).map(s=>s.properties);}
    async values(id,tab,cells){const data=await this.request(encodeURIComponent(id)+'/values/'+encodeURIComponent(range(tab,cells)));return data.values||[];}
    async put(id,tab,cells,values){return this.request(encodeURIComponent(id)+'/values/'+encodeURIComponent(range(tab,cells))+'?valueInputOption=RAW',{method:'PUT',body:{majorDimension:'ROWS',values}});}
    async append(id,tab,cells,values){return this.request(encodeURIComponent(id)+'/values/'+encodeURIComponent(range(tab,cells))+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',{method:'POST',body:{majorDimension:'ROWS',values}});}
    async ensureTabs(id,tabs){
      let meta=await this.meta(id);const missing=tabs.filter(t=>!meta.some(s=>s.title===t.title));
      if(missing.length){try{await this.request(encodeURIComponent(id)+':batchUpdate',{method:'POST',body:{requests:missing.map(t=>({addSheet:{properties:{title:t.title,gridProperties:{rowCount:1000,columnCount:t.headers.length,frozenRowCount:1}}}}))}});}catch(err){meta=await this.meta(id);if(missing.some(t=>!meta.some(s=>s.title===t.title)))throw err;}}
      for(const t of tabs){const rows=await this.values(id,t.title,'A1:'+col(t.headers.length)+'1');if(!rows.length||!(rows[0]||[]).some(v=>String(v).trim()))await this.put(id,t.title,'A1:'+col(t.headers.length)+'1',[t.headers]);else if(t.strict&&t.headers.some((h,i)=>rows[0][i]!==h))throw Error('工作表表头不匹配，已停止写入：'+t.title);}
    }
    async loadPools(settings){const meta=await this.meta(settings.keywordId);if(!meta.some(s=>s.title===C.REGISTRY))return[];return C.parsePoolRows(await this.values(settings.keywordId,C.REGISTRY,'A1:H1000'));}
    async ensurePool(settings,pool){
      if(pool.legacy)return;
      const id=settings.keywordId;
      await this.ensureTabs(id,[{title:C.REGISTRY,headers:C.POOL_HEADERS,strict:true},{title:pool.keywordTab,headers:C.HEADERS,strict:true},{title:pool.competitorTab,headers:C.RIVAL_HEADERS,strict:true},{title:pool.reviewTab,headers:C.REVIEW_HEADERS,strict:true}]);
      const existing=C.parsePoolRows(await this.values(id,C.REGISTRY,'A1:H1000'));
      if(!existing.some(p=>p.id===pool.id))await this.append(id,C.REGISTRY,'A:H',[C.poolRow(pool)]);
      pool.cloud=true;
    }
    async ensureCandidateColumns(settings,pool){
      const id=settings.keywordId,meta=await this.meta(id),sheet=meta.find(s=>s.title===pool.keywordTab);
      if(!sheet)throw Error('候选词工作表不存在：'+pool.keywordTab);
      if(sheet.gridProperties.columnCount<C.HEADERS.length)await this.request(encodeURIComponent(id)+':batchUpdate',{method:'POST',body:{requests:[{updateSheetProperties:{properties:{sheetId:sheet.sheetId,gridProperties:{columnCount:C.HEADERS.length}},fields:'gridProperties.columnCount'}}]}});
      const cells=await this.values(id,pool.keywordTab,'O1:V1'),old=cells[0]||[],expected=C.HEADERS.slice(14);
      if(old.some((value,i)=>value!==''&&value!==expected[i]))throw Error('候选表 O–V 列已有其他字段，已停止写入以保护原数据');
      if(expected.some((value,i)=>old[i]!==value))await this.put(id,pool.keywordTab,'O1:V1',[expected]);
    }
    async read(settings,pool){
      const meta=await this.meta(settings.keywordId),sheet=meta.find(s=>s.title===pool.keywordTab);if(!sheet)throw Error('找不到候选词工作表：'+pool.keywordTab);
      const end=col(Math.min(22,sheet.gridProperties.columnCount));
      const [master,candidates,rivals,reviews]=await Promise.all([pool.legacy?this.values(settings.keywordId,meta.some(s=>s.title==='03_国家公园_正式关键词')?'03_国家公园_正式关键词':pool.masterTab,meta.some(s=>s.title==='03_国家公园_正式关键词')?'A1:M':'A1:K'):[],this.values(settings.keywordId,pool.keywordTab,'A1:'+end),this.values(pool.legacy?settings.competitorId:settings.keywordId,pool.competitorTab,'A1:J'),meta.some(s=>s.title===pool.reviewTab)?this.values(settings.keywordId,pool.reviewTab,'A1:D'):[]]);
      return{...C.emptyCache(),official:pool.legacy?(C.parseOfficial(master).length?C.parseOfficial(master):C.parseMaster(meta.some(s=>s.title==='03_国家公园_正式关键词')?await this.values(settings.keywordId,pool.masterTab,'A1:K'):master)):[],candidates:C.parseCandidates(candidates),competitors:C.parseRivals(rivals),reviews:C.parseReviews(reviews)};
    }
    async flush(settings,pool,cloud,pending){
      const remains=[],conflicts=[],errors=[];let written=0,candidateReady=false,reviewReady=false;
      const known=new Set([...cloud.official,...cloud.candidates].map(x=>C.normalize(x.keyword))),rivals=new Set(cloud.competitors.map(x=>C.normalize(x.domain)));
      for(let i=0;i<pending.length;i++){const op=pending[i];try{
        if(op.type==='candidate'){
          if(known.has(C.normalize(op.item.keyword)))continue;
          if(!candidateReady){await this.ensureCandidateColumns(settings,pool);candidateReady=true;}
          await this.append(settings.keywordId,pool.keywordTab,'A:V',[C.candidateRow(op.item,pool)]);known.add(C.normalize(op.item.keyword));written++;
        }else if(op.type==='review'){
          const remote=cloud.reviews[C.normalize(op.keyword)];
          if((remote?.updated||'')!==(op.baseUpdated||'')){if(remote?.status===op.status&&(remote?.note||'')===(op.note||''))continue;conflicts.push({keyword:op.keyword,remoteUpdated:remote?.updated||'',localStatus:op.status,remoteStatus:remote?.status||'待验证'});remains.push(op);continue;}
          if(!reviewReady){await this.ensureTabs(settings.keywordId,[{title:pool.reviewTab,headers:C.REVIEW_HEADERS,strict:true}]);reviewReady=true;}
          const updated=new Date().toISOString(),row=[op.keyword,op.status,op.note,updated];
          if(remote?.row)await this.put(settings.keywordId,pool.reviewTab,'A'+remote.row+':D'+remote.row,[row]);else await this.append(settings.keywordId,pool.reviewTab,'A:D',[row]);
          cloud.reviews[C.normalize(op.keyword)]={status:op.status,note:op.note,updated,row:remote?.row||0};written++;
        }else if(op.type==='competitor'){
          const x=op.item;if(rivals.has(C.normalize(x.domain)))continue;
          await this.append(pool.legacy?settings.competitorId:settings.keywordId,pool.competitorTab,'A:J',[[x.name,x.domain,x.url,x.features,x.dr??'',x.traffic??'',x.sitemap||'',x.sitemapStatus||'待核验',x.date,x.notes||'']]);rivals.add(C.normalize(x.domain));written++;
        }else throw Error('待同步操作类型不受支持，请先导出备份');
      }catch(err){remains.push(op);errors.push(err.message);remains.push(...pending.slice(i+1));break;}}
      return{remains,conflicts,errors,written};
    }
  }
  return{Client};
});
