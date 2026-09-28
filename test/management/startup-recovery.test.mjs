import test from 'node:test';
import assert from 'node:assert/strict';
import {managementConfig,ConfigurationError} from '../../src/management/config.mjs';
import {checkManagementSetup,safeDiagnostic} from '../../src/management/diagnostics.mjs';
import {SupabaseRepository} from '../../src/management/repository.mjs';
import {startApplication} from '../../src/bootstrap.mjs';
const key='sb_secret_'+ 'dummy-not-a-live-provider-key-0001';
const hash='scrypt$65536$8$2$'+'a'.repeat(32)+'$'+'b'.repeat(128);
const valid={CATALOG_DRIVER:'supabase',ADMIN_ENABLED:'true',APP_ORIGIN:'https://khaga.example',SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:key,ADMIN_EMAIL:'owner@example.test',ADMIN_PASSWORD_HASH:hash};
const emptyRepo=()=>({driver:'supabase',list:async()=>[],close:async()=>{}});
async function running(env,open,fn){const logs=[];const app=await startApplication({env,open,port:0,host:'127.0.0.1',log:m=>logs.push(m)});const base=`http://127.0.0.1:${app.server.address().port}`;try{await fn(app,base,logs);}finally{await app.close();}}

test('Normalizes accidental outer whitespace and case in non-secret switches',()=>{
 const c=managementConfig({...valid,CATALOG_DRIVER:' SUPABASE \n',ADMIN_ENABLED:' TRUE ',APP_ORIGIN:' https://khaga.example ',SUPABASE_URL:' https://example.supabase.co ',SUPABASE_SECRET_KEY:' '+key+' ',ADMIN_PASSWORD_HASH:' '+hash+' '});
 assert.equal(c.driver,'supabase');assert.equal(c.enabled,true);assert.equal(c.secretKey,key);assert.equal(c.passwordHash,hash);
});
test('Invalid driver cannot silently fall back to a seeded catalogue',()=>{
 assert.throws(()=>managementConfig({...valid,CATALOG_DRIVER:'"preview"'}),e=>e instanceof ConfigurationError&&e.issues.some(x=>x.field==='CATALOG_DRIVER'));
});
test('Invalid boolean produces field-specific guidance',()=>{
 assert.throws(()=>managementConfig({...valid,ADMIN_ENABLED:'yes'}),e=>e.issues.some(x=>x.field==='ADMIN_ENABLED'&&x.code==='BOOLEAN_FORMAT'));
});
test('Missing and publishable keys have distinct errors without including values',()=>{
 for(const [value,code] of [['','KEY_MISSING'],['sb_publishable_sensitive_marker','KEY_TYPE'],['eyJsensitive','KEY_TYPE'],['"'+key+'"','KEY_FORMAT'],['sb_secret_bad value','KEY_FORMAT']]){
  assert.throws(()=>managementConfig({...valid,SUPABASE_SECRET_KEY:value}),e=>e.issues.some(x=>x.code===code)&&(!value||!e.message.includes(value)));
 }
});
test('Reports all independent setup failures in one configuration result',()=>{
 assert.throws(()=>managementConfig({...valid,APP_ORIGIN:'postgresql://user:secret@host/db',SUPABASE_URL:'not-a-url',SUPABASE_SECRET_KEY:'',ADMIN_EMAIL:'wrong',ADMIN_PASSWORD_HASH:'not-a-hash'}),e=>{
  assert.equal(e.issues.length,5);assert.ok(!e.message.includes('user:secret'));assert.ok(!e.message.includes('not-a-hash'));return true;
 });
});
test('Key validation does not assume base64url-only opaque provider tokens',()=>{
 const value='sb_secret_opaque.payload+/example=12345';assert.equal(managementConfig({...valid,SUPABASE_SECRET_KEY:value}).secretKey,value);
});
test('No settings still means explicit preview with closed admin',()=>{
 assert.deepEqual(managementConfig({}),{driver:'preview',enabled:false});
});
test('Local SQLite restrictions remain in force',()=>{
 assert.throws(()=>managementConfig({...valid,CATALOG_DRIVER:'sqlite',ALLOW_LOCAL_ADMIN:'TRUE',NODE_ENV:'production',KHAGA_DATA_DIR:'/tmp/local'}));
});
test('One preflight uses staged values without toggling flags or writing data',async()=>{
 const env={...valid,CATALOG_DRIVER:'preview',ADMIN_ENABLED:'false'};let count=0,closed=false;
 const result=await checkManagementSetup(env,async config=>{count++;assert.equal(config.driver,'supabase');assert.equal(config.enabled,true);return {close:async()=>{closed=true;}};});
 assert.equal(result.ok,true);assert.equal(count,1);assert.equal(closed,true);assert.equal(env.CATALOG_DRIVER,'preview');assert.equal(env.ADMIN_ENABLED,'false');assert.ok(!JSON.stringify(result).includes(key));
});
test('Preflight validation failure never calls storage',async()=>{
 let called=false;const r=await checkManagementSetup({},async()=>{called=true;});assert.equal(r.ok,false);assert.equal(called,false);assert.ok(r.issues.length>1);
});
test('Unknown provider errors are redacted, including messages and stack',()=>{
 const e=new Error(key+' '+hash+' private-body');e.cause=new Error('sensitive');const text=JSON.stringify(safeDiagnostic(e));assert.ok(!text.includes(key));assert.ok(!text.includes(hash));assert.ok(!text.includes('sensitive'));assert.ok(text.includes('STARTUP_CHECK_FAILED'));
});
for(const [status,code] of [[401,'STORAGE_AUTH_FAILED'],[403,'STORAGE_ACCESS_DENIED'],[404,'STORAGE_NOT_FOUND'],[429,'STORAGE_RATE_LIMITED'],[500,'STORAGE_UNAVAILABLE']]){
 test(`Supabase ${status} is classified without returning response body`,async()=>{
  const r=new SupabaseRepository(managementConfig(valid),async()=>new Response(key+' private provider body',{status}));
  await assert.rejects(r.ready(),e=>e.code===code&&e.stage==='schema'&&!e.message.includes(key));
 });
}
test('Bucket failures are distinguishable from schema failures',async()=>{
 const r=new SupabaseRepository(managementConfig(valid),async url=>url.includes('/rpc/')?Response.json({schema:1}):Response.json({public:true}));
 await assert.rejects(r.ready(),e=>e.code==='PRIVATE_BUCKET_REQUIRED'&&e.stage==='media');
});
test('Malformed provider JSON does not leak source text',async()=>{
 const r=await checkManagementSetup(valid,async c=>{const repo=new SupabaseRepository(c,async()=>new Response(key,{status:200}));await repo.ready();return repo;});
 assert.equal(r.ok,false);assert.equal(r.stage,'schema');assert.ok(!JSON.stringify(r).includes(key));
});
test('Preview still serves actual HTTP pages and closes admin without storage',async()=>{
 let called=false;await running({},async()=>{called=true;},async(app,base)=>{
  const r=await app.ready;assert.equal(r.state,'ready');assert.equal(called,false);assert.equal((await fetch(base+'/')).status,200);assert.equal((await fetch(base+'/api/admin/session')).status,503);assert.equal((await fetch(base+'/api/checkout',{method:'POST'})).status,403);
 });
});
test('Invalid driver keeps listener alive with honest maintenance, not seed data',async()=>{
 await running({...valid,CATALOG_DRIVER:'bad-value'},async()=>{throw new Error('must not call');},async(app,base,logs)=>{
  assert.equal((await app.ready).state,'maintenance');assert.equal(app.server.listening,true);
  for(const path of ['/','/admin','/health','/api/catalog','/site.js']){const r=await fetch(base+path);assert.equal(r.status,503);const t=await r.text();assert.ok(!t.includes('Origin Tee'));assert.ok(!t.includes(key));assert.ok(!t.includes(hash));}
  assert.equal((await fetch(base+'/api/checkout',{method:'POST'})).status,403);assert.equal((await fetch(base+'/',{method:'HEAD'})).status,503);
  assert.ok(logs.some(s=>s.includes('DRIVER_FORMAT')));assert.ok(!logs.join('').includes('bad-value'));
 });
});
test('Bad admin hash closes admin without stopping a healthy managed catalogue',async()=>{
 await running({...valid,ADMIN_PASSWORD_HASH:'bad-secret-value'},async()=>emptyRepo(),async(app,base,logs)=>{
  const r=await app.ready;assert.equal(r.state,'ready');assert.equal(r.admin,'disabled');assert.equal((await fetch(base+'/')).status,200);assert.equal((await fetch(base+'/admin')).status,503);
  const data=await(await fetch(base+'/api/catalog')).json();assert.equal(data.products.length,0);assert.equal(data.managed,true);
  assert.ok(logs.some(x=>x.includes('HASH_FORMAT')));assert.ok(!logs.join('').includes('bad-secret-value'));
 });
});
test('Valid owner configuration and healthy storage can serve the login page',async()=>{
 await running(valid,async()=>emptyRepo(),async(app,base)=>{assert.equal((await app.ready).admin,'enabled');assert.equal((await fetch(base+'/admin')).status,200);assert.equal((await fetch(base+'/api/checkout',{method:'POST'})).status,403);});
});
test('Storage failure leaves controlled HTTP service with no hidden seed fallback',async()=>{
 await running(valid,async()=>{throw Object.assign(new Error('private '+key),{code:'STORAGE_AUTH_FAILED',stage:'schema'});},async(app,base,logs)=>{
  assert.equal((await app.ready).state,'maintenance');assert.equal((await fetch(base+'/api/catalog')).status,503);assert.equal((await fetch(base+'/health')).status,503);assert.ok(!logs.join('').includes(key));assert.ok(logs.some(x=>x.includes('STORAGE_AUTH_FAILED')));
 });
});
test('Recovery pages preserve preview authentication and HEAD semantics',async()=>{
 await running({...valid,CATALOG_DRIVER:'bad',PREVIEW_USERNAME:'review',PREVIEW_PASSWORD:'test-only-private'},async()=>emptyRepo(),async(app,base)=>{
  await app.ready;assert.equal((await fetch(base+'/health')).status,401);
  const r=await fetch(base+'/health',{method:'HEAD',headers:{Authorization:'Basic '+Buffer.from('review:test-only-private').toString('base64')}});assert.equal(r.status,503);assert.equal(await r.text(),'');assert.equal(r.headers.get('cache-control'),'private, no-store');
 });
});
test('Listener responds while storage initialization is still pending',async()=>{
 let complete;const wait=new Promise(resolve=>{complete=resolve;});const app=await startApplication({env:valid,port:0,host:'127.0.0.1',open:()=>wait,log:()=>{}});
 try {const base=`http://127.0.0.1:${app.server.address().port}`;assert.equal((await fetch(base+'/health')).status,503);complete(emptyRepo());assert.equal((await app.ready).state,'ready');assert.equal((await fetch(base+'/health')).status,200);}finally{complete(emptyRepo());await app.close();}
});
