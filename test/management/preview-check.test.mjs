import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {schedulePreviewCheck} from '../../src/management/preview-check.mjs';
import {checkManagementSetup} from '../../src/management/diagnostics.mjs';
import {SupabaseRepository} from '../../src/management/repository.mjs';
import {startApplication} from '../../src/bootstrap.mjs';

// Fixtures only. No real account, password, or provider credentials are used.
const staged = {
  APP_ORIGIN:'https://khaga.example', SUPABASE_URL:'https://example.supabase.co',
  SUPABASE_SECRET_KEY:'sb_secret_test-only-not-a-real-provider-key',
  ADMIN_EMAIL:'owner@example.test',
  ADMIN_PASSWORD_HASH:'scrypt$65536$8$2$'+'a'.repeat(32)+'$'+'b'.repeat(128),
};
const fakeApp = (startup={state:'ready',catalogue:'preview',admin:'disabled'}) => ({server:{listening:true},ready:Promise.resolve(startup)});
const pass = {ok:true,checks:['configuration','schema-access','private-media-bucket']};
const pending = () => {let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const tick = () => new Promise(resolve=>setImmediate(resolve));
function assertRedacted(logs) {
  const text=logs.join('\n');
  for (const value of Object.values(staged)) assert.ok(!text.includes(value));
  assert.ok(!text.includes('private-provider-payload'));
}

test('No staged connection skips all provider work',async()=>{
  let calls=0;const logs=[];
  const result=await schedulePreviewCheck(fakeApp(),{env:{},check:async()=>{calls++;},log:m=>logs.push(m)});
  assert.equal(result.state,'skipped');assert.equal(calls,0);assert.equal(logs.length,1);
});
test('Managed, maintenance, and closed startup do not run preview diagnostics',async()=>{
  for(const startup of [{state:'ready',catalogue:'supabase'},{state:'maintenance'},{state:'closed'}]){
    let calls=0;const logs=[];
    const result=await schedulePreviewCheck(fakeApp(startup),{env:staged,check:async()=>{calls++;},log:m=>logs.push(m)});
    assert.equal(result.skipped,true);assert.equal(calls,0);assert.equal(logs.length,0);
  }
});
test('Waits for preview readiness and is deduplicated per server instance',async()=>{
  const ready=pending(),app={server:{listening:true},ready:ready.promise};let calls=0;const logs=[];
  const options={env:staged,check:async()=>{calls++;return pass;},log:m=>logs.push(m)};
  const a=schedulePreviewCheck(app,options),b=schedulePreviewCheck(app,options);
  assert.equal(a,b);await tick();assert.equal(calls,0);
  ready.resolve({state:'ready',catalogue:'preview'});assert.equal((await a).state,'passed');
  assert.equal(calls,1);await schedulePreviewCheck(app,options);assert.equal(calls,1);
  assert.deepEqual(logs.map(s=>JSON.parse(s).state),['running','passed']);assertRedacted(logs);
});
test('Shutdown before readiness prevents any staged check',async()=>{
  const ready=pending(),app={server:{listening:true},ready:ready.promise};let calls=0;
  const task=schedulePreviewCheck(app,{env:staged,check:async()=>{calls++;return pass;},log:()=>{}});
  app.server.listening=false;ready.resolve({state:'ready',catalogue:'preview'});
  assert.equal((await task).skipped,true);assert.equal(calls,0);
});
test('Missing or malformed settings give field guidance without provider requests',async()=>{
  let calls=0;const logs=[];
  const env=Object.freeze({...staged,SUPABASE_SECRET_KEY:'sb_publishable_invalid-fixture',ADMIN_PASSWORD_HASH:'private-provider-payload'});
  const check=e=>checkManagementSetup(e,async()=>{calls++;});
  const result=await schedulePreviewCheck(fakeApp(),{env,check,log:m=>logs.push(m)});
  assert.equal(result.state,'failed');assert.equal(calls,0);
  assert.ok(result.issues.some(i=>i.field==='SUPABASE_SECRET_KEY'));
  assert.ok(result.issues.some(i=>i.field==='ADMIN_PASSWORD_HASH'));assertRedacted(logs);
});
test('Read-only check uses only status RPC and bucket GET, without changing live flags',async()=>{
  const env=Object.freeze({...staged,CATALOG_DRIVER:'preview',ADMIN_ENABLED:'false'});
  const calls=[],logs=[];let closes=0;
  const fetcher=async(url,options)=>{
    calls.push({path:new URL(url).pathname,method:options.method});
    assert.ok(options.signal instanceof AbortSignal);assert.equal(options.redirect,'error');
    assert.equal(options.headers.apikey,staged.SUPABASE_SECRET_KEY);
    if(url.endsWith('/rest/v1/rpc/khaga_status')&&options.method==='POST'){
      assert.equal(options.body,'{}');return Response.json({schema:1});
    }
    if(url.endsWith('/storage/v1/bucket/khaga-product-media')&&options.method==='GET')return Response.json({public:false});
    assert.fail('Unexpected database or storage operation');
  };
  const check=e=>checkManagementSetup(e,async config=>{
    const repo=new SupabaseRepository(config,fetcher);repo.close=async()=>{closes++;};await repo.ready();return repo;
  });
  const result=await schedulePreviewCheck(fakeApp(),{env,check,log:m=>logs.push(m)});
  assert.equal(result.ok,true);assert.equal(closes,1);assert.equal(calls.length,2);
  assert.equal(env.CATALOG_DRIVER,'preview');assert.equal(env.ADMIN_ENABLED,'false');assertRedacted(logs);
});
test('Authentication failure is classified once without raw provider data or retries',async()=>{
  let calls=0;const logs=[];
  const check=e=>checkManagementSetup(e,async config=>{
    const repo=new SupabaseRepository(config,async()=>{calls++;return new Response('private-provider-payload',{status:401});});
    await repo.ready();return repo;
  });
  const result=await schedulePreviewCheck(fakeApp(),{env:staged,check,log:m=>logs.push(m)});
  assert.equal(result.state,'failed');assert.equal(result.code,'STORAGE_AUTH_FAILED');assert.equal(result.stage,'schema');
  assert.equal(calls,1);assertRedacted(logs);
});
test('Public-bucket diagnostic reports failure without changing its privacy',async()=>{
  const logs=[],calls=[];
  const check=e=>checkManagementSetup(e,async config=>{
    const repo=new SupabaseRepository(config,async(url,opts)=>{calls.push(opts.method);return Response.json(url.includes('/rpc/')?{schema:1}:{public:true});});
    await repo.ready();return repo;
  });
  const result=await schedulePreviewCheck(fakeApp(),{env:staged,check,log:m=>logs.push(m)});
  assert.equal(result.code,'PRIVATE_BUCKET_REQUIRED');assert.deepEqual(calls,['POST','GET']);assertRedacted(logs);
});
test('Unexpected exceptions and rejected readiness cannot leak secrets or reject the task',async()=>{
  const logs=[];const failure=new Error(staged.SUPABASE_SECRET_KEY+' private-provider-payload');
  for(const app of [fakeApp(),{server:{listening:true},ready:Promise.reject(failure)}]){
    const result=await schedulePreviewCheck(app,{env:staged,check:async()=>{throw failure;},log:m=>logs.push(m)});
    assert.equal(result.ok,false);assert.equal(result.code,'STARTUP_CHECK_FAILED');
  }
  assertRedacted(logs);
});
test('Logging failure is isolated from both the preview and the check result',async()=>{
  const result=await schedulePreviewCheck(fakeApp(),{env:staged,check:async()=>pass,log:()=>{throw new Error('logging unavailable');}});
  assert.equal(result.ok,true);
});
test('Actual HTTP preview keeps serving while check is pending and after it fails',async()=>{
  const deferred=pending();const logs=[];
  const env={...staged};let storageOpens=0;
  const app=await startApplication({env,port:0,host:'127.0.0.1',open:async()=>{storageOpens++;throw new Error('No live storage in preview');},log:()=>{}});
  const task=schedulePreviewCheck(app,{env,check:()=>deferred.promise,log:m=>logs.push(m)});
  try{
    await app.ready;const base=`http://127.0.0.1:${app.server.address().port}`;
    for(let phase=0;phase<2;phase++){
      assert.equal((await fetch(base+'/')).status,200);
      const health=await(await fetch(base+'/health')).json();assert.equal(health.status,'ok');assert.equal(health.mode,'preview');
      assert.equal((await fetch(base+'/api/catalog')).status,200);
      assert.equal((await fetch(base+'/admin')).status,503);
      assert.equal((await fetch(base+'/api/checkout',{method:'POST'})).status,403);
      if(!phase){deferred.resolve({ok:false,code:'STORAGE_AUTH_FAILED'});await task;}
    }
    assert.equal(storageOpens,0);assert.equal(env.CATALOG_DRIVER,undefined);assert.equal(env.ADMIN_ENABLED,undefined);
    assertRedacted(logs);
  }finally{deferred.resolve(pass);await task;await app.close();}
});
test('Successful read-only check does not enable admin or import products',async()=>{
  const env={...staged};const app=await startApplication({env,port:0,host:'127.0.0.1',log:()=>{}});
  try{
    const result=await schedulePreviewCheck(app,{env,check:e=>checkManagementSetup(e,async()=>({close:async()=>{}})),log:()=>{}});
    assert.equal(result.ok,true);
    const base=`http://127.0.0.1:${app.server.address().port}`;
    assert.equal((await fetch(base+'/admin')).status,503);
    const snapshot=await(await fetch(base+'/api/catalog')).json();assert.equal(snapshot.managed,false);assert.equal(snapshot.products.length,7);
  }finally{await app.close();}
});
test('Hostinger entry invokes the check separately without gating startup or changing process exit',()=>{
  const source=readFileSync(new URL('../../server.mjs',import.meta.url),'utf8');
  assert.match(source,/void schedulePreviewCheck\(app\);/);
  assert.ok(!source.includes('await schedulePreviewCheck'));
});
