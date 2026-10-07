import {randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
import {sha} from '../checkout/core.mjs';
import {requireThat as need,HttpError} from '../management/errors.mjs';
const token=(value,secret)=>createHmac('sha256',secret).update(value).digest('hex');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const cookieName=mode=>'__Host-khaga_guest_'+mode;
function guest(event,config){
 const text=(event.cookies||[]).join('; '),values=text.split(/;\s*/).filter(x=>x.startsWith(cookieName(config.mode)+'='));
 if(values.length!==1)return null;
 const value=values[0].slice(values[0].indexOf('=')+1),parts=value.split('.');
 if(parts.length!==3||!/^\d{13}$/.test(parts[1])||! /^[a-f0-9]{64}$/.test(parts[0])||Number(parts[1])<=Date.now()||!equal(parts[2],token(config.mode+':'+parts[0]+'.'+parts[1],config.sessionSecret)))return null;
 return value;
}
export function handlerFor(kind,getRuntime){return async(event,context={})=>{
 const reference='REQ-'+sha(String(context.awsRequestId||randomBytes(12).toString('hex'))).slice(0,16);
 let headers={'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'},cookies=[];
 const reply=(statusCode,value)=>({statusCode,headers,cookies,body:JSON.stringify(value)});
 try{
  const {config,repo,store,provider,service}=await getRuntime();
  // IAM-only direct invocation; never reachable via an HTTP route/body.
  if(!event.requestContext && event.operatorAction==='razorpay-auth-check'&&kind==='purchase'){
   try{await provider.request('/orders?count=1');return {ok:true,mode:config.mode,requestId:context.awsRequestId};}
   catch(e){return {ok:false,code:e.code||'CHECK_FAILED',httpStatus:e.httpStatus||null,requestId:context.awsRequestId};}
  }
  need(event.version==='2.0'&&event.requestContext?.http,400,'INVALID_REQUEST','HTTP API v2 is required.');
  const h=Object.fromEntries(Object.entries(event.headers||{}).map(([k,v])=>[k.toLowerCase(),v]));
  const method=event.requestContext.http.method,path=event.rawPath;
  const webhook=kind==='confirm'&&method==='POST'&&path==='/payments/razorpay/webhook';
  if(config.origins.includes(h.origin)){headers['Access-Control-Allow-Origin']=h.origin;headers['Access-Control-Allow-Credentials']='true';}
  if(!webhook)need(config.origins.includes(h.origin),403,'ORIGIN_DENIED','Open checkout from the KHAGA storefront.');
  if(method==='OPTIONS'){headers['Access-Control-Allow-Methods']='GET,POST,OPTIONS';headers['Access-Control-Allow-Headers']='content-type,x-csrf-token';return reply(204,{});}
  need(!h['content-encoding'],415,'INVALID_REQUEST','Encoded requests are not supported.');
  need(typeof event.body==='string'||event.body==null,400,'INVALID_JSON','Invalid body.');
  need((event.body?.length||0)<=350000,413,'BODY_TOO_LARGE','Request is too large.');
  const raw=Buffer.from(event.body||'',event.isBase64Encoded?'base64':'utf8');
  need(raw.length<=262144,413,'BODY_TOO_LARGE','Request is too large.');
  if(webhook)return reply(200,await service.webhook(raw,h['x-razorpay-signature'],h['x-razorpay-event-id']));
  const limited=await repo.takeRate('commerce-ip-'+sha(config.mode+':'+(event.requestContext.http.sourceIp||'unknown')),120,60000);
  need(limited,429,'RATE_LIMITED','Wait one minute before retrying.');
  let value=guest(event,config);
  if(kind==='purchase'&&method==='POST'&&path==='/checkout/session'){
   if(!value){const unsigned=randomBytes(32).toString('hex')+'.'+(Date.now()+7*86400000);value=unsigned+'.'+token(config.mode+':'+unsigned,config.sessionSecret);cookies=[`${cookieName(config.mode)}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=604800`];}
   const recent=(await store.list(sha(value))).slice(0,5).map(o=>({id:o.id,reference:service.publicOrder(o).reference,status:o.status}));
   return reply(200,{mode:config.mode,csrf:token('csrf:'+value,config.sessionSecret),recent});
  }
  need(value,401,'COOKIE_REQUIRED','Allow necessary cookies and reload checkout on this browser.');
  if(method==='POST')need(equal(h['x-csrf-token'],token('csrf:'+value,config.sessionSecret)),403,'CSRF_DENIED','Refresh checkout and try again.');
  let input={};
  if(method==='POST'){
   need(/^application\/json(?:;|$)/i.test(h['content-type']||''),415,'JSON_REQUIRED','Use JSON.');
   try{input=JSON.parse(raw.toString('utf8'));}catch{need(false,400,'INVALID_JSON','Invalid JSON.');}
   need(input&&typeof input==='object'&&!Array.isArray(input),422,'INVALID_REQUEST','Invalid request.');
  }
  if(kind==='purchase'&&method==='POST'&&path==='/checkout/quote')return reply(200,await service.quote(input.items,input.customer));
  if(kind==='purchase'&&method==='POST'&&path==='/purchase')return reply(200,await service.create(input,value));
  if(kind==='confirm'&&method==='POST'&&path==='/confirm-purchase')return reply(200,await service.verify(input.id,value,input));
  const match=path.match(/^\/orders\/([a-f0-9-]{36})(\/reconcile)?$/);
  if(kind==='confirm'&&match){
   if(method==='GET'&&!match[2])return reply(200,{order:service.publicOrder(await service.owned(match[1],value)),payment:null});
   if(method==='POST'&&match[2])return reply(200,await service.reconcile(match[1],value));
  }
  return reply(404,{error:'NOT_FOUND',message:'Route not found.',reference});
 }catch(e){
  // Never forward database/provider bodies, config, stack traces or customer data.
  const messages={EDIT_CONFLICT:'Stock, price or checkout status changed. Reload and open any recent pending order.',STORAGE_UNAVAILABLE:'Order storage is unavailable. Keep your reference and check status later.'};
  const safe=e instanceof HttpError&&!e.code?.startsWith('STORAGE_');
  return reply(safe?e.status:503,{error:safe?e.code:'CHECKOUT_UNAVAILABLE',message:messages[e.code]||(safe&&!e.code?.startsWith('PAYMENT_')?e.message:'Payment verification is unavailable. Keep your saved reference and check status later.'),reference});
 }
};}
