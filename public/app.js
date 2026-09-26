import {STORAGE_KEY,MAX_QUANTITY,cleanItems,total,readBag} from './cart-model.mjs';
const $=(s,root=document)=>root.querySelector(s), $$=(s,root=document)=>[...root.querySelectorAll(s)];
const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n/100);
const arrow='<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M4 12h15M13 5l7 7-7 7"/></svg>';
const smallIcon=kind=>`<svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 12h14${kind==='plus'?'M12 5v14':''}"/></svg>`;
let lastTrigger=null,toastTimer;
function announce(text){const el=$('#toast');el.textContent=text;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3500);}
function openDialog(id,trigger){const dialog=document.getElementById(id);if(!dialog)return;lastTrigger=trigger||document.activeElement;dialog.showModal();if(id==='search-dialog')$('#search-field').focus();}
$$('[data-open]').forEach(el=>el.addEventListener('click',()=>openDialog(el.dataset.open,el)));
$$('[data-search-open]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();openDialog('search-dialog',el);}));
$$('dialog').forEach(dialog=>{dialog.addEventListener('click',e=>{if(e.target.closest('[data-close]'))dialog.close();if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});dialog.addEventListener('close',()=>{if(lastTrigger?.isConnected)lastTrigger.focus();});});
$$('[data-auto-submit]').forEach(el=>el.addEventListener('change',()=>el.form.requestSubmit()));
// Recolour cards without changing product structure; links remain a no-JS fallback.
$$('.product-card').forEach(card=>$$('[data-colour]',card).forEach(link=>link.addEventListener('click',e=>{
 e.preventDefault();const id=card.dataset.product,c=link.dataset.colour;
 $$('[data-colour]',card).forEach(s=>{s.classList.toggle('selected',s===link);s.removeAttribute('aria-current');});link.setAttribute('aria-current','true');
 const imgs=$$('.product-image',card);imgs[0].src=`/media/${id}/${c}/front.svg`;imgs[0].alt=link.getAttribute('aria-label')+', front design study';imgs[1].src=`/media/${id}/${c}/back.svg`;imgs[1].alt=link.getAttribute('aria-label')+', back design study';
 $('.product-image-link',card).href=link.href;$('h3 a',card).href=link.href;
})));
document.documentElement.classList.add('js-ready');
async function initCommerce(){
 const response=await fetch('/api/catalog',{credentials:'same-origin'});if(!response.ok)throw new Error('Catalog unavailable');
 const catalog=await response.json();
 let storage=null;try{storage=window.localStorage;}catch{}
 let items=readBag(storage,catalog),selectionSize='',view='front';
 const detail=$('[data-product-detail]');
 const product=detail?catalog.products.find(p=>p.id===detail.dataset.productDetail):null;
 let colour=detail?.dataset.currentColour;
 function save(){items=cleanItems(items,catalog);if(!storage)announce('Browser storage is unavailable. Your selection is temporary.');try{storage?.setItem(STORAGE_KEY,JSON.stringify({version:1,items}));}catch{announce('Browser storage is unavailable. Your selection is temporary.');}renderCart();}
 function renderCart(){
  const count=items.reduce((s,i)=>s+i.quantity,0);$$('[data-bag-count]').forEach(el=>el.textContent=String(count));
  const contents=items.length?`${items.map((item,index)=>{const p=catalog.products.find(p=>p.id===item.product);return `<article class="cart-item"><a href="/products/${p.id}?colour=${item.colour}" class="cart-item-image"><img src="/media/${p.id}/${item.colour}/front.svg" alt="${escapeHtml(p.name)} in ${escapeHtml(catalog.colours[item.colour].name)}" width="78" height="99"></a><div><h3><a href="/products/${p.id}?colour=${item.colour}">${escapeHtml(p.name)}</a></h3><p>${escapeHtml(catalog.colours[item.colour].name)} / ${escapeHtml(item.size)}</p><div class="quantity-row"><div class="quantity-controls"><button data-quantity="${index}" data-delta="-1" aria-label="Decrease ${escapeHtml(p.name)} quantity" ${item.quantity===1?'disabled':''}>${smallIcon('minus')}</button><span aria-label="Quantity">${item.quantity}</span><button data-quantity="${index}" data-delta="1" aria-label="Increase ${escapeHtml(p.name)} quantity" ${item.quantity===MAX_QUANTITY?'disabled':''}>${smallIcon('plus')}</button></div><button class="remove-item" data-remove="${index}" aria-label="Remove ${escapeHtml(p.name)} in ${escapeHtml(catalog.colours[item.colour].name)}, size ${escapeHtml(item.size)}">Remove</button></div></div><span class="cart-item-price">${money(p.price*item.quantity)}</span></article>`;}).join('')}<div class="cart-summary"><div class="cart-total"><span>Illustrative subtotal</span><strong>${money(total(items,catalog))}</strong></div><p>Indicative prices only. Final pricing, taxes, delivery and availability are not yet confirmed.</p><button class="button checkout-disabled" type="button" disabled>Checkout opens after sample approval</button><a class="text-link" href="/help/preview">About this preview ${arrow}</a></div>`:`<div class="empty-bag"><h3>A little room<br>for possibility.</h3><p>Your bag is empty. Explore the first collection and make a preview selection.</p><a href="/collection" class="button">Explore the collection ${arrow}</a></div>`;
  $$('[data-cart-content]').forEach(el=>{el.innerHTML=contents;$$('[data-remove]',el).forEach(btn=>btn.addEventListener('click',()=>{items.splice(Number(btn.dataset.remove),1);save();announce('Piece removed from your preview bag.');}));$$('[data-quantity]',el).forEach(btn=>btn.addEventListener('click',()=>{const i=Number(btn.dataset.quantity);const item=items[i];if(item)item.quantity=Math.max(1,Math.min(MAX_QUANTITY,item.quantity+Number(btn.dataset.delta)));save();}));});
 }
 renderCart();
 $$('[data-bag-open]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();renderCart();openDialog('bag-dialog',el);}));
 window.addEventListener('storage',ev=>{if(ev.key===STORAGE_KEY||ev.key===null){items=readBag(storage,catalog);renderCart();}});
 if(!detail||!product)return;
 const views=['front','back','detail'];
 function updateImages(){const img=$('.main-product-image',detail);img.src=`/media/${product.id}/${colour}/${view}.svg`;img.alt=`${product.name} in ${catalog.colours[colour].name}, ${view} concept illustration`;
 $('.gallery-view-label',detail).textContent=view==='detail'?'Signature study':`${view[0].toUpperCase()+view.slice(1)} view`;
 $$('[data-view]',detail).forEach(btn=>{const active=btn.dataset.view===view;btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active));$('img',btn).src=`/media/${product.id}/${colour}/${btn.dataset.view}.svg`;});}
 $$('[data-view]',detail).forEach(btn=>btn.addEventListener('click',()=>{view=btn.dataset.view;updateImages();}));
 $('[data-gallery-next]',detail).addEventListener('click',()=>{view=views[(views.indexOf(view)+1)%views.length];updateImages();});
 $$('[data-colour]',detail).forEach(link=>link.addEventListener('click',e=>{e.preventDefault();colour=link.dataset.colour;detail.dataset.currentColour=colour;$$('[data-colour]',detail).forEach(s=>{s.classList.toggle('selected',s===link);s.removeAttribute('aria-current');});link.setAttribute('aria-current','true');$('[data-colour-label]',detail).textContent=catalog.colours[colour].name;history.replaceState(null,'',link.href);updateImages();}));
 $$('[data-size]',detail).forEach(btn=>btn.addEventListener('click',()=>{selectionSize=btn.dataset.size;$$('[data-size]',detail).forEach(s=>{s.classList.toggle('selected',s===btn);s.setAttribute('aria-pressed',String(s===btn));});$('[data-size-label]',detail).textContent=selectionSize;$('#size-error').hidden=true;}));
 $('[data-add-product]',detail).addEventListener('click',e=>{
  if(!selectionSize){$('#size-error').hidden=false;$('[data-size]',detail).focus();return;}
  const existing=items.find(i=>i.product===product.id&&i.colour===colour&&i.size===selectionSize);
  if(existing){if(existing.quantity>=MAX_QUANTITY){announce(`The preview limit is ${MAX_QUANTITY} per size and colour.`);return;}existing.quantity++;}else items.push({product:product.id,colour,size:selectionSize,quantity:1});
  save();openDialog('bag-dialog',e.currentTarget);
 });
}
initCommerce().catch(()=>{console.warn('KHAGA preview: catalogue could not load.');$$('[data-add-product]').forEach(btn=>btn.addEventListener('click',()=>announce('The preview bag is temporarily unavailable. Please reload.')));});
