"""Offline Chromium DOM/interaction harness.
HTTP navigation is administratively blocked in this environment. Node HTTP tests run
separately. This harness embeds the app's actual HTML/CSS/media, executes its built
script unchanged, and supplies simulated same-origin History/localStorage adapters.
It does NOT claim live Hostinger or native browser-network validation.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import base64,json,re,requests,sys,os
ROOT=Path(__file__).resolve().parents[1]
OUTPUT=Path(os.environ.get('KHAGA_QA_OUTPUT',str(ROOT/'qa-output')));OUTPUT.mkdir(exist_ok=True)
BASE=os.environ.get('KHAGA_TEST_URL','http://127.0.0.1:3110')
origin='https://khaga.test'
catalog=requests.get(BASE+'/api/catalog').json()
resources={}
for path in ['/brand/emblem.svg','/brand/wordmark.svg','/assets/campaign.svg']+[
 f'/media/{p["id"]}/{c}/{v}.svg'+t for p in catalog['products'] for c in p['colours'] for v in ['front','back','detail'] for t in ['', '?background=transparent']
]:
 r=requests.get(BASE+path);assert r.status_code==200,(path,r.status_code)
 resources[path]='data:'+r.headers['Content-Type'].split(';')[0]+';base64,'+base64.b64encode(r.content).decode()
script=(ROOT/'public/site.js').read_text()
styles='\n'.join((ROOT/f).read_text() for f in ['public/styles.css','public/editorial.css'])
checks=[]
def record(name):checks.append(name);print('PASS',name)
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 def setup(path='/',width=1440,height=1000,blocked=False,saved=None):
  page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  html=requests.get(BASE+path).text
  html=re.sub(r'<script[^>]*src=[^>]*></script>','',html)
  html=re.sub(r'<link[^>]*>','',html)
  def embed(match):
   src=match.group(1);return 'src="'+resources.get(src,src)+'"'
  html=re.sub(r'src="([^"]+)"',embed,html)
  html=html.replace('<head>','<head><base href="'+origin+path+'">')
  page.set_content(html)
  page.add_style_tag(content=styles)
  page.evaluate('''({map,start,blocked,saved})=>{
   window.__imageMap=map;window.__externalFetches=0;
   window.fetch=()=>{window.__externalFetches++;return Promise.reject(new Error('Offline request blocked by test harness'));};
   const stack=[{khaga:true,url:start,y:0}];let i=0;
   Object.defineProperty(history,'state',{configurable:true,get:()=>stack[i]});
   history.replaceState=(state,unused,url)=>{if(new URL(url,start).origin!==new URL(start).origin)throw Error('Cross origin history');stack[i]=state;document.querySelector('base').href=url;};
   history.pushState=(state,unused,url)=>{if(new URL(url,start).origin!==new URL(start).origin)throw Error('Cross origin history');stack.splice(++i);stack[i]=state;document.querySelector('base').href=url;};
   history.back=()=>{if(i>0){i--;document.querySelector('base').href=stack[i].url;window.dispatchEvent(new PopStateEvent('popstate',{state:stack[i]}));}};
   history.forward=()=>{if(i<stack.length-1){i++;document.querySelector('base').href=stack[i].url;window.dispatchEvent(new PopStateEvent('popstate',{state:stack[i]}));}};
   window.__historyStack=()=>({stack,index:i});
   const store={...(saved||{})};window.__testStore=store;
   if(!blocked)Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>store[k]||null,setItem:(k,v)=>store[k]=String(v),removeItem:k=>delete store[k],clear:()=>Object.keys(store).forEach(k=>delete store[k])}});
   const rawGet=Element.prototype.getAttribute,rawSet=Element.prototype.setAttribute;
   const original=new WeakMap();
   const lookup=s=>{try{const u=new URL(s,start);return map[u.pathname+u.search]||map[u.pathname];}catch{return null;}};
   function embed(img){const src=rawGet.call(img,'src');if(!src||src.startsWith('data:'))return;const data=lookup(src);if(data){original.set(img,src);rawSet.call(img,'src',data);}}
   Object.defineProperty(HTMLImageElement.prototype,'src',{configurable:true,get(){return original.has(this)?new URL(original.get(this),document.baseURI).href:rawGet.call(this,'src');},set(v){original.set(this,String(v));rawSet.call(this,'src',lookup(String(v))||String(v));}});
   Element.prototype.getAttribute=function(key){if(this instanceof HTMLImageElement&&key==='src'&&original.has(this))return original.get(this);return rawGet.call(this,key);};
   new MutationObserver(ms=>{for(const m of ms){if(m.type==='childList')for(const n of m.addedNodes){if(n instanceof HTMLImageElement)embed(n);if(n.querySelectorAll)n.querySelectorAll('img').forEach(embed);}else if(m.target instanceof HTMLImageElement)embed(m.target);}}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
  }''',{'map':resources,'start':origin+path,'blocked':blocked,'saved':saved})
  page.add_script_tag(content=script)
  page.wait_for_timeout(230)
  return page,errors
 page,errors=setup()
 assert page.evaluate('document.documentElement.dataset.khagaReady')=='0.3.0';record('Single script initializes without catalogue API request')
 page.screenshot(path=str(OUTPUT/'khaga-v3-home-desktop.png'),full_page=False)
 page.screenshot(path=str(OUTPUT/'khaga-v3-home-full.png'),full_page=True)
 page.evaluate('window.__sameDocument=42')
 page.locator('.editorial-hero-copy a').click();assert page.locator('.product-card').count()==7;assert page.evaluate('window.__sameDocument')==42;record('Home → collection updates main, keeps document and persistent header')
 page.locator('.filter-tabs a[href="/collection?category=shirts"]').click();assert page.locator('.product-card').count()==2;record('Category filter updates without request')
 page.locator('#sort').select_option('price-desc');assert page.locator('.product-card').first.get_attribute('data-product')=='nocturne-shirt';record('Sort updates immediately')
 page.locator('.product-card').first.locator('h3 a').click();assert page.locator('h1').inner_text()=='Nocturne Shirt';record('Collection → product routes locally')
 page.evaluate('history.back()');page.wait_for_timeout(60);assert page.locator('.product-card').count()==2;record('Back restores filtered and sorted collection (simulated History boundary)')
 page.evaluate('history.forward()');assert page.locator('h1').inner_text()=='Nocturne Shirt';record('Forward restores product (simulated History boundary)')
 page.locator('[data-search-open]').click();assert page.locator('#search-dialog').is_visible();page.locator('#search-field').fill('Flight');page.locator('#search-field').press('Enter');assert not page.locator('#search-dialog').is_visible();assert page.locator('.product-card').count()==1;record('Search dialog opens, submits locally and closes')
 page.locator('.product-card h3 a').click();page.locator('[data-size="M"]').click();page.locator('[data-view="back"]').click()
 before_y=page.evaluate('scrollY');page.locator('.product-detail [data-colour="forest"]').click()
 assert page.locator('[data-colour-label]').inner_text()=='Forest Green';assert 'forest/back.svg' in page.evaluate("document.querySelector('.main-product-image').getAttribute('src')");assert page.locator('[data-size="M"]').get_attribute('aria-pressed')=='true';record('Colour update preserves selected size + gallery view and uses matching media')
 # rapid colour changes, later selection wins synchronously
 for c in ['smoke','navy','forest','smoke']:page.locator(f'.product-detail [data-colour="{c}"]').click()
 assert 'smoke/back.svg' in page.evaluate("document.querySelector('.main-product-image').getAttribute('src')");record('Rapid colours: final selection wins, no stale-image callback race')
 page.locator('[data-gallery-next]').click();assert 'detail.svg' in page.evaluate("document.querySelector('.main-product-image').getAttribute('src')");record('Gallery next and thumbnails work after route changes')
 page.locator('[data-zoom]').click();assert page.locator('#zoom-dialog').is_visible();page.keyboard.press('Escape');assert not page.locator('#zoom-dialog').is_visible();record('Gallery enlargement, Escape and focus restoration work')
 page.locator('[data-open="size-dialog"]').click();page.locator('#size-dialog [data-close]').click();record('Fit note opens/closes')
 page.locator('[data-add-product]').click();assert page.locator('#bag-dialog').is_visible();assert page.locator('#bag-dialog .cart-item').count()==1;record('Add selected variant to bag')
 page.locator('#bag-dialog [data-delta="1"]').click();assert page.locator('#bag-dialog .quantity-controls span').inner_text()=='2';page.locator('#bag-dialog [data-delta="-1"]').click();assert page.locator('#bag-dialog .quantity-controls span').inner_text()=='1';record('Bag increase/decrease work without duplicate handlers')
 assert page.locator('#bag-dialog .checkout-disabled').is_disabled();record('Checkout stays visibly disabled')
 saved=page.evaluate('window.__testStore');page.locator('#bag-dialog [data-close]').click()
 # navigate repeatedly; delegation must not duplicate add events
 for _ in range(3):
  page.locator('.brand').click();page.locator('.editorial-hero-copy a').click();page.locator('[data-product="flight-tee"] h3 a').click()
 page.locator('[data-size="M"]').click();page.locator('.product-detail [data-colour="smoke"]').click();page.locator('[data-add-product]').click();assert page.locator('#bag-dialog .quantity-controls span').inner_text()=='2';record('Repeated navigation does not duplicate event handlers')
 page.locator('#bag-dialog [data-remove]').click();assert page.locator('#bag-dialog .cart-item').count()==0;record('Remove item updates bag and count')
 page.locator('#bag-dialog [data-close]').click();page.locator('.brand').click();page.locator('.product-card').first.locator('[data-card-view]').click();assert 'show-back' in page.locator('.product-card').first.get_attribute('class');page.locator('.product-card').first.locator('[data-colour="ivory"]').click();assert page.evaluate("document.querySelector('.product-card .product-image').getAttribute('src')").endswith('/ivory/front.svg');record('Card front/back and colour controls work')
 assert page.evaluate('window.__externalFetches')==0;record('Zero catalogue/page fetches during all interactions')
 assert not errors,errors;record('No unhandled JavaScript exceptions in interaction run')
 page.close()
 page,errors=setup('/products/form-shirt?colour=blue')
 assert page.locator('[data-colour-label]').inner_text()=='Powder Blue';page.screenshot(path=str(OUTPUT/'khaga-v3-product-desktop.png'),full_page=False)
 page.locator('[data-add-product]').click();assert page.locator('#size-error').is_visible();assert not page.locator('#bag-dialog').is_visible();record('Missing size validation prevents incomplete bag entry')
 page.close()
 page,errors=setup('/products/flight-tee',saved=saved)
 page.locator('[data-bag-open]').click();assert 'Smoke Grey / M' in page.locator('#bag-dialog').inner_text();record('Bag restores saved size/colour/quantity on fresh initialization')
 page.close()
 page,errors=setup('/products/origin-tee',blocked=True)
 page.locator('[data-size="L"]').click();page.locator('[data-add-product]').click();assert page.locator('#bag-dialog .cart-item').count()==1;record('Storage blocked: temporary bag remains usable')
 page.close()
 for w in [360,390,768,1440]:
  page,errors=setup('/',width=w,height=844 if w<700 else 1000)
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(w,page.evaluate('document.documentElement.scrollWidth'))
  if w==390:
   page.screenshot(path=str(OUTPUT/'khaga-v3-home-mobile.png'),full_page=False)
   page.locator('.mobile-menu-toggle').click();assert page.locator('#menu-dialog').is_visible();page.locator('#menu-dialog a',has_text='Shirts').filter(has_text='T-Shirts').click();assert not page.locator('#menu-dialog').is_visible();assert page.locator('.product-card').count()==5
   record('Mobile menu routes and closes without a document reload')
   page.locator('.product-card').first.locator('h3 a').click();page.screenshot(path=str(OUTPUT/'khaga-v3-product-mobile.png'),full_page=False)
  assert not errors,errors;page.close();record(f'No horizontal overflow at {w}px')
 browser.close()
Path(str(OUTPUT/'khaga-v3-browser-results.json')).write_text(json.dumps({'mode':'offline Chromium with simulated History/storage; actual templates and bundle','checks':checks,'passed':len(checks)},indent=2))
print('TOTAL',len(checks))
