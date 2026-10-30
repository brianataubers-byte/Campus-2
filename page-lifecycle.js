/* Page states live inside campus2-tree, so backups and online synchronization retain them. */
(function(root){
'use strict';
const hidden=n=>n.campusState==='archived'||n.campusState==='trashed';
function find(tree,id,path=[]){for(const node of tree){const next=[...path,node];if(node.id===id)return {node,path:next};const child=find(node.children||[],id,next);if(child)return child}return null}
function active(tree,id){const f=find(tree,id);return !!f&&!f.path.some(hidden)}
function pages(tree){const out=[];for(const n of tree){if(hidden(n))continue;if(n.kind==='page')out.push(n);out.push(...pages(n.children||[]))}return out}
function listed(tree,state,path=[],blocked=false){const out=[];for(const n of tree){const names=[...path,n.name];if(!blocked&&n.kind==='page'&&n.campusState===state)out.push({node:n,path:names.join(' / ')});out.push(...listed(n.children||[],state,names,blocked||hidden(n)))}return out}
function count(node){return (node.kind==='page'?1:0)+(node.children||[]).reduce((s,n)=>s+count(n),0)}
function change(tree,id,state,at=new Date().toISOString()){
 const f=find(tree,id);if(!f||f.node.kind!=='page')throw Error('Pagina nu mai există.');
 if(f.path.slice(0,-1).some(hidden))throw Error('Restaurează mai întâi pagina părinte.');
 const n=f.node;
 if(state==='restore'){if(!hidden(n))throw Error('Pagina este deja activă.');if(n.campusState==='trashed'&&n.campusPreviousState==='archived')n.campusState='archived';else delete n.campusState;delete n.campusPreviousState;delete n.campusStateAt;return n}
 if(!['archived','trashed'].includes(state))throw Error('Acțiune invalidă.');
 if(n.campusState==='trashed'||n.campusState===state)throw Error('Pagina este deja în această stare.');
 if(state==='archived'&&hidden(n))throw Error('Restaurează mai întâi pagina.');
 if(state==='trashed'&&n.campusState==='archived')n.campusPreviousState='archived';else delete n.campusPreviousState;
 n.campusState=state;n.campusStateAt=at;return n;
}
const model={hidden,find,active,pages,listed,count,change};
if(typeof module!=='undefined'&&module.exports)module.exports=model;
if(!root.document)return;
root.CampusLifecycleModel=model;
const E=root.CampusEditor,doc=root.document,$=id=>doc.getElementById(id);if(!E)return;
let busy=false,menuId=null,tab='archived';
const canManage=()=>!root.CampusCloudStorage?.active||!!root.CampusCloud?.canEdit();
function button(text,fn){const b=doc.createElement('button');b.type='button';b.textContent=text;b.onclick=()=>Promise.resolve().then(fn).catch(err=>E.notice(err.message));return b}
const style=doc.createElement('style');style.textContent=`
#campusPageActions{white-space:nowrap;font-size:14px!important;border:1px solid #dfe1e6!important;border-radius:5px!important;padding:8px 10px!important}
#campusPageMenu{position:fixed;z-index:20020;min-width:225px;background:white;border:1px solid #dfe1e6;border-radius:7px;box-shadow:0 8px 28px #091e4233;padding:6px;display:flex;flex-direction:column;gap:3px}
#campusPageMenu[hidden],#campusPageActions[hidden],#campusPageLibraryButton[hidden],.page-state-menu[hidden]{display:none!important}
#campusPageMenu button{text-align:left!important;padding:11px 14px!important;font-size:14px!important}
#campusPageMenu button:last-child{color:#ae2a19!important}
.tree-row>.page-state-menu{padding:4px 8px!important;font-size:19px!important;line-height:20px;flex:none}
#campusPageLibrary{width:min(730px,calc(100vw - 24px));max-height:85vh;overflow:auto;padding:24px;border:1px solid #dfe1e6;border-radius:9px;color:#172b4d;font:14px/1.5 Arial,sans-serif}
#campusPageLibrary::backdrop{background:#091e4266}
#campusPageLibrary h2{margin:0 0 16px;font-size:24px}
#campusPageLibrary .state-tabs{display:flex;gap:8px;border-bottom:1px solid #dfe1e6;padding-bottom:14px;margin-bottom:8px}
#campusPageLibrary .state-tabs button[aria-selected=true]{background:#e9f2ff!important;color:#0c66e4!important}
#campusPageLibrary .state-row{display:flex;gap:16px;align-items:center;border-bottom:1px solid #dfe1e6;padding:16px 0}
#campusPageLibrary .state-name{flex:1;min-width:0;overflow-wrap:anywhere}
#campusPageLibrary small{display:block;color:#626f86;margin-top:5px}
#campusPageLibrary .state-buttons{display:flex;gap:6px;flex-wrap:wrap}
#campusPageLibrary .state-footer{display:flex;justify-content:flex-end;margin-top:20px}
#campusPageLibrary button{font-size:14px!important;border-radius:4px!important;padding:8px 12px!important}
#campusPageLibrary .state-restore{background:#0c66e4!important;color:white!important}
@media(max-width:650px){#campusPageActions{font-size:12px!important;padding:6px!important}.state-row{align-items:flex-start!important;flex-direction:column}.state-buttons{width:100%}}
@media print{#campusPageMenu,#campusPageLibrary,#campusPageActions{display:none!important}}`;
doc.head.append(style);
const menu=doc.createElement('div');menu.id='campusPageMenu';menu.hidden=true;menu.setAttribute('role','menu');doc.body.append(menu);
const actions=button('⋯ Pagină',()=>showMenu(selectedPage,actions));actions.id='campusPageActions';actions.setAttribute('aria-label','Acțiuni pagină');actions.setAttribute('aria-haspopup','menu');actions.setAttribute('aria-expanded','false');$('sharePage').before(actions);
const library=doc.createElement('dialog');library.id='campusPageLibrary';library.setAttribute('aria-labelledby','campusPageLibraryTitle');doc.body.append(library);
const libraryButton=button('Arhivă și coș',()=>openLibrary());libraryButton.id='campusPageLibraryButton';$('sidebar').querySelector('.side-footer').prepend(libraryButton);
function closeMenu(){menu.hidden=true;menuId=null;actions.setAttribute('aria-expanded','false')}
function showMenu(id,anchor){
 if(!canManage()||busy)return;const f=find(treeData,id);if(!f||!active(treeData,id))return;
 menuId=id;menu.replaceChildren(button('Arhivează pagina',()=>perform(id,'archived')),button('Șterge → mută în coș',()=>perform(id,'trashed')));
 for(const b of menu.children)b.setAttribute('role','menuitem');menu.hidden=false;actions.setAttribute('aria-expanded','true');
 const r=anchor.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(r.left,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,Math.min(r.bottom+6,innerHeight-menu.offsetHeight-8))+'px';menu.firstElementChild.focus();
}
function emptyPage(){
 selectedPage=null;root.CampusContent?.select(null);$('note').replaceChildren();const h=doc.createElement('h1');h.textContent='Nu există pagini active';const p=doc.createElement('p');p.textContent='Creează o pagină nouă sau restaurează una din Arhivă și coș.';$('note').append(h,p);$('note').contentEditable='false';$('breadcrumb').textContent='Campus';$('cfTitle').textContent='Campus';if(typeof strokes!=='undefined')strokes=[];if(typeof resize==='function')resize();root.CampusContent?.refreshToc();
}
function reconcile(){if(selectedPage&&active(treeData,selectedPage))return;const first=pages(treeData)[0];if(first)E.open(first.id);else emptyPage()}
async function perform(id,state){
 if(busy||!canManage())return;const f=find(treeData,id);if(!f)return;const amount=count(f.node),extra=amount>1?' Acțiunea include și cele '+(amount-1)+' subpagini.':'';
 if(state!=='restore'&&!confirm((state==='archived'?'Arhivezi':'Muți în coș')+' pagina „'+f.node.name+'”?'+extra+(state==='archived'?' O poți readuce din Arhivă.':' Conținutul se păstrează și îl poți restaura din Coș.')))return;
 if(!canManage())return;if(!E.saveNow())throw Error('Pagina nu a putut fi salvată. Exportă un backup înainte de a continua.');
 busy=true;closeMenu();const before=JSON.stringify(treeData);let saved=false;
 try{
  change(treeData,id,state);try{treeSave();saved=true}catch(err){treeData=JSON.parse(before);throw err}
  renderTree();reconcile();renderLibrary();sync();
  if(root.CampusCloudStorage?.active){await root.CampusCloud.flush(true);const s=root.CampusCloud.state;if(s.dirty||s.status!=='Salvat online'){E.notice('Acțiunea este păstrată pe acest dispozitiv. Verifică salvarea online înainte să închizi.');return}}
  E.notice(state==='archived'?'Pagina a fost arhivată.':state==='trashed'?'Pagina a fost mutată în Coș.':'Pagina a fost restaurată.');
 }catch(err){if(!saved)renderTree();throw err}finally{busy=false;renderLibrary();sync()}
}
function renderLibrary(){
 if(!library.open)return;library.replaceChildren();const h=doc.createElement('h2');h.id='campusPageLibraryTitle';h.textContent='Arhivă și coș';library.append(h);
 const tabs=doc.createElement('div');tabs.className='state-tabs';tabs.setAttribute('role','tablist');
 for(const [value,label] of [['archived','Arhivă'],['trashed','Coș']]){const b=button(label+' ('+listed(treeData,value).length+')',()=>{tab=value;renderLibrary()});b.setAttribute('role','tab');b.setAttribute('aria-selected',String(tab===value));tabs.append(b)}library.append(tabs);
 const help=doc.createElement('p');help.textContent=tab==='archived'?'Paginile arhivate sunt păstrate în afara listei principale. Restaurarea le readuce la locul lor.':'Paginile șterse sunt păstrate aici împreună cu subpaginile. Le poți restaura.';library.append(help);
 const items=listed(treeData,tab);
 if(!items.length){const p=doc.createElement('p');p.textContent=tab==='archived'?'Nu ai pagini arhivate.':'Coșul este gol.';library.append(p)}
 for(const item of items){const row=doc.createElement('div');row.className='state-row';const name=doc.createElement('div');name.className='state-name';const strong=doc.createElement('strong');strong.textContent=item.node.name;const small=doc.createElement('small');small.textContent=item.path+(count(item.node)>1?' · '+count(item.node)+' pagini cu tot cu subpagini':'');name.append(strong,small);row.append(name);
  if(canManage()){const controls=doc.createElement('div');controls.className='state-buttons';const restore=button('Restaurează',()=>perform(item.node.id,'restore'));restore.className='state-restore';restore.disabled=busy;controls.append(restore);if(tab==='archived'){const del=button('Șterge',()=>perform(item.node.id,'trashed'));del.disabled=busy;controls.append(del)}row.append(controls)}library.append(row)
 }
 const footer=doc.createElement('div');footer.className='state-footer';footer.append(button('Închide',()=>library.close()));library.append(footer);
}
function openLibrary(){if(!canManage())return;closeMenu();if(!library.open)library.showModal();renderLibrary()}
function decorate(){
 for(const row of $('tree').querySelectorAll('.tree-row[data-page-id]')){
  const n=find(treeData,row.dataset.pageId)?.node;if(n?.kind!=='page')continue;
  let b=row.querySelector('.page-state-menu');if(!b){b=button('⋯',()=>showMenu(n.id,b));b.className='page-state-menu';b.setAttribute('aria-label','Acțiuni pentru '+n.name);b.setAttribute('title','Arhivează sau șterge pagina');b.setAttribute('aria-haspopup','menu');row.insertBefore(b,row.lastElementChild)}b.hidden=!canManage();
 }
}
function sync(){const allowed=canManage();actions.hidden=!allowed||!selectedPage||!active(treeData,selectedPage);actions.disabled=busy;libraryButton.hidden=!allowed;decorate();if(!allowed){closeMenu();if(library.open)library.close()}}
doc.addEventListener('click',e=>{if(!menu.contains(e.target)&&!e.target.closest('#campusPageActions,.page-state-menu'))closeMenu()});
doc.addEventListener('keydown',e=>{if(!menu.hidden){if(e.key==='Escape'){e.preventDefault();closeMenu();actions.focus()}else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const buttons=[...menu.querySelectorAll('button')],i=buttons.indexOf(doc.activeElement);buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus()}}});
addEventListener('resize',closeMenu);$('paper').addEventListener('scroll',closeMenu,{passive:true});
new MutationObserver(()=>{decorate();if(library.open)renderLibrary()}).observe($('tree'),{childList:true});
new MutationObserver(sync).observe($('cfSaved'),{childList:true});
const baseOpen=openPage;openPage=function(id){if(!active(treeData,id)){E.notice('Pagina este în Arhivă sau Coș. Restaureaz-o pentru a o deschide.');return}baseOpen(id);$('note').contentEditable=String(!doc.body.classList.contains('campus-readonly'));sync()};
root.CampusPageLifecycle={canOpen:id=>active(treeData,id),reconcile,refresh:sync,openLibrary};
renderTree();if(!root.CampusCloudStorage?.active)reconcile();sync();
})(typeof window==='undefined'?globalThis:window);

