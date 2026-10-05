import {randomBytes} from 'node:crypto';
import {requireThat as need} from '../management/errors.mjs';
import {cookies,checkOrigin,readJSON,readBody,equal} from '../management/security.mjs';
import {checkoutConfig,sha,safeCheckoutError,uuidPattern} from './core.mjs';
import {RazorpayProvider} from './provider.mjs';
import {orderStore} from './store.mjs';
import {checkoutService} from './service.mjs';
import {checkoutPage,ordersPage,checkoutDenied} from './pages.mjs';
export const checkoutHeaders = {
 'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow',
 // Razorpay iframe owns its payment form and bank redirects. No eval/wildcards.
 'Content-Security-Policy':"default-src 'self'; script-src 'self' https://checkout.razorpay.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://checkout.razorpay.com https://cdn.razorpay.com; frame-src https://api.razorpay.com https://checkout.razorpay.com; connect-src 'self' https://api.razorpay.com https://checkout.razorpay.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
 'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
};
export function checkoutHTTP({management,config,store,provider,log=()=>{}}) {
 const service=checkoutService({repo:management.repo,config,store,provider,log});
 const cookieName=config.secure?'__Host-khaga_checkout':'khaga_checkout_local';
 const allowed=async req=>Boolean(await management.session(req));
 function guest(req){const value=cookies(req)[cookieName];return /^[a-f0-9]{64}$/.test(value||'')?value:null;}
 const csrf = value=>sha('khaga-checkout-csrf:'+value);
 async function limit(req,value){
  const repo=management.repo;
  const results=await Promise.all([repo.takeRate('checkout-global',240,60000),repo.takeRate('checkout-'+sha(value),40,60000),repo.takeRate('checkout-ip-'+sha(req.socket.remoteAddress||'unknown'),120,60000)]);
  need(results.every(Boolean),429,'RATE_LIMITED','Too many checkout requests. Wait one minute.');
 }
 async function handle(req,res,path){
  const webhook=path==='/api/payments/razorpay/webhook';
  if(!webhook && path!=='/checkout' && !path.startsWith('/checkout/orders/') && !path.startsWith('/api/checkout/') && path!=='/admin/orders' && path!=='/api/admin/orders')return false;
  const reply=(status,data,extra={})=>{const html=typeof data==='string';res.writeHead(status,{...checkoutHeaders,'Content-Type':html?'text/html; charset=utf-8':'application/json; charset=utf-8',...extra});res.end(req.method==='HEAD'?'':html?data:JSON.stringify(data));};
  try {
   if(webhook){
    need(req.method==='POST',405,'METHOD_NOT_ALLOWED','Use POST.');
    need(/^application\/json(?:;|$)/i.test(req.headers['content-type']||''),415,'JSON_REQUIRED','Use JSON.');
    const raw=await readBody(req,262144);
    reply(200,await service.webhook(raw,req.headers['x-razorpay-signature']));return true;
   }
   if(!await allowed(req)){
    if(!path.startsWith('/api/'))reply(401,checkoutDenied());else reply(401,{error:'ADMIN_LOGIN_REQUIRED',message:'Sign into KHAGA Admin to access the private test checkout.'});return true;
   }
   if(path==='/admin/orders') {need(['GET','HEAD'].includes(req.method),405,'METHOD_NOT_ALLOWED','Use GET.');reply(200,ordersPage());return true;}
   if(path==='/api/admin/orders'){
    need(req.method==='GET',405,'METHOD_NOT_ALLOWED','Use GET.');const query=new URL(req.url,config.origin).searchParams;
    const offset=Number(query.get('offset')||0);need(Number.isSafeInteger(offset)&&offset>=0&&offset<=10000,422,'INVALID_REQUEST','Invalid page.');
    reply(200,{mode:'test',orders:(await store.list(null,offset)).map(service.publicOrder),offset});return true;
   }
   if(path==='/checkout'||path.startsWith('/checkout/orders/')){
    need(['GET','HEAD'].includes(req.method),405,'METHOD_NOT_ALLOWED','Use GET.');const id=path==='/checkout'?'':path.slice('/checkout/orders/'.length);
    need(!id||uuidPattern.test(id),404,'ORDER_NOT_FOUND','Order not found.');reply(200,checkoutPage(id));return true;
   }
   if(path==='/api/checkout/session'){
    need(req.method==='GET',405,'METHOD_NOT_ALLOWED','Use GET.');let value=guest(req);const extra={};
    if(!value){value=randomBytes(32).toString('hex');extra['Set-Cookie']=`${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${config.secure?'; Secure':''}`;}
    const recent=(await store.list(sha(value),0)).slice(0,5).map(o=>({id:o.id,reference:service.publicOrder(o).reference,status:o.status}));
    reply(200,{mode:'test',csrf:csrf(value),recent},extra);return true;
   }
   const value=guest(req);need(value,401,'COOKIE_REQUIRED','Allow this site’s necessary cookies, then reopen checkout.');
   if(req.method==='POST'){checkOrigin(req,config);need(equal(req.headers['x-csrf-token']||'',csrf(value)),403,'CSRF_DENIED','Refresh checkout and try again.');await limit(req,value);}
   if(path==='/api/checkout/quote'){need(req.method==='POST',405,'METHOD_NOT_ALLOWED','Use POST.');reply(200,await service.quote((await readJSON(req)).items));return true;}
   if(path==='/api/checkout/orders'){
    need(req.method==='POST',405,'METHOD_NOT_ALLOWED','Use POST.');const result=await service.create(await readJSON(req),value);reply(result.order.status==='creating'||result.order.status==='creation_unknown'?202:200,result);return true;
   }
   const match=path.match(/^\/api\/checkout\/orders\/([a-f0-9-]{36})(?:\/(verify|reconcile))?$/);
   need(match,404,'ORDER_NOT_FOUND','Order not found.');
   if(!match[2]){need(req.method==='GET',405,'METHOD_NOT_ALLOWED','Use GET.');const order=await service.owned(match[1],value);reply(200,{order:service.publicOrder(order),payment:service.paymentOptions(order)});return true;}
   need(req.method==='POST',405,'METHOD_NOT_ALLOWED','Use POST.');
   reply(200,match[2]==='verify'?await service.verify(match[1],value,await readJSON(req)):await service.reconcile(match[1],value));return true;
  }catch(error){const safe=safeCheckoutError(error);reply(safe.status,{error:safe.error,message:safe.message},safe.status===429?{'Retry-After':'60'}:{});return true;}
 }
 return {handle,allowed,mode:'test',service};
}
export async function initializeCheckout(management,env,log=()=>{}){
 let config;try {
  config=checkoutConfig(env,management);if(!config)return null;
  const store=orderStore(management.repo);await store.ready();
  return checkoutHTTP({management,config,store,provider:new RazorpayProvider(config),log});
 }catch{
  // Never log provider payloads/config values or take down a working storefront.
  try{log(JSON.stringify({event:'KHAGA_CHECKOUT_SETUP',state:'disabled',message:'Test checkout setup did not pass. Review CHECKOUT_MODE, test keys, owner setup and migration 002. No live payments are enabled.'}));}catch{}return null;
 }
}
