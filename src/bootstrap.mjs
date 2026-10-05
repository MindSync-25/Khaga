import {createServer} from 'node:http';
import {once} from 'node:events';
import {managementConfig} from './management/config.mjs';
import {openRepository} from './management/repository.mjs';
import {managementService} from './management/http.mjs';
import {safeDiagnostic} from './management/diagnostics.mjs';
import {equal} from './management/security.mjs';
import {createApp} from './app.mjs';
import {brandSvg} from './artwork.mjs';
import {initializeCheckout} from './checkout/http.mjs';

const maintenanceHTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>KHAGA — Temporarily unavailable</title></head><body style="margin:0;background:#f3efe7;color:#181816;font-family:system-ui,sans-serif"><main style="max-width:40rem;margin:12vh auto;padding:2rem"><img src="/brand/emblem.svg" width="96" height="80" alt="KHAGA"><h1>We’ll be back shortly.</h1><p>The collection is temporarily unavailable. Please try again later.</p><p>No orders or payments are being accepted.</p></main></body></html>`;
const privateHeaders = {
  'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff',
  'X-Frame-Options':'DENY', 'X-Robots-Tag':'noindex, nofollow, noarchive',
  'Content-Security-Policy':"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'X-KHAGA-Startup-Patch':'1',
};
function maintenanceResponse(req,res,env) {
  const send=(status,body,type='application/json; charset=utf-8',extra={})=>{
    res.writeHead(status,{...privateHeaders,'Content-Type':type,...extra});
    res.end(req.method==='HEAD'?'':body);
  };
  // Preserve preview authentication even when management cannot initialize.
  const user=env.PREVIEW_USERNAME||'',password=env.PREVIEW_PASSWORD||'';
  if(Boolean(user)!==Boolean(password))return send(503,'{"error":"PREVIEW_UNAVAILABLE"}');
  if(user && !equal(req.headers.authorization||'','Basic '+Buffer.from(user+':'+password).toString('base64')))return send(401,'{"error":"AUTHENTICATION_REQUIRED"}',undefined,{'WWW-Authenticate':'Basic realm="KHAGA preview", charset="UTF-8"'});
  let path;
  try{path=decodeURIComponent(new URL(req.url||'/','http://localhost').pathname);}catch{return send(400,'{"error":"INVALID_URL"}');}
  if(path==='/api/checkout')return send(403,'{"error":"PREVIEW_ONLY","message":"Orders and payments are not enabled."}');
  if(!['GET','HEAD'].includes(req.method))return send(503,'{"error":"SERVICE_NOT_READY"}',undefined,{'Retry-After':'30'});
  if(path==='/health'||path==='/api/health')return send(503,'{"status":"degraded","app":"khaga-storefront","version":"0.5.0","mode":"maintenance"}',undefined,{'Retry-After':'30'});
  if(path==='/brand/emblem.svg')return send(200,brandSvg({emblem:true,wordmark:false}),'image/svg+xml');
  if(path==='/robots.txt')return send(200,'User-agent: *\nDisallow: /\n','text/plain');
  if(path==='/admin'||path==='/admin/'||path.startsWith('/api/'))return send(503,'{"error":"SERVICE_NOT_READY","message":"Setup has not completed. The owner can review the KHAGA runtime diagnostics."}',undefined,{'Retry-After':'30'});
  return send(503,maintenanceHTML,'text/html; charset=utf-8',{'Retry-After':'30'});
}

// Bind first, then initialize dependencies. Bad setup must not crash the process.
// A configured persistent-store failure NEVER falls back to seed products.
export async function startApplication({env=process.env,port=Number(env.PORT||3000),host='0.0.0.0',open=openRepository,log=console.info}={}) {
  if(!Number.isInteger(port)||port<0||port>65535)throw new Error('PORT must be an integer from 0 through 65535.');
  let handler=null,repo=null,closed=false;
  const emit=(state,extra={})=>{try{log(JSON.stringify({event:'KHAGA_STARTUP',patch:'startup-checks-1',state,...extra}));}catch{}};
  const server=createServer((req,res)=>{
    res.setHeader('X-KHAGA-Startup-Patch','1');
    if(handler)handler.emit('request',req,res);else maintenanceResponse(req,res,env);
  });
  server.listen(port,host);
  await once(server,'listening');
  emit('listening');
  const ready=(async()=>{
    try {
      // Validate/connect storage separately from owner credentials. A malformed
      // owner hash must close admin, not take a healthy published catalogue down.
      const storeConfig=managementConfig({...env,ADMIN_ENABLED:'false'});
      let config=storeConfig;
      try{config=managementConfig(env);}catch(error){emit('admin-disabled',safeDiagnostic(error));}
      if(storeConfig.driver!=='preview')repo=await open(storeConfig);
      if(closed){try{await repo?.close();}catch{}return {state:'closed'};}
      const management=repo?managementService(repo,config):null;
      const commerce=await initializeCheckout(management,env,log);
      if(closed){try{await repo?.close();}catch{}return {state:'closed'};}
      handler=createApp({username:env.PREVIEW_USERNAME||'',password:env.PREVIEW_PASSWORD||'',management,commerce});
      const result={state:'ready',catalogue:storeConfig.driver,admin:config.enabled?'enabled':'disabled'};
      emit(result.state,{catalogue:result.catalogue,admin:result.admin});
      return result;
    } catch(error) {
      try{await repo?.close();}catch{}
      repo=null;
      const diagnostic=safeDiagnostic(error);emit('maintenance',diagnostic);
      return {state:'maintenance',...diagnostic};
    }
  })();
  async function close(){
    closed=true;
    await new Promise(resolve=>server.close(resolve));
    await ready;
    try{await repo?.close();}catch{}
    repo=null;
  }
  return {server,ready,close};
}
