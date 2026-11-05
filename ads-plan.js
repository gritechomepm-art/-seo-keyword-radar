/* Paid Ads: read-only join, not bidding or affiliate attribution. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadarAds=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const STATES=['待验证','SEO优先','暂停投放','已上线'];
function verified(p,uid){
 if(!p||!uid||p.uid!==uid||p.status!=='已记录已验证链接'||!p.verifiedAt)return false;
 try{const u=new URL(p.affiliateUrl||'');return u.protocol==='https:'&&u.hostname==='pboost.me'&&u.searchParams.get('uid')===uid;}catch{return false;}
}
function join(records,promotions){
 const map=new Map();for(const p of promotions||[]){const uid=String(p.uid||'').trim();if(!uid)continue;map.set(uid,[...(map.get(uid)||[]),p]);}
 return(records||[]).filter(x=>x.source==='master').map(x=>{
  const uid=String(x.uid||'').trim(),matches=map.get(uid)||[],p=uid&&matches.length===1?matches[0]:null;
  return{...x,uid,adsStatus:STATES.includes(x.adsStatus)?x.adsStatus:'待验证',promotion:p,
   conflict:matches.length>1,verifiedLink:verified(p,uid)};
 });
}
function message(x){
 if(x.adsStatus==='暂停投放')return'暂停投放';
 if(x.adsStatus==='SEO优先')return'SEO 优先';
 if(!x.uid)return'未绑定 UID';
 if(x.conflict)return'UID 有多份配置，需人工核验';
 if(!x.promotion)return'缺少推广配置';
 if(!x.verifiedLink)return'联盟深链未核验';
 return'跟踪深链已记录；付费推广许可与最高 CPC 仍待核验';
}
function select(rows,{text='',status='',max='',linked=false}={}){
 const q=String(text).toLowerCase().trim(),cap=max===''?null:Number(max);
 return rows.filter(x=>(!q||[x.keyword,x.uid,x.promotion?.brand,x.promotion?.model].join(' ').toLowerCase().includes(q))&&(!status||x.adsStatus===status)&&(!linked||x.uid)&&(cap===null||(Number.isFinite(cap)&&x.cpc!=null&&x.cpc<=cap)));
}
return{STATES,join,verified,message,select};
});
