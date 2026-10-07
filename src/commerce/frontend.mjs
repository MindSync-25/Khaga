import {checkoutPage,ordersPage} from '../checkout/pages.mjs';
import {checkoutHeaders} from '../checkout/http.mjs';
import {CommerceStore} from './store.mjs';
import {publicOrder} from './model.mjs';
export function commerceFrontend(base,management){
 if(!base)return null;
 const url=new URL(base);
 if(url.protocol!=='https:'||url.origin!==base||url.username||url.password)throw new Error('COMMERCE_API_BASE_URL must be an exact HTTPS origin.');
 return {async handle(req,res,path){
  if(!['/checkout','/admin/orders','/api/admin/orders'].includes(path)&&!/^\/checkout\/orders\/[a-f0-9-]{36}$/.test(path))return false;
  const reply=(status,data)=>{res.writeHead(status,{...checkoutHeaders,'Content-Security-Policy':checkoutHeaders['Content-Security-Policy'].replace("connect-src 'self'",`connect-src 'self' ${base}`),'Content-Type':typeof data==='string'?'text/html; charset=utf-8':'application/json'});res.end(req.method==='HEAD'?'':typeof data==='string'?data:JSON.stringify(data));};
  if(path.startsWith('/admin')||path.startsWith('/api/admin')){
   if(!management||!await management.session(req)){reply(401,{error:'ADMIN_LOGIN_REQUIRED',message:'Sign in to KHAGA Admin.'});return true;}
   if(req.method!=='GET'&&req.method!=='HEAD'){reply(405,{error:'METHOD_NOT_ALLOWED'});return true;}
   if(path==='/admin/orders'){reply(200,ordersPage().replace('PRIVATE TEST CHECKOUT · NO REAL MONEY · NOT A CUSTOMER ORDER','KHAGA / PROTECTED ORDERS').replace('KHAGA · Test transactions only. Do not enter real card details or customer addresses.','KHAGA · Protected order records.').replace('Test orders.</h1>','Orders.</h1>').replace('These are simulated payments, not orders to fulfil.','Filter Live sales, commerce tests and preserved legacy tests.').replace('<div id="orders-list"','<label>Records <select id="orders-mode"><option value="test">Commerce Test</option><option value="live">Live sales</option><option value="legacy">Legacy tests</option></select></label><div id="orders-list"'));return true;}
   const params=new URL(req.url,base).searchParams,mode=params.get('mode')||'test',offset=Number(params.get('offset')||0);
   if(!['test','live','legacy'].includes(mode)||!Number.isInteger(offset)||offset<0||offset>10000){reply(422,{error:'INVALID_REQUEST'});return true;}
   try{
    const rows=mode==='legacy'?await management.repo.rpc('checkout_list',{p_guest:null,p_offset:offset}):await new CommerceStore(management.repo,mode).list(null,offset);
    reply(200,{mode,offset,orders:rows.map(o=>publicOrder({...o,mode:o.mode||'test'}))});
   }catch{reply(503,{message:'Orders are temporarily unavailable.'});}return true;
  }
  if(!['GET','HEAD'].includes(req.method)){reply(405,{error:'METHOD_NOT_ALLOWED'});return true;}
  let html=checkoutPage(path==='/checkout'?'':path.split('/').pop());
  html=html.replace('<head>','<head><meta name="commerce-api-base" content="'+base+'">')
   .replace('PRIVATE TEST CHECKOUT · NO REAL MONEY · NOT A CUSTOMER ORDER','SECURE CHECKOUT · CHECKING PAYMENT MODE')
   .replace('YOUR SELECTION / TEST MODE','YOUR SELECTION').replace('Checkout — test mode','Checkout')
   .replace('Review your selection and try the complete payment flow. Use test contact and address details.','Review your selection, delivery details and total before payment.')
   .replace('India — test checkout','India').replace('This private test saves','Checkout saves')
   .replace('02 / SECURE TEST PAYMENT','02 / SECURE PAYMENT').replace('Pay in test mode →','Continue to payment →')
   .replace('Prices, taxes and free shipping here are for simulation only. No stock is reserved or dispatched.','Free shipping to eligible delivery addresses. The server confirms pricing and availability before payment.')
   .replace('This test checkout requires','Checkout requires').replace('KHAGA · Test transactions only. Do not enter real card details or customer addresses.','KHAGA · Payment details are handled securely by Razorpay.');
  reply(200,html);return true;
 }};
}
