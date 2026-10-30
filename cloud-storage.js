/* Isolate shared-workspace caches from existing personal notes before Campus boots. */
(()=>{'use strict';const storage=localStorage,proto=Storage.prototype,get=proto.getItem,set=proto.setItem,remove=proto.removeItem,key=proto.key;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const params=new URL(location.href).searchParams,hash=new URLSearchParams(location.hash.slice(1)),requested=params.get('workspace');
const localMode=params.get('local')==='1';
const guest=uuid.test(hash.get('campus-share')||'')?hash.get('campus-share'):null;
let invite=hash.get('campus-invite');if(uuid.test(invite||'')){sessionStorage.setItem('campus-cloud-invite',invite);history.replaceState(null,'',location.pathname+location.search)}else invite=sessionStorage.getItem('campus-cloud-invite');
let active=uuid.test(requested||'')?requested:get.call(storage,'campus2-cloud-active');if(!uuid.test(active||''))active=null;
if(requested&&active&&!guest)set.call(storage,'campus2-cloud-active',active);
const prefix=active?'campus-cloud-cache:'+active+(guest?':guest:'+guest:'')+':':'';
const content=/^campus2-(tree$|page-|strokes-|flashcards-|meta-|comments?-|published-|versions-|block-templates$)/;
const mapped=k=>prefix&&String(k).startsWith('campus2-')&&!String(k).startsWith('campus2-cloud-')?prefix+k:String(k);
proto.getItem=function(k){return get.call(this,this===storage?mapped(k):k)};
proto.setItem=function(k,v){const actual=this===storage?mapped(k):k,previous=get.call(this,actual);set.call(this,actual,String(v));if(this===storage&&prefix&&content.test(k)&&previous!==String(v))dispatchEvent(new CustomEvent('campus-cloud-dirty',{detail:{key:k}}))};
proto.removeItem=function(k){const actual=this===storage?mapped(k):k,previous=get.call(this,actual);remove.call(this,actual);if(this===storage&&prefix&&content.test(k)&&previous!==null)dispatchEvent(new CustomEvent('campus-cloud-dirty',{detail:{key:k}}))};
function entries(scope=prefix){const result={};for(let i=0;i<storage.length;i++){const actual=key.call(storage,i);if(scope&&!actual.startsWith(scope))continue;const logical=scope?actual.slice(scope.length):actual;if(content.test(logical))result[logical]=get.call(storage,actual)}return result}
const raw={get:k=>get.call(storage,k),set:(k,v)=>set.call(storage,k,String(v)),remove:k=>remove.call(storage,k)};
const hasLocalNotes=Object.keys(entries('')).some(k=>k.startsWith('campus2-page-'));
window.CampusCloudStorage={active,guest,invite,prefix,localMode,hasLocalNotes,uuid,content,raw,assetDbName:active?'campus-assets-cloud-'+active+(guest?'-guest-'+guest:''):'campus-assets',items:()=>entries(),localItems:()=>entries(''),replace(items){for(const k of Object.keys(entries()))if(!(k in items))remove.call(storage,prefix+k);for(const [k,v] of Object.entries(items))if(content.test(k)&&typeof v==='string')set.call(storage,prefix+k,v)},setActive(id){if(id&&!uuid.test(id))throw Error('Invalid workspace');if(id)raw.set('campus2-cloud-active',id);else raw.remove('campus2-cloud-active')}};
if(active||!localMode){document.documentElement.dataset.campusCloudPending='true';const style=document.createElement('style');style.textContent='html[data-campus-cloud-pending] .workspace,#flash,#globalCreate{visibility:hidden}#campusCloudGate{position:fixed;inset:64px 0 0;background:#fff;z-index:10000;display:grid;place-content:center;text-align:center;padding:28px;font:16px/1.6 Arial;color:#172b4d}#campusCloudGate[hidden]{display:none!important}#campusCloudGate button{padding:10px 18px;margin:8px;border:1px solid #b3b9c4;border-radius:5px;background:#fff;color:#172b4d;cursor:pointer}';document.head.append(style);
document.addEventListener('DOMContentLoaded',()=>{if(!document.getElementById('campusCloudGate')){const gate=document.createElement('section');gate.id='campusCloudGate';gate.innerHTML='<h2>Campus online</h2><p>Se pregătește accesul la notițele online…</p>';document.body.append(gate)}})}
})();
