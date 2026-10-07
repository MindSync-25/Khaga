/* Browser entry. scripts/build-client.mjs bundles this with shared catalogue,
   cart and page templates into ONE deferred script. No API bootstrap required. */
const $=(s,root=document)=>root.querySelector(s);
const $$=(s,root=document)=>Array.from(root.querySelectorAll(s));


const pageSelections=new Map();
const preloadCache=new Map();
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
let currentURL=new URL(document.baseURI),toastTimer,preloadTimer,scrollTick;
let storage=null;
try{storage=window.localStorage;}catch{}
let items=readBag(storage,catalog);
function announce(message){
 const toast=$('#toast'); if(!toast)return;
 toast.textContent=message;toast.classList.add('visible');clearTimeout(toastTimer);
 toastTimer=setTimeout(()=>toast.classList.remove('visible'),3800);
}
const dialogTriggers=new WeakMap();
function openDialog(id,trigger){
 const dialog=document.getElementById(id);if(!dialog||dialog.open)return;
 dialogTriggers.set(dialog,trigger||document.activeElement);dialog.showModal();
 if(id==='search-dialog')$('#search-field')?.focus();
}
function closeDialogs(){ $$('dialog[open]').forEach(d=>d.close()); }
$$('dialog').forEach(dialog=>dialog.addEventListener('close',()=>{
 const trigger=dialogTriggers.get(dialog);if(trigger?.isConnected)trigger.focus({preventScroll:true});
}));
function productState(){
 const root=$('[data-product-detail]');if(!root)return null;
 const p=byId.get(root.dataset.productDetail);if(!p)return null;
 const c=variant(p,root.dataset.currentColour);
 const key=p.id+'|'+c;
 if(!pageSelections.has(key))pageSelections.set(key,{size:'',view:root.dataset.initialView||galleryViews(p,c)[0]});
 return {root,p,c,state:pageSelections.get(key)};
}
function rememberScroll(){
 try{history.replaceState({...history.state,khaga:true,url:currentURL.href,y:window.scrollY},'',currentURL.href);}catch{}
}
function updateURL(url,replace=false){
 if(replace)history.replaceState({...history.state,khaga:true,url:url.href,y:window.scrollY},'',url.href);
 else history.pushState({khaga:true,url:url.href,y:0},'',url.href);
 currentURL=url;
}
function syncNavigation(){
 $$('.desktop-nav a, .story-nav').forEach(a=>{
  const u=new URL(a.href,document.baseURI);
  const active=u.pathname===currentURL.pathname&&u.searchParams.get('category')===currentURL.searchParams.get('category');
  if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
 });
}
function routeTo(url,{push=true,preserveScroll=false,y=0}={}){
 if(url.origin!==new URL(document.baseURI).origin)return false;
 const html=renderRoute(url);if(!html)return false;
 const parsed=new DOMParser().parseFromString(html,'text/html');
 const next=parsed.getElementById('main');if(!next)return false;
 const previousY=window.scrollY;
 if(push)rememberScroll();
 closeDialogs();
 const main=$('#main');
 main.innerHTML=next.innerHTML;
 document.title=parsed.title;
 document.body.dataset.page=parsed.body.dataset.page;
 for(const key of ['description','og:title','og:description']){
  const attr=key.startsWith('og:')?'property':'name';
  const source=parsed.querySelector(`meta[${attr}="${key}"]`);
  const target=document.querySelector(`meta[${attr}="${key}"]`);
  if(source&&target)target.content=source.content;
 }
 if(push)updateURL(url);else currentURL=url;
 syncNavigation();renderCart();syncProduct();schedulePreload();refreshCatalogue();
 main.focus({preventScroll:true});
 window.scrollTo({top:preserveScroll?previousY:y,behavior:'instant'});
 if(url.hash){try{document.getElementById(decodeURIComponent(url.hash.slice(1)))?.scrollIntoView({behavior:'instant'});}catch{}}
 rememberScroll();
 $('#route-status').textContent=document.title;
 if(!reducedMotion.matches&&main.animate)main.animate([{opacity:.55,transform:'translateY(5px)'},{opacity:1,transform:'none'}],{duration:160,easing:'ease-out'});
 return true;
}
function safeRoute(url,options){
 try{return routeTo(url,options);}catch(error){console.error('KHAGA navigation failed:',error);announce('This view could not open. Try again or use a normal page refresh.');return false;}
}
window.addEventListener('popstate',event=>{
 const url=new URL(event.state?.url||location.href,document.baseURI);
 if(!safeRoute(url,{push:false,y:event.state?.y||0}))location.assign(url.href);
});
try{history.scrollRestoration='manual';rememberScroll();}catch{}
window.addEventListener('scroll',()=>{if(scrollTick)return;scrollTick=requestAnimationFrame(()=>{scrollTick=null;rememberScroll();});},{passive:true});
function prewarm(src){
 if(preloadCache.has(src)||navigator.connection?.saveData)return;
 const img=new Image();img.decoding='async';img.src=src;preloadCache.set(src,img);
 if(preloadCache.size>24)preloadCache.delete(preloadCache.keys().next().value);
}
function schedulePreload(){
 clearTimeout(preloadTimer);preloadTimer=setTimeout(()=>{
  const s=productState();if(!s)return;
  for(const view of ['back','detail'])prewarm(media(s.p,s.c,view));
  for(const c of s.p.colours.slice(0,4))prewarm(media(s.p,c));
 },180);
}
function syncProduct(){
 const s=productState();if(!s)return;
 const {root,p,c,state}=s;
 if(!galleryViews(p,c).includes(state.view))state.view=galleryViews(p,c)[0];
 if(state.size&&!(p.sizes||sizes).includes(state.size))state.size='';
 const img=$('.main-product-image',root),src=media(p,c,state.view);
 if(img.getAttribute('src')!==src)img.src=src;
 img.alt=p.media?.[c]?.[state.view]?.alt||`${p.name} in ${colours[c].name}, ${state.view} concept illustration`;
 const rail=$('.gallery-thumbnails',root);
 if(rail.dataset.views!==galleryViews(p,c).join('|')){rail.dataset.views=galleryViews(p,c).join('|');rail.innerHTML=galleryViews(p,c).map(v=>`<button type="button" class="thumbnail" data-view="${v}" aria-label="Show ${v} view"><img src="${media(p,c,v)}" alt="${e(v)} view" width="80" height="100"><span>${e(v)}</span></button>`).join('');}
 $('.gallery-view-label',root).textContent=state.view==='detail'?'Signature study':state.view==='back'?'Back view':'Front view';
 $('[data-colour-label]',root).textContent=colours[c].name;
 $$('[data-colour]',root).forEach(a=>{const active=a.dataset.colour===c;a.classList.toggle('selected',active);if(active)a.setAttribute('aria-current','true');else a.removeAttribute('aria-current');});
 $$('[data-view]',root).forEach(button=>{
  const active=button.dataset.view===state.view;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
  const thumb=$('img',button),url=media(p,c,button.dataset.view);if(thumb.getAttribute('src')!==url)thumb.src=url;
  thumb.alt=p.media?.[c]?.[button.dataset.view]?.alt||`${p.name} in ${colours[c].name}, ${button.dataset.view} study`;
 });
 $$('[data-size]',root).forEach(button=>{const active=button.dataset.size===state.size;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));});
 $('[data-size-label]',root).textContent=state.size||'Select your size';
}
function selectColour(control){
 const cardRoot=control.closest('.product-card');
 if(cardRoot){
  const p=byId.get(cardRoot.dataset.product),c=control.dataset.colour;if(!p?.colours.includes(c))return;
  $$('[data-colour]',cardRoot).forEach(a=>{a.classList.toggle('selected',a===control);a.removeAttribute('aria-current');});control.setAttribute('aria-current','true');
  const images=$$('.product-image',cardRoot);images.forEach((img,i)=>{img.src=media(p,c,i?'back':'front');img.alt=`${p.name} in ${colours[c].name}, ${i?'back':'front'} concept`;});
  $('.product-image-link',cardRoot).href=control.href;$('h3 a',cardRoot).href=control.href;
  announce(`${p.name} — ${colours[c].name}`);return;
 }
 const s=productState();if(!s||!s.p.colours.includes(control.dataset.colour))return;
 const c=control.dataset.colour;s.root.dataset.currentColour=c;
 pageSelections.set(s.p.id+'|'+c,{...s.state});
 const url=new URL(currentURL);url.searchParams.set('colour',c);updateURL(url,true);
 syncProduct();schedulePreload();announce(colours[c].name);
}
function saveBag(){
 items=cleanItems(items,catalog);
 try{if(!storage)throw new Error('Unavailable storage');storage.setItem(STORAGE_KEY,JSON.stringify({version:1,items}));}
 catch{announce('Your bag is saved for this visit only; browser storage is unavailable.');}
 renderCart();
}
function renderCart(){
 const count=items.reduce((n,i)=>n+i.quantity,0);$$('[data-bag-count]').forEach(el=>el.textContent=String(count));
 const markup=items.length?items.map((item,index)=>{
  const p=byId.get(item.product);
  return `<article class="cart-item"><a href="/products/${p.id}?colour=${item.colour}" class="cart-item-image"><img src="${media(p,item.colour)}" alt="${e(p.name)} in ${e(colours[item.colour].name)}" width="78" height="99"></a><div><h3><a href="/products/${p.id}?colour=${item.colour}">${e(p.name)}</a></h3><p>${e(colours[item.colour].name)} / ${e(item.size)}</p><div class="quantity-row"><div class="quantity-controls"><button type="button" data-quantity="${index}" data-delta="-1" aria-label="Decrease ${e(p.name)} quantity" ${item.quantity===1?'disabled':''}>${icon('minus')}</button><span aria-label="Quantity">${item.quantity}</span><button type="button" data-quantity="${index}" data-delta="1" aria-label="Increase ${e(p.name)} quantity" ${item.quantity===MAX_QUANTITY?'disabled':''}>${icon('plus')}</button></div><button type="button" class="remove-item" data-remove="${index}" aria-label="Remove ${e(p.name)} in ${e(colours[item.colour].name)}, size ${e(item.size)}">Remove</button></div></div><span class="cart-item-price">${money(p.price*item.quantity)}</span></article>`;
 }).join('')+`<div class="cart-summary"><div class="cart-total"><span>${catalog.checkout?'Subtotal':'Illustrative subtotal'}</span><strong>${money(total(items,catalog))}</strong></div><p>${catalog.checkout?'Shipping, taxes and availability are confirmed at checkout.':'Indicative prices only. Final pricing, delivery and availability await confirmation.'}</p><button class="button checkout-disabled" type="button" disabled>Checkout is not open yet</button><a class="text-link" href="/help/preview">About this preview ${icon('arrow')}</a></div>`:`<div class="empty-bag"><h3>Your next<br>expression.</h3><p>Explore the first collection and make a preview selection.</p><a href="/collection" class="button">Explore the collection ${icon('arrow')}</a></div>`;
 $$('[data-cart-content]').forEach(el=>el.innerHTML=markup);
}
window.addEventListener('storage',event=>{if(event.key===STORAGE_KEY||event.key===null){items=readBag(storage,catalog);renderCart();}});
function addProduct(trigger){
 const s=productState();if(!s)return;
 if(!s.state.size){$('#size-error',s.root).hidden=false;$('[data-size]',s.root).focus();announce('Choose a size first.');return;}
 const existing=items.find(i=>i.product===s.p.id&&i.colour===s.c&&i.size===s.state.size);
 if(existing){if(existing.quantity>=MAX_QUANTITY){announce(`The preview limit is ${MAX_QUANTITY} for this size and colour.`);return;}existing.quantity++;}
 else items.push({product:s.p.id,colour:s.c,size:s.state.size,quantity:1});
 saveBag();openDialog('bag-dialog',trigger);
}
// One delegated listener survives all route changes. No duplicate handlers or stale nodes.
document.addEventListener('click',event=>{
 if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
 const target=event.target instanceof Element?event.target:null;if(!target)return;
 try{
  const close=target.closest('[data-close]');if(close){event.preventDefault();close.closest('dialog')?.close();return;}
  if(target instanceof HTMLDialogElement&&target.open){const r=target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)target.close();return;}
  const open=target.closest('[data-open]');if(open){event.preventDefault();openDialog(open.dataset.open,open);return;}
  const search=target.closest('[data-search-open]');if(search){event.preventDefault();openDialog('search-dialog',search);return;}
  const bag=target.closest('[data-bag-open]');if(bag){event.preventDefault();renderCart();openDialog('bag-dialog',bag);return;}
  const c=target.closest('[data-colour]');if(c){event.preventDefault();selectColour(c);return;}
  const cardToggle=target.closest('[data-card-view]');if(cardToggle){event.preventDefault();const root=cardToggle.closest('.product-card');const on=root.classList.toggle('show-back');cardToggle.textContent=on?'Front view':'Back view';cardToggle.setAttribute('aria-pressed',String(on));cardToggle.setAttribute('aria-label',`Show ${on?'front':'back'} of ${byId.get(root.dataset.product).name}`);return;}
  const size=target.closest('[data-size]');if(size){event.preventDefault();const s=productState();if(s&&(s.p.sizes||sizes).includes(size.dataset.size)){s.state.size=size.dataset.size;$('#size-error',s.root).hidden=true;syncProduct();}return;}
  const gallery=target.closest('[data-view],[data-gallery-next]');if(gallery){event.preventDefault();const s=productState();if(s){s.state.view=gallery.dataset.view||galleryViews(s.p,s.c)[(galleryViews(s.p,s.c).indexOf(s.state.view)+1)%galleryViews(s.p,s.c).length];syncProduct();}return;}
  const zoom=target.closest('[data-zoom]');if(zoom){const s=productState();if(s){const img=$('[data-zoom-image]');img.src=media(s.p,s.c,s.state.view);img.alt=`${s.p.name} — ${colours[s.c].name}, ${s.state.view} study`;$('[data-zoom-caption]').textContent=img.alt;openDialog('zoom-dialog',zoom);}return;}
  const add=target.closest('[data-add-product]');if(add){event.preventDefault();addProduct(add);return;}
  const quantity=target.closest('[data-quantity]');if(quantity){event.preventDefault();const i=Number(quantity.dataset.quantity),delta=Number(quantity.dataset.delta),item=items[i];if(item&&[-1,1].includes(delta)){item.quantity=Math.max(1,Math.min(MAX_QUANTITY,item.quantity+delta));const dialog=quantity.closest('dialog');saveBag();const root=dialog||$('#main');$(`[data-quantity="${i}"][data-delta="${delta}"]:not(:disabled)`,root)?.focus({preventScroll:true});}return;}
  const remove=target.closest('[data-remove]');if(remove){event.preventDefault();const i=Number(remove.dataset.remove);if(Number.isInteger(i)&&items[i]){items.splice(i,1);saveBag();announce('Removed from your preview bag.');$('#bag-dialog[open] [data-close]')?.focus({preventScroll:true});}return;}
  const retry=target.closest('[data-retry-image]');if(retry){const gallery=$('.gallery-main');$$('img',gallery).forEach(img=>{const u=new URL(img.src,document.baseURI);u.searchParams.set('retry',Date.now());img.src=u.href;});retry.remove();return;}
  const anchor=target.closest('a[href]');if(!anchor||anchor.hasAttribute('download')||(anchor.target&&anchor.target!=='_self'))return;
  const url=new URL(anchor.href,document.baseURI);
  if(url.origin!==new URL(document.baseURI).origin||!['https:','http:'].includes(url.protocol))return;
  if(url.pathname===currentURL.pathname&&url.search===currentURL.search&&url.hash){const dest=document.getElementById(decodeURIComponent(url.hash.slice(1)));if(dest){event.preventDefault();rememberScroll();updateURL(url);dest.scrollIntoView({behavior:reducedMotion.matches?'instant':'smooth'});}return;}
  if(renderRoute(url)!==null){event.preventDefault();safeRoute(url,{preserveScroll:!!anchor.closest('.filter-tabs')});}
 }catch(error){event.preventDefault();console.error('KHAGA interaction failed:',error);announce('That action could not complete. Please try again.');}
});
document.addEventListener('submit',event=>{
 const form=event.target;if(!(form instanceof HTMLFormElement)||form.method.toLowerCase()!=='get')return;
 const url=new URL(form.action,document.baseURI);if(url.origin!==new URL(document.baseURI).origin||!['/search','/collection'].includes(url.pathname))return;
 event.preventDefault();url.search=new URLSearchParams(new FormData(form)).toString();safeRoute(url,{preserveScroll:form.classList.contains('sort-form')});
});
document.addEventListener('change',event=>{if(event.target.matches('[data-auto-submit]'))event.target.form.requestSubmit();});
// Prewarm only likely image variants; navigation and catalogue filtering need no fetch.
for(const type of ['pointerover','focusin'])document.addEventListener(type,event=>{
 const c=event.target.closest?.('[data-colour]');if(!c)return;
 const p=byId.get(c.closest('.product-card')?.dataset.product||productState()?.p.id);
 if(p&&p.colours.includes(c.dataset.colour))prewarm(media(p,c.dataset.colour));
});
document.addEventListener('error',event=>{
 if(!(event.target instanceof HTMLImageElement)||!event.target.classList.contains('main-product-image'))return;
 const gallery=event.target.closest('.gallery-main');if(!gallery||$('[data-retry-image]',gallery))return;
 const button=document.createElement('button');button.type='button';button.className='media-retry';button.dataset.retryImage='';button.textContent='Image unavailable — retry';gallery.append(button);
},true);
document.addEventListener('load',event=>{if(event.target instanceof HTMLImageElement&&event.target.classList.contains('main-product-image'))event.target.closest('.gallery-main')?.querySelector('[data-retry-image]')?.remove();},true);

let lastCatalogueCheck=Date.now(),catalogueRefresh=null;
async function refreshCatalogue(force=false){
 if(!catalog.managed||catalogueRefresh||(!force&&Date.now()-lastCatalogueCheck<30000))return;
 lastCatalogueCheck=Date.now();
 catalogueRefresh=(async()=>{
  try{const response=await fetch('/api/catalog',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(8000)});if(!response.ok)return;
   const next=await response.json();if(next.version===catalog.version)return;
   catalog.replace(next);items=cleanItems(items,catalog);preloadCache.clear();
   const url=new URL(currentURL);safeRoute(url,{push:false,preserveScroll:true});announce('The collection has been updated.');
  }catch{/* Keep the current published snapshot on a transient refresh failure. */}
  finally{catalogueRefresh=null;}
 })();return catalogueRefresh;
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshCatalogue();});
window.addEventListener('focus',()=>refreshCatalogue());

renderCart();syncProduct();syncNavigation();schedulePreload();
document.documentElement.classList.add('js-ready');
document.documentElement.dataset.khagaReady=UI_BUILD;
