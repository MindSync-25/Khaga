import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {Script} from 'node:vm';
import {once} from 'node:events';
import {createApp} from '../src/app.mjs';
import {renderRoute} from '../src/routes.mjs';
import {products} from '../src/catalog.mjs';
import {home,productPage,UI_BUILD} from '../src/views.mjs';
let server,base;
before(async()=>{server=createApp({username:'',password:''});server.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}`;});
after(()=>new Promise(resolve=>server.close(resolve)));
const bundle=readFileSync(new URL('../public/site.js',import.meta.url),'utf8');
test('The browser uses one versioned deferred bundle, not a dependent module chain',()=>{
 const html=home();assert.equal((html.match(/<script\s/g)||[]).length,1);
 assert.ok(html.includes(`<script defer src="/site.js?v=${UI_BUILD}">`));
 assert.ok(!html.includes('src="/app.js"'));assert.ok(!html.includes('type="module"'));
});
test('Browser bundle parses and contains no unresolved module imports',()=>{
 assert.doesNotThrow(()=>new Script(bundle));assert.ok(!/^import\s/m.test(bundle));assert.ok(!/^export\s/m.test(bundle));
});
test('Controls and routing have no catalogue/page fetch bootstrap dependency',()=>{
 assert.ok(!/\bfetch\s*\(/.test(bundle));assert.ok(bundle.includes("document.addEventListener('click'"));
 assert.ok(bundle.includes("window.addEventListener('popstate'"));assert.ok(bundle.includes('history.pushState'));
});
test('The entire compressed interactive bundle remains under 22 KB',()=>{
 assert.ok(gzipSync(bundle).length<22000,`Bundle gzip bytes: ${gzipSync(bundle).length}`);
});
test('Shared browser renderer and actual HTTP HTML agree on all supported routes',async()=>{
 const paths=['/','/collection','/collection?category=shirts&sort=price-desc','/search?q=navy','/story','/bag','/checkout','/help/preview','/help/sizing','/help/terms','/products/unknown',...products.map(p=>`/products/${p.id}?colour=${p.colours.at(-1)}`)];
 for(const path of paths){const response=await fetch(base+path);assert.equal(await response.text(),renderRoute(new URL(base+path)),path);}
});
test('Unsupported asset routes retain native handling, never become fake pages',()=>{
 for(const path of ['/site.js','/api/catalog','/api/checkout','/brand/emblem.svg','/unknown'])assert.equal(renderRoute(new URL(base+path)),null,path);
});
test('Search content is escaped in locally rendered pages too',()=>{
 const html=renderRoute(new URL(base+'/search?q='+encodeURIComponent('<img src=x onerror=alert(1)>')));
 assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img src=x'));
});
test('Versioned bundle has JavaScript MIME, gzip and cache variation headers',async()=>{
 const r=await fetch(`${base}/site.js?v=${UI_BUILD}`,{headers:{'Accept-Encoding':'gzip'}});
 assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'text/javascript; charset=utf-8');
 assert.equal(r.headers.get('content-encoding'),'gzip');assert.equal(r.headers.get('vary'),'Accept-Encoding');assert.equal(r.headers.get('x-khaga-version'),UI_BUILD);
 assert.equal(await r.text(),bundle);
});
test('gzip;q=0 receives uncompressed content',async()=>{
 const r=await fetch(base+'/site.js',{headers:{'Accept-Encoding':'gzip;q=0'}});
 assert.equal(r.headers.get('content-encoding'),null);assert.equal(await r.text(),bundle);
});
test('Weak static validators are safe across gzip and identity representations',async()=>{
 const r=await fetch(base+'/site.js',{headers:{'Accept-Encoding':'gzip'}});const etag=r.headers.get('etag');assert.ok(etag.startsWith('W/'));
 const n=await fetch(base+'/site.js',{headers:{'If-None-Match':etag,'Accept-Encoding':'identity'}});assert.equal(n.status,304);assert.equal(n.headers.get('vary'),'Accept-Encoding');
});
test('Master emblem and original garment artwork remain byte-for-byte unchanged',()=>{
 const gitHash=data=>createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
 assert.equal(gitHash(readFileSync(new URL('../public/brand/khaga-master.svg',import.meta.url))),'e34f7409f460673c43389bd4a67e15382f71a909');
 assert.equal(gitHash(readFileSync(new URL('../src/artwork.mjs',import.meta.url))),'f732b58e8a9d28125c997747a2316be15bf35e13');
});
test('Colour links and gallery controls remain usable progressive-enhancement markup',()=>{
 for(const p of products){const html=productPage(p,p.colours[0]);assert.ok(html.includes('data-gallery-next'));assert.ok(html.includes('data-zoom'));assert.ok(html.includes('data-open="size-dialog"'));for(const c of p.colours)assert.ok(html.includes(`href="/products/${p.id}?colour=${c}"`));}
});
test('Every interactive route retains the preview-only purchase boundary',async()=>{
 for(const p of products)assert.ok(productPage(p).includes('Checkout disabled'));
 const r=await fetch(base+'/api/checkout',{method:'POST',body:'{}'});assert.equal(r.status,403);assert.equal((await r.json()).error,'PREVIEW_ONLY');
});
test('New assets require the same optional preview authentication as pages',async()=>{
 const protectedApp=createApp({username:'review',password:'test-password-not-a-secret'});protectedApp.listen(0,'127.0.0.1');await once(protectedApp,'listening');
 const u=`http://127.0.0.1:${protectedApp.address().port}`;
 try{for(const path of ['/site.js','/editorial.css']){assert.equal((await fetch(u+path)).status,401);const r=await fetch(u+path,{headers:{Authorization:'Basic '+Buffer.from('review:test-password-not-a-secret').toString('base64'),'Accept-Encoding':'gzip'}});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');}}
 finally{await new Promise(resolve=>protectedApp.close(resolve));}
});
