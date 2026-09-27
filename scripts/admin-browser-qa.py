"""Offline admin UI checks using real HTML/CSS/JS and explicit fake API fixtures.
No browser networking, live Supabase, native-cookie or Hostinger claim is made.
Native HTTP/auth/storage behaviour is tested separately by the Node test suite.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from PIL import Image
import subprocess,json,re,base64,os
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('KHAGA_QA_OUTPUT',str(ROOT/'qa-admin')));OUT.mkdir(exist_ok=True,parents=True)
fixture=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {products} from './src/catalog.mjs'; import {seededProduct} from './src/management/catalogue.mjs'; console.log(JSON.stringify(products.map(p=>({id:p.id,version:1,body:{draft:seededProduct(p),published:seededProduct(p)}}))));"],cwd=ROOT))
wordmark=subprocess.check_output(['node','--input-type=module','-e',"import {brandSvg} from './src/artwork.mjs'; console.log(brandSvg({wordmark:true,emblem:false}));"],cwd=ROOT)
html=(ROOT/'public/admin/index.html').read_text()
html=re.sub(r'<script[^>]*src=[^>]*></script>','',html)
html=re.sub(r'<link[^>]*>','',html).replace('/brand/wordmark.svg','data:image/svg+xml;base64,'+base64.b64encode(wordmark).decode())
styles=(ROOT/'public/admin.css').read_text(); script=(ROOT/'public/admin.js').read_text()
Image.new('RGB',(600,750),'#ded6c9').save(OUT/'fixture-upload.png')
checks=[]
def passed(name): checks.append(name);print('PASS',name,flush=True)
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':1080},device_scale_factor=1)
 errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
 # Block all real network. This is a UI test with explicit fixtures, not a proxy.
 page.route('**/*',lambda route:route.abort())
 page.set_content(html);page.add_style_tag(content=styles)
 page.evaluate(r'''records=>{
 const rows=new Map(records.map(r=>[r.id,r])); let session=null, count=0; const assets=new Map();
 window.__qa={rows,assets,requests:[],conflict:false};
 const clone=x=>structuredClone(x);
 const response=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 window.fetch=async (path,options={})=>{
  const url=new URL(path,'https://khaga.test'),m=options.method||'GET';window.__qa.requests.push({path:url.pathname,method:m,headers:options.headers});
  const data=options.body&&!(options.body instanceof Blob)?JSON.parse(options.body):{};
  if(url.pathname==='/api/admin/session')return session?response(200,session):response(401,{error:'ADMIN_LOGIN_REQUIRED',message:'Please sign in.'});
  if(url.pathname==='/api/admin/login'){
   if(data.password!=='offline-fixture-password')return response(401,{message:'The email or password is incorrect.'});
   session={email:'owner@example.test',csrf:'offline-fixture-csrf',driver:'supabase',expiresAt:Date.now()+3600000};return response(200,session);
  }
  if(!session)return response(401,{message:'Please sign in.'});
  if(m!=='GET'&&options.headers['X-CSRF-Token']!==session.csrf)return response(403,{message:'CSRF required.'});
  if(url.pathname==='/api/admin/logout'){session=null;return response(200,{ok:true});}
  if(url.pathname==='/api/admin/products')return response(200,{products:[...rows.values()]});
  if(url.pathname==='/api/admin/audit')return response(200,{events:[{actor:'owner@example.test',kind:'product',record_id:'origin-tee',version:3,at:Date.now()}]});
  if(url.pathname==='/api/admin/import')return response(200,{inserted:0});
  if(url.pathname==='/api/admin/media'&&m==='POST'){
   const buffer=await options.body.arrayBuffer(),prefix=Array.from(new Uint8Array(buffer).slice(0,8));
   if(prefix.join(',')!=='137,80,78,71,13,10,26,10')return response(422,{message:'PNG required'});
   const id='11111111-1111-4111-8111-'+String(++count).padStart(12,'0');
   const urlData=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(options.body)});
   assets.set(id,{id,urlData});return response(201,{id,url:'/product-media/'+id+'.png'});
  }
  const match=url.pathname.match(/^\/api\/admin\/products\/([a-z0-9-]+)(?:\/(publish|unpublish))?$/);
  if(match){const [_,id,action]=match;const r=rows.get(id);
   if(m==='GET')return response(200,clone(r));
   if(window.__qa.conflict){window.__qa.conflict=false;return response(409,{message:'This product changed. Reload before saving.'});}
   if((r?.version||0)!==data.version)return response(409,{message:'Edit conflict.'});
   let next;
   if(m==='PUT')next={id,version:data.version+1,body:{draft:clone(data.product),published:r?.body.published||null}};
   else next={...r,version:r.version+1,body:{draft:clone(r.body.draft),published:action==='publish'?clone(r.body.draft):null}};
   rows.set(id,next);return response(200,clone(next));
  }
  return response(404,{message:'No offline fixture for this operation.'});
 };
 // Substitute only fixture media in this offline DOM test; no requests are sent.
 new MutationObserver(()=>document.querySelectorAll('img[src^="/product-media/"]').forEach(img=>{const id=img.getAttribute('src').split('/').pop().replace('.png','');const asset=assets.get(id);if(asset)img.src=asset.urlData;})).observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
 }''',fixture)
 page.add_script_tag(content=script)
 expect(page.locator('#login-form')).to_be_visible();passed('Signed-out view uses owner login, not an editable catalogue')
 page.locator('[name=email]').fill('owner@example.test');page.locator('[name=password]').fill('wrong')
 page.locator('#login-form button').click();expect(page.locator('#login-error')).to_contain_text('incorrect');passed('Failed login shows feedback and re-enables button')
 page.locator('[name=password]').fill('offline-fixture-password');page.locator('#login-form button').click()
 expect(page.locator('.catalog-table tbody tr')).to_have_count(7);passed('Login success opens seven-product catalogue')
 page.screenshot(path=str(OUT/'khaga-v4-admin-catalogue.png'),full_page=True)
 page.locator('[data-action=edit][data-id=origin-tee]').click();expect(page.locator('[data-field=name]')).to_have_value('Origin Tee');passed('Manage opens existing product and colour-specific editor')
 page.locator('[data-field=note]').fill('A considered essential');page.locator('[data-price]').fill('3190.50');page.locator('[data-save]').click()
 expect(page.locator('#save-state')).to_contain_text('Saved version 2')
 assert page.evaluate("__qa.rows.get('origin-tee').body.draft.price")==319050
 assert page.evaluate("__qa.rows.get('origin-tee').body.published.price")==299000
 passed('Draft save keeps exact paise price and does not publish')
 page.locator('[data-action=publish]').click();expect(page.locator('#confirmation')).to_be_visible();page.locator('#confirm-no').click()
 assert page.evaluate("__qa.rows.get('origin-tee').version")==2;passed('Cancelling publication leaves saved/published versions untouched')
 page.locator('[data-action=publish]').click();page.locator('#confirm-yes').click();expect(page.locator('#save-state')).to_contain_text('Saved version 3')
 assert page.evaluate("__qa.rows.get('origin-tee').body.published.price")==319050;passed('Publication requires explicit confirmation and saves version')
 page.locator('#media-colour').select_option('ivory')
 page.locator('[data-upload=front]').set_input_files(str(OUT/'fixture-upload.png'))
 expect(page.locator('[data-alt=front]')).to_be_visible();page.locator('[data-alt=front]').fill('Origin Tee in ivory, front sample reference')
 assert page.evaluate("__qa.assets.size")==1
 assert page.evaluate("Object.keys(__qa.rows.get('origin-tee').body.published.media.ivory).length")==0
 passed('Real canvas uploader sends normalized PNG and keeps attachment in unsaved draft')
 page.locator('[data-upload=back]').set_input_files(str(OUT/'fixture-upload.png'));expect(page.locator('[data-alt=back]')).to_be_visible()
 page.locator('[data-action=move-image][data-view=back][data-step="-1"]').click()
 expect(page.locator('.image-slot h3').first).to_contain_text('back');passed('Colour gallery supports reordering without changing other colour assets')
 page.locator('[data-sizes]').fill('S, M, L, XL');page.locator('[data-sizes]').press('Tab')
 expect(page.locator('.variants-table tbody tr')).to_have_count(4);passed('Size edits update availability rows')
 page.locator('[data-variant=M][data-key=mode]').select_option('preorder')
 page.locator('[data-variant=M][data-key=quantity]').fill('10')
 page.locator('[data-variant=M][data-key=dispatchMin]').fill('7');page.locator('[data-variant=M][data-key=dispatchMax]').fill('10')
 page.locator('[data-save]').click();expect(page.locator('#save-state')).to_contain_text('Saved version 4')
 v=page.evaluate("__qa.rows.get('origin-tee').body.draft.variants.find(v=>v.colour==='ivory'&&v.size==='M')")
 assert v['mode']=='preorder' and v['quantity']==10 and v['dispatchMin']==7 and v['dispatchMax']==10
 passed('Availability editor saves preorder capacity and dispatch range')
 page.screenshot(path=str(OUT/'khaga-v4-admin-product.png'),full_page=True)
 page.evaluate('__qa.conflict=true');page.locator('[data-field=note]').fill('Unsaved conflict example');page.locator('[data-save]').click()
 expect(page.locator('#message')).to_contain_text('Reload before saving');expect(page.locator('[data-field=note]')).to_have_value('Unsaved conflict example');passed('Conflict feedback preserves unsaved text instead of overwriting silently')
 page.locator('[data-action=catalogue]').click();expect(page.locator('#confirmation')).to_be_visible();page.locator('#confirm-yes').click();expect(page.locator('.catalog-table tbody tr')).to_have_count(7)
 passed('Dirty editor asks before discarding changes')
 page.locator('[data-action=edit][data-id=origin-tee]').click();page.locator('[data-action=unpublish]').click();page.locator('#confirm-yes').click();expect(page.locator('.publish-summary')).to_have_text('Hidden draft');passed('Unpublish uses confirmation and leaves an editable hidden draft')
 page.locator('[data-action=catalogue]').click();page.locator('[data-action=new]').click();expect(page.locator('[data-action=publish]')).to_be_disabled();expect(page.locator('[data-upload=front]')).to_be_disabled();passed('New products cannot upload or publish before first save')
 page.locator('[data-field=id]').fill('new-reference-tee');page.locator('[data-field=name]').fill('Reference Tee');page.locator('[data-field=note]').fill('Studio concept');page.locator('[data-field=headline]').fill('A new study.');page.locator('[data-field=description]').fill('A concept garment for supplier discussion.');page.locator('[data-save]').click();expect(page.locator('#save-state')).to_contain_text('Saved version 1')
 assert page.evaluate("__qa.rows.get('new-reference-tee').body.published")==None;passed('New product saves as hidden draft')
 for width in [390,768,1440]:
  page.set_viewport_size({'width':width,'height':960});page.wait_for_timeout(50)
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),width
  passed(f'Admin editor has no horizontal page overflow at {width}px')
 page.set_viewport_size({'width':390,'height':900});page.screenshot(path=str(OUT/'khaga-v4-admin-mobile.png'),full_page=True)
 page.locator('[data-action=activity]').click();expect(page.locator('h1')).to_have_text('Studio activity.');passed('Activity log renders without request bodies or secrets')
 page.locator('[data-action=logout]').click();expect(page.locator('#login-form')).to_be_visible();passed('Logout returns to owner login')
 assert not errors,errors;passed('No unhandled errors in admin UI run')
 browser.close()
(OUT/'admin-browser-results.json').write_text(json.dumps({'checks':checks,'count':len(checks),'limitations':'Offline browser with explicit fake API; not live Supabase/native-cookie/network validation.'},indent=2))
print('TOTAL',len(checks))
