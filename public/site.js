/* KHAGA 0.4.0 — generated browser script */
(()=>{'use strict';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = (name, cls='') => {
 const paths={arrow:'<path d="M4 12h15M13 5l7 7-7 7"/>',diagonal:'<path d="M6 18 18 6M6 6h12v12"/>',bag:'<path d="M5 7h14l1 14H4L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',menu:'<path d="M3 8h18M3 16h18"/>',close:'<path d="m5 5 14 14M19 5 5 19"/>',plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',check:'<path d="m5 12 4 4L19 6"/>',chevron:'<path d="m5 9 7 7 7-7"/>',ruler:'<path d="M3 7h18v10H3zM7 7v5M11 7v3M15 7v5M19 7v3"/>'};
 return `<svg class="icon ${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.arrow}</svg>`;
};


// Browser-safe factory. No unpublished catalogue, credentials or provider code.
function createCatalog(snapshot) {
 const products=structuredClone(snapshot.products||[]),colours=structuredClone(snapshot.colours||{}),sizes=[...(snapshot.sizes||[])];
 const byId=new Map(products.map(p=>[p.id,p]));
 const money=amount=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:amount%100?2:0,maximumFractionDigits:2}).format(amount/100);
 const variant=(p,c)=>p.colours.includes(c)?c:p.colours[0];
 const filterProducts=({category='all',q='',sort='collection'}={})=>{
  const query=String(q).trim().toLowerCase().slice(0,100);
  const result=products.filter(p=>(category==='all'||p.category===category)&&(!query||[p.name,p.note,...p.colours.map(c=>colours[c]?.name||c)].join(' ').toLowerCase().includes(query)));
  if(sort==='price-asc')result.sort((a,b)=>a.price-b.price);if(sort==='price-desc')result.sort((a,b)=>b.price-a.price);return result;
 };
 const catalog={version:snapshot.version||'seed',managed:!!snapshot.managed,preview:true,checkout:snapshot.checkout||null,products,colours,sizes,byId,money,variant,filterProducts};
 catalog.replace=next=>{products.splice(0,products.length,...structuredClone(next.products));for(const c of Object.keys(colours))delete colours[c];Object.assign(colours,structuredClone(next.colours));sizes.splice(0,sizes.length,...next.sizes);byId.clear();for(const p of products)byId.set(p.id,p);catalog.version=next.version;catalog.managed=!!next.managed;};
 catalog.snapshot=()=>({version:catalog.version,managed:catalog.managed,preview:true,...(catalog.checkout?{checkout:catalog.checkout}:{}),products,colours,sizes});
 return catalog;
}


function createViews(catalog) {
const {products,colours,sizes,byId,money,variant,filterProducts}=catalog;
const UI_BUILD='0.4.0';
const media=(p,c,v='front')=>p.media?.[c]?.[v]?.url||`/media/${p.id}/${c}/${v==='model'?'front':v}.svg`;
const galleryViews=(p,c)=>{const order=p.galleryOrder?.[c]||[];return [...new Set([...order,'front','back','detail'])].filter(v=>v!=='model'||p.media?.[c]?.model);};
const categoryImages=category=>products.filter(p=>p.category===category).slice(0,2).map(p=>image(media(p,p.colours[0]),p.name+' — '+colours[p.colours[0]].name)).join('');
const image=(src,alt,cls='',priority=false)=>`<img src="${src}" alt="${e(alt)}" class="${cls}" width="600" height="760" ${priority?'fetchpriority="high"':'loading="lazy"'} decoding="async">`;
const cta=(href,text,light=false)=>`<a class="button ${light?'button-light':''}" href="${href}">${text}${icon('arrow')}</a>`;
const swatches=(p,c,context='card')=>`<div class="swatches ${context==='product'?'swatches-large':''}" aria-label="${e(p.name)} colours">${p.colours.map(key=>`<a href="/products/${p.id}?colour=${key}" class="swatch ${key===c?'selected':''}" style="--swatch:${colours[key].hex}" data-colour="${key}" data-context="${context}" aria-label="${e(p.name)} in ${e(colours[key].name)}" ${c===key?'aria-current="true"':''} title="${e(colours[key].name)}"><span></span></a>`).join('')}</div>`;
function card(p,i=0){const c=p.colours[0];return `<article class="product-card" data-product="${p.id}"><a class="product-image-link" href="/products/${p.id}" aria-label="Explore ${e(p.name)}">${image(media(p,c),`${p.name} in ${colours[c].name}, front design study`,'product-image')}${image(media(p,c,'back'),`${p.name}, back design study`,'product-image product-image-back')}<span class="product-number">${p.number} / ASCENT</span><span class="image-action">Discover ${icon('diagonal')}</span></a><button type="button" class="card-view-toggle" data-card-view aria-pressed="false" aria-label="Show back of ${e(p.name)}">Back view</button><div class="product-meta"><div><h3><a href="/products/${p.id}">${e(p.name)}</a></h3><p>${e(p.note)}</p></div><span class="price">${money(p.price)}<sup>*</sup></span></div>${swatches(p,c)}</article>`;}
function commerceCopy(html){
 if(!catalog.checkout)return html;
 return html.replaceAll('Design preview · Orders not open','Review your selection at checkout')
  .replaceAll('Explore the preview—orders are not open yet.','Explore the collection and review availability at checkout.')
  .replaceAll('Add to preview bag','Add to bag').replaceAll('The preview bag.','Your bag.')
  .replaceAll('Preview only. Checkout disabled. No payment or stock reservation.','Review availability, delivery details and your total at checkout.')
  .replaceAll('Your preview selection. No orders or payments are taken.','Your selection. Review your total before payment.')
  .replaceAll('No orders or payments are taken. This bag is saved only in your browser.','Your selection is saved in this browser. Review your total before payment.');
}
function shell(title,body,{page='',description='KHAGA Collection 001 — Ascent. Explore seven clothing concepts inspired by flight, light and a higher perspective.'}={}){
 return commerceCopy(`<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)} | KHAGA</title><meta name="description" content="${e(description)}"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#f5f2ec"><meta property="og:title" content="${e(title)} | KHAGA"><meta property="og:description" content="Collection 001 — Ascent. Design preview; orders are not open."><link rel="icon" href="/brand/emblem.svg" type="image/svg+xml"><meta name="khaga-build" content="${UI_BUILD}"><link rel="stylesheet" href="/styles.css?v=${UI_BUILD}"><link rel="stylesheet" href="/editorial.css?v=${UI_BUILD}"><script defer src="/site.js?v=${UI_BUILD}"></script></head><body data-page="${page}"><template id="catalogue-data">${e(JSON.stringify(catalog.snapshot()))}</template><a href="#main" class="skip-link">Skip to content</a><div class="preview-bar"><span>COLLECTION 001 — A FIRST LOOK</span><a href="/help/preview">Design preview · Orders not open ${icon('diagonal')}</a></div><header class="site-header"><nav class="desktop-nav" aria-label="Main navigation"><a href="/collection" ${page==='collection'?'aria-current="page"':''}>Collection</a><a href="/collection?category=tees">T-Shirts</a><a href="/collection?category=shirts">Shirts</a></nav><button class="icon-button mobile-menu-toggle" data-open="menu-dialog" aria-label="Open navigation">${icon('menu')}</button><a href="/" class="brand" aria-label="KHAGA home"><img src="/brand/wordmark.svg" width="182" height="33" alt="KHAGA"></a><nav class="header-actions" aria-label="Store navigation"><a class="story-nav" href="/story">Our story</a><a href="/search" class="icon-button" data-search-open aria-label="Search collection">${icon('search')}</a><a href="/bag" class="bag-button" data-bag-open aria-label="Open shopping bag">${icon('bag')}<span class="bag-label">Bag</span><span data-bag-count class="bag-count">0</span></a></nav></header><main id="main" tabindex="-1">${body}</main>${footer()}${dialogs()}<dialog id="zoom-dialog" class="zoom-dialog" aria-label="Enlarged product view"><button type="button" class="icon-button zoom-close" data-close aria-label="Close enlarged view">${icon('close')}</button><img data-zoom-image alt=""><p data-zoom-caption>Design study</p></dialog><p id="route-status" class="sr-only" role="status" aria-live="polite"></p><div class="toast" id="toast" role="status" aria-live="polite"></div><noscript><p class="noscript-note">You can browse without JavaScript. Enable JavaScript to try the preview shopping bag and interactive colour selection.</p></noscript></body></html>`);
}
function footer(){return `<footer class="site-footer"><div class="footer-top"><div class="footer-intro"><img src="/brand/emblem.svg" alt="" class="footer-emblem" width="56" height="45"><p>Clothing for a<br>higher tomorrow.</p><span>Flight. Light. A different perspective.</span></div><div><h2>Explore</h2><a href="/collection">Collection 001</a><a href="/collection?category=tees">T-Shirts</a><a href="/collection?category=shirts">Shirts</a><a href="/story">Our story</a></div><div><h2>Good to know</h2><a href="/help/sizing">Fit & sizing</a><a href="/help/delivery">Delivery & returns</a><a href="/help/care">Garment care</a><a href="/help/preview">About this preview</a></div><div class="footer-note"><h2>Before the first flight</h2><p>Our first collection is taking shape. These are design studies, not final production photographs.</p><a class="text-link" href="/help/preview">What happens next ${icon('arrow')}</a></div></div><img class="footer-wordmark" src="/brand/wordmark.svg" alt="KHAGA" width="1160" height="209" loading="lazy"><div class="footer-bottom"><span>© ${new Date().getUTCFullYear()} KHAGA</span><span>INR / India</span><div><a href="/help/privacy">Privacy</a><a href="/help/terms">Preview terms</a></div></div></footer>`;}
function dialogs(){return `<dialog id="menu-dialog" class="menu-dialog"><div class="dialog-top"><img src="/brand/wordmark.svg" width="144" height="26" alt="KHAGA"><button data-close class="icon-button" aria-label="Close navigation">${icon('close')}</button></div><nav aria-label="Mobile navigation"><a href="/collection">The collection ${icon('arrow')}</a><a href="/collection?category=tees">T-Shirts ${icon('arrow')}</a><a href="/collection?category=shirts">Shirts ${icon('arrow')}</a><a href="/story">Our story ${icon('arrow')}</a><a href="/help/preview">About this preview ${icon('arrow')}</a></nav><p class="eyebrow">COLLECTION 001 — ASCENT</p></dialog><dialog id="search-dialog" class="search-dialog"><div class="dialog-top"><span class="eyebrow">FIND YOUR EXPRESSION</span><button data-close class="icon-button" aria-label="Close search">${icon('close')}</button></div><form action="/search" class="search-form"><label for="search-field" class="sr-only">Search products or colours</label><input id="search-field" type="search" name="q" placeholder="Search products, colours, details…" maxlength="100" autofocus><button type="submit" class="icon-button" aria-label="Submit search">${icon('arrow')}</button></form><p class="search-hint">Try “Flight”, “shirt” or “navy”.</p><div class="search-suggestions">${products.slice(0,3).map(p=>`<a href="/products/${p.id}">${e(p.name)} ${icon('diagonal')}</a>`).join('')}</div></dialog><dialog id="bag-dialog" class="bag-dialog"><div class="dialog-top"><h2>Your bag <span data-bag-count>0</span></h2><button data-close class="icon-button" aria-label="Close shopping bag">${icon('close')}</button></div><p class="bag-notice">Your preview selection. No orders or payments are taken.</p><div data-cart-content class="cart-content"></div></dialog><dialog id="size-dialog" class="size-dialog"><div class="dialog-top"><h2>A note on fit</h2><button data-close class="icon-button" aria-label="Close size guide">${icon('close')}</button></div><p>The intended fits range from relaxed tees to a more structured Form Shirt and a softer Nocturne Shirt.</p><p><strong>Final garment measurements are awaiting sample approval.</strong> S–XXL are preview options only. We will publish measured chest width, shoulder width, length and sleeve length before orders open.</p><p>Please do not use these mockups to choose a final size or send production measurements to the supplier.</p><a href="/help/sizing" class="text-link">More about fit ${icon('arrow')}</a></dialog>`;}
function home(){return shell('Collection 001 — Ascent',`
<section class="editorial-hero" aria-labelledby="hero-title">
 <div class="editorial-hero-image"><img src="/assets/campaign.svg" alt="Ascent Tee campaign concept: a mountain contour and KHAGA signature" width="520" height="790" fetchpriority="high" decoding="async"></div>
 <div class="editorial-hero-copy"><p class="eyebrow">KHAGA / COLLECTION 001</p><h1 id="hero-title">ASCENT<span>A different altitude.</span></h1><p>Expressions of flight, light and form.<br>One unmistakable signature.</p><a class="editorial-cta" href="/collection">Discover the collection ${icon('arrow')}</a></div>
 <div class="editorial-hero-foot"><span>CHAPTER 01 — A FIRST LOOK</span>${byId.has('ascent-tee')?`<a href="/products/ascent-tee">The Ascent Tee ${icon('diagonal')}</a>`:`<a href="/collection">The collection ${icon('diagonal')}</a>`}<span class="campaign-disclosure">AI CONCEPT CAMPAIGN</span></div>
</section>
<section class="section selected-section" id="selected"><div class="section-heading"><div><p class="eyebrow">THE FIRST EDIT</p><h2>Make your presence.</h2></div><a class="text-link" href="/collection">Explore the collection ${icon('arrow')}</a></div><div class="product-grid home-grid">${products.filter(p=>['origin-tee','flight-tee','eclipse-tee','form-shirt'].includes(p.id)).concat(products.filter(p=>!['origin-tee','flight-tee','eclipse-tee','form-shirt'].includes(p.id))).slice(0,4).map(card).join('')}</div><p class="price-note">Design studies · Indicative prices · Final colours and specifications subject to sample approval.</p></section>
<section class="editorial-interlude"><p class="eyebrow">THE WORLD OF KHAGA</p><h2>Identity is in the details.<br><em>Not the noise.</em></h2><a href="/story" class="text-link">Our point of view ${icon('diagonal')}</a></section>
<section class="section categories"><div class="section-heading"><div><p class="eyebrow">FIND YOUR FORM</p><h2>Different expressions.<br>Same signature.</h2></div></div><div class="category-grid">
<a class="category-tile tee-tile" href="/collection?category=tees"><div class="category-visual">${categoryImages('tees')}</div><div class="category-caption"><div><p class="eyebrow">EVERYDAY EXPRESSION</p><h3>The T-shirts</h3></div><span class="circle-arrow">${icon('arrow')}</span></div></a>
<a class="category-tile shirt-tile" href="/collection?category=shirts"><div class="category-visual">${categoryImages('shirts')}</div><div class="category-caption"><div><p class="eyebrow">CONSIDERED FORM</p><h3>The shirts</h3></div><span class="circle-arrow">${icon('arrow')}</span></div></a>
</div></section>
<section class="signature-editorial"><div class="signature-editorial-symbol"><div class="signature-orbit"></div><img src="/brand/emblem.svg" width="340" height="267" alt="The original KHAGA Garuda and Sun emblem" loading="lazy"></div><div class="signature-editorial-copy"><p class="eyebrow">ONE SIGNATURE. EVERY EXPRESSION.</p><h2>Born of sky.<br><em>Rooted in possibility.</em></h2><p>Garuda and the sun meet in our signature. Around it, the collection explores movement, shadow and a different perspective.</p><a class="editorial-cta" href="/story">The story behind the mark ${icon('arrow')}</a></div></section>
<section class="closing-editorial"><span class="eyebrow">COLLECTION 001 / ASCENT</span><h2>The beginning of<br><em>something distinct.</em></h2><a href="/collection" class="text-link">Find your expression ${icon('arrow')}</a></section>`,{page:'home'});}

function collection(params=new URLSearchParams(),search=false){
 const category=['tees','shirts'].includes(params.get('category'))?params.get('category'):'all',q=(params.get('q')||'').slice(0,100),sort=['price-asc','price-desc'].includes(params.get('sort'))?params.get('sort'):'collection';
 const list=filterProducts({category,q,sort}),title=search?'Find your expression.':category==='tees'?'Everyday, elevated.':category==='shirts'?'A study in form.':'Collection 001.';
 const href=cat=>`/collection${cat==='all'?'':`?category=${cat}`}`;
 return shell(search?'Search the collection':category==='all'?'Collection 001 — Ascent':category==='tees'?'T-Shirts':'Shirts',`<section class="collection-heading section"><p class="eyebrow">${search?'THE KHAGA COLLECTION':'ASCENT / THE FIRST CHAPTER'}</p><div><h1>${title}</h1><p>A collection of design concepts. A shared signature.<br>Explore the preview—orders are not open yet.</p></div>${search?`<form action="/search" class="search-form inline-search"><label for="collection-search" class="sr-only">Search the collection</label><input type="search" id="collection-search" name="q" value="${e(q)}" maxlength="100" placeholder="Search products or colours"><button class="icon-button" aria-label="Search" type="submit">${icon('search')}</button></form>`:''}</section><section class="section collection-products"><div class="collection-toolbar"><nav class="filter-tabs" aria-label="Product categories">${[['all','All pieces'],['tees','T-Shirts'],['shirts','Shirts']].map(([c,n])=>`<a href="${href(c)}" class="${category===c&&!search?'active':''}">${n}</a>`).join('')}</nav><div class="sort-area"><span>${list.length} ${list.length===1?'piece':'pieces'}</span><form action="${search?'/search':'/collection'}" class="sort-form"><input type="hidden" name="category" value="${category}">${q?`<input type="hidden" name="q" value="${e(q)}">`:''}<label for="sort" class="sr-only">Sort products</label><select id="sort" name="sort" data-auto-submit>${[['collection','Collection order'],['price-asc','Price: low to high'],['price-desc','Price: high to low']].map(([v,n])=>`<option value="${v}" ${v===sort?'selected':''}>${n}</option>`).join('')}</select><button class="sort-submit" type="submit">Apply</button></form></div></div>${search&&q?`<p class="search-result-label">Results for “${e(q)}”</p>`:''}${list.length?`<div class="product-grid collection-grid">${list.map(card).join('')}</div>`:`<div class="empty-state"><h2>No pieces found.</h2><p>Try a product name, a colour, or explore the complete collection.</p>${cta('/collection','Explore all pieces')}</div>`}<p class="price-note">*Indicative preview prices in INR. Digital illustrations are design studies, not final garment photographs.</p></section>`,{page:'collection'});
}
function productPage(p,requestedColour){const c=variant(p,requestedColour),first=galleryViews(p,c)[0];return shell(p.name,`<div class="breadcrumbs"><a href="/collection">Collection</a><span>/</span><a href="/collection?category=${p.category}">${p.category==='tees'?'T-Shirts':'Shirts'}</a><span>/</span><span>${e(p.name)}</span></div><section class="product-detail editorial-product" data-product-detail="${p.id}" data-current-colour="${c}" data-initial-view="${first}"><div class="product-gallery"><div class="gallery-main"><span class="gallery-caption">${p.number} / DESIGN STUDY</span>${image(media(p,c,first),p.media?.[c]?.[first]?.alt||`${p.name} in ${colours[c].name}, ${first} design study`,'main-product-image',true)}<button class="gallery-next icon-button" data-gallery-next aria-label="Show next product view">${icon('arrow')}</button><span class="gallery-view-label" aria-live="polite">${e(first)} view</span><button class="gallery-zoom icon-button" type="button" data-zoom aria-label="Enlarge product image">${icon('search')}</button></div><div class="gallery-thumbnails" aria-label="Product views">${galleryViews(p,c).map(v=>[v,({front:'Front',back:'Back',detail:'Detail',model:'On model'})[v]]).map(([v,n])=>`<button type="button" class="thumbnail ${v===first?'active':''}" data-view="${v}" aria-label="Show ${n.toLowerCase()} view" aria-pressed="${v===first}">${image(media(p,c,v),`${n} concept view`)}<span>${n}</span></button>`).join('')}</div><p class="gallery-note">Preview imagery. Final fabric, colour and finish await sample approval.</p></div><div class="product-info"><p class="eyebrow">COLLECTION 001 — ASCENT / ${p.number}</p><h1>${e(p.name)}</h1><p class="product-tagline">${e(p.note)}</p><p class="product-edition">THE ASCENT COLLECTION / DESIGN ${p.number}</p><div class="product-price"><span>${money(p.price)}</span><span>Indicative preview price</span></div><p class="product-description">${e(p.description)}</p><div class="product-options"><div class="option-label">Colour <strong data-colour-label>${e(colours[c].name)}</strong></div>${swatches(p,c,'product')}<div class="size-label"><span id="size-label">Size <span data-size-label>Select your size</span></span><button type="button" data-open="size-dialog" class="size-guide">${icon('ruler')} Fit note</button></div><div class="size-options" role="group" aria-labelledby="size-label">${(p.sizes||sizes).map(s=>`<button type="button" data-size="${s}" aria-pressed="false">${s}</button>`).join('')}</div><p id="size-error" class="inline-error" role="alert" hidden>Please select a size to try the preview bag.</p><button class="button add-to-bag" data-add-product="${p.id}" type="button">Add to preview bag ${icon('plus')}</button><p class="purchase-notice">Preview only. Checkout disabled. No payment or stock reservation.</p></div><div class="product-accordions"><details open><summary>The design ${icon('plus')}</summary><ul>${p.details.map(d=>`<li>${e(d)}</li>`).join('')}</ul></details><details><summary>Fabric & fit ${icon('plus')}</summary><p>The specifications are still being sampled. Material composition, fabric weight, size measurements, shrinkage and care instructions will be confirmed before sale. The image is not a material specification.</p></details><details><summary>Delivery & returns ${icon('plus')}</summary><p>Orders are not open. Delivery times, service areas and return terms have not been confirmed. No 7–10 day delivery promise applies to this preview.</p><a href="/help/delivery">Read the current status</a></details></div></div></section><section class="product-story"><span class="eyebrow">BEHIND THE PIECE / ${p.number}</span><h2>${e(p.headline).replace(/\n/g,'<br>')}</h2><p>${e(p.story)}</p></section><section class="section related-products"><div class="section-heading"><div><p class="eyebrow">A SHARED POINT OF VIEW</p><h2>Continue the collection.</h2></div><a href="/collection" class="text-link">All pieces ${icon('arrow')}</a></div><div class="product-grid home-grid">${products.filter(x=>x.id!==p.id).slice(0,4).map(card).join('')}</div></section>`,{page:'product',description:p.description});}
function storyPage(){return shell('Our story',`<section class="story-hero"><p class="eyebrow">THE WORLD OF KHAGA</p><h1>Of sky.<br><em>Of possibility.</em></h1><p>Clothing for a higher tomorrow.</p><img src="/brand/emblem.svg" alt="The KHAGA Garuda and Sun emblem" width="400" height="314"></section><section class="story-content section"><span class="eyebrow">A POINT OF VIEW, NOT A PLACE</span><div><h2>Quiet power.<br>Considered expression.</h2><p>KHAGA begins with a simple design intention: give a garment a recognisable identity without letting the branding overwhelm it.</p><p>Our Garuda and Sun emblem connects the collection. Around it, each piece finds its own expression—in a solar accent, a flight line, an eclipse curve, a mountain contour, or simply the clarity of a shirt.</p><p>Collection 001, Ascent, is our first exploration of that language. A collection. One signature. Room to make it your own.</p>${cta('/collection','Explore Ascent')}</div></section><section class="story-principles"><article><span>01</span><h3>Identity, intact.</h3><p>One original emblem across every piece. The decoration changes; the signature does not.</p></article><article><span>02</span><h3>Design, considered.</h3><p>Distinct layouts, restrained details, and the space to let each garment speak.</p></article><article><span>03</span><h3>Proof, before promise.</h3><p>Our collection is still in development. Physical samples come before final product claims.</p></article></section>`,{page:'story'});}
const helpContent={
 preview:{title:'A first look. Not a live store.',intro:'You are exploring KHAGA’s design preview. The shopping experience is available to review, but the collection is not open for orders.',sections:[['What you are seeing','The seven products are concepts developed for Collection 001. Garment illustrations and campaign imagery are digital studies. They are not photographs of approved, available stock. Prices and colours are indicative.'],['What the bag does','The bag stores a selection on this browser only. It does not create an order, reserve stock, collect payment or notify KHAGA. Clearing your browser storage clears the selection.'],['Before we open','We need approved physical samples, actual garment measurements, confirmed pricing, stock or preorder capacity, business contact details, payments, and published delivery and returns policies.'],['Public preview','Search indexing is discouraged, but this is not a private website unless preview authentication or hosting access controls have been enabled.']]},
 sizing:{title:'Finding the right form.',intro:'Fit is part of the design—not a measurement we should guess from a picture.',sections:[['Our intended silhouettes','The tees explore relaxed shapes. Form proposes a more structured collar and visible buttons. Nocturne proposes a softer open collar, a concealed placket and more drape.'],['Measurements are pending','The S–XXL buttons are preview options. A measurement-based size chart will be added after samples are fitted and measured. Do not use the preview to select your final size.']]},
 delivery:{title:'Delivery & returns.',intro:'We are not accepting orders yet. There is no current dispatch or delivery commitment.',sections:[['Delivery','The supplier workflow, courier coverage, shipping cost and actual fulfilment times must be confirmed before checkout opens. International shipping is not yet configured.'],['Returns & exchanges','Return eligibility, timeframes, exchange handling, fees and the return address are not yet finalised. These terms will be published before any order can be placed.']]},
 care:{title:'Care begins with the fabric.',intro:'The final care instructions will follow the approved fabric and embellishment—not the concept image.',sections:[['Sample-led instructions','We will confirm fibre composition, washing temperature, ironing instructions and care for embroidery or prints with the supplier. Do not treat the illustrations as evidence of fabric weight, fibre content or a tested finish.']]},
 privacy:{title:'Privacy in this preview.',intro:'This version does not collect checkout details, email subscriptions or payment information.',sections:[['Owner workspace','The private administration area uses a necessary session cookie for sign-in. When configured, product records, uploaded images, hashed session identifiers and an owner activity log are stored in the configured database and media service. These are separate from the customer preview bag.'],['Saved on your device','The preview bag uses localStorage under “khaga.preview.bag.v1”. It contains product, colour, size and quantity only. Clear your bag or browser site data to remove it. If browser storage is blocked, the bag works for the current page session only.'],['Requests and hosting','Visiting the website sends standard web requests to the hosting provider. The provider may retain technical access logs. This build contains no Meta Pixel, advertising trackers, analytics scripts or third-party font requests.'],['Before launch','A complete business privacy notice, contact channel, retention details and any required consent flow must be published before introducing accounts, analytics, subscriptions or payments. This page describes the preview, not a final commerce policy.']]},
 terms:{title:'Preview terms.',intro:'This website is a visual and functional demonstration of the planned KHAGA storefront.',sections:[['No sale is created','Adding items to the preview bag does not form an order or purchase agreement. The indicated prices are not current offers for sale. Payment submission is disabled on the server as well as in the interface.'],['Concept limitations','Digital imagery may differ from final products. Materials, finish, sizing, price, availability, delivery and returns remain subject to confirmation. Do not place production orders using these website illustrations alone.'],['Business details','Legal entity information and operational customer support details must be added before launch. No unsupported address, telephone number or service promise has been invented for this preview.']]}
};
function helpPage(topic){const d=helpContent[topic]||helpContent.preview;return shell(d.title,`<section class="help-layout section"><aside><span class="eyebrow">GOOD TO KNOW</span><nav aria-label="Help topics">${[['preview','About this preview'],['sizing','Fit & sizing'],['delivery','Delivery & returns'],['care','Garment care'],['privacy','Privacy'],['terms','Preview terms']].map(([k,n])=>`<a class="${k===topic?'active':''}" href="/help/${k}">${n}</a>`).join('')}</nav></aside><article><p class="eyebrow">KHAGA / BEFORE THE FIRST FLIGHT</p><h1>${e(d.title)}</h1><p class="help-intro">${e(d.intro)}</p>${d.sections.map(([h,t])=>`<section><h2>${e(h)}</h2><p>${e(t)}</p></section>`).join('')}<a href="/collection" class="text-link">Back to the collection ${icon('arrow')}</a></article></section>`,{page:'help'});}
function bagPage(){return shell('Your preview bag',`<section class="section bag-page"><p class="eyebrow">YOUR SELECTION</p><h1>The preview bag.</h1><p class="bag-notice">No orders or payments are taken. This bag is saved only in your browser.</p><div data-cart-content class="cart-content"><div class="empty-state"><h2>Your selection starts here.</h2><p>Enable JavaScript to try the preview bag.</p>${cta('/collection','Explore the collection')}</div></div></section>`,{page:'bag'});}
function notFound(){return shell('Page not found',`<section class="empty-state error-page"><p class="eyebrow">404 / A DIFFERENT PATH</p><h1>Not every path<br>leads here.</h1><p>The page you are looking for is not part of this collection.</p>${cta('/collection','Explore the collection')}</section>`,{page:'404'});}

return {UI_BUILD,media,galleryViews,card,shell,home,collection,productPage,storyPage,helpPage,bagPage,notFound};
}


function createRouter(pages,catalog){
const {home,collection,productPage,storyPage,helpPage,bagPage,notFound}=pages;
const {byId}=catalog;
// Shared pure page renderer: same templates in Node and the single browser bundle.
function renderRoute(url) {
 const path=url.pathname.replace(/\/$/,'')||'/';
 if(path==='/')return home();
 if(path==='/collection'||path==='/search')return collection(url.searchParams,path==='/search');
 if(path==='/story')return storyPage();
 if(path==='/bag')return bagPage();
 if(path==='/checkout')return helpPage('preview');
 const p=path.match(/^\/products\/([a-z0-9-]+)$/);
 if(p)return byId.has(p[1])?productPage(byId.get(p[1]),url.searchParams.get('colour')):notFound();
 const h=path.match(/^\/help\/(preview|sizing|delivery|care|privacy|terms)$/);
 if(h)return helpPage(h[1]);
 return null; // Files, external destinations and unsupported paths retain native navigation.
}

return renderRoute;
}


const STORAGE_KEY='khaga.preview.bag.v1';
const MAX_QUANTITY=10;
function cleanItems(input,catalog){
 if(!Array.isArray(input))return [];
 const result=new Map();
 for(const item of input.slice(0,100)){
  if(!item||typeof item!=='object')continue;
  const p=catalog.products.find(p=>p.id===item.product);
  if(!p||!p.colours.includes(item.colour)||!(p.sizes||catalog.sizes).includes(item.size)||!Number.isInteger(item.quantity)||item.quantity<1)continue;
  const key=`${p.id}|${item.colour}|${item.size}`;
  const current=result.get(key);
  result.set(key,{product:p.id,colour:item.colour,size:item.size,quantity:Math.min(MAX_QUANTITY,(current?.quantity||0)+item.quantity)});
 }
 return [...result.values()];
}
function total(items,catalog){return items.reduce((sum,item)=>sum+(catalog.products.find(p=>p.id===item.product)?.price||0)*item.quantity,0);}
function readBag(storage,catalog){try{const data=JSON.parse(storage.getItem(STORAGE_KEY)||'null');return data?.version===1?cleanItems(data.items,catalog):[];}catch{return [];}}

const e=escapeHtml;
const initial=JSON.parse(document.getElementById('catalogue-data').content.textContent);
const catalog=createCatalog(initial);
const {products,colours,sizes,byId,money,variant}=catalog;
const pages=createViews(catalog);
const {media,galleryViews,UI_BUILD}=pages;
const renderRoute=createRouter(pages,catalog);
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

})();
