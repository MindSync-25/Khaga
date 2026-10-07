// Local integration fixture: real HTTPS, native handlers and PostgreSQL; fake Razorpay only.
import {createServer} from 'node:https';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import {createApp} from '../../src/app.mjs';
import {handlerFor} from '../../src/commerce/http.mjs';
import {commerceService} from '../../src/commerce/service.mjs';
import {CommerceStore} from '../../src/commerce/store.mjs';
import {setup,LocalRepository,seedProduct,seedPolicy,fixturePinLookup} from './local-postgres.mjs';
await setup();await seedPolicy();await seedProduct('browser-fixture',1000);
const repo=new LocalRepository(),store=new CommerceStore(repo,'test');
const config={purchasesEnabled:true,mode:'test',keyId:'rzp_test_fixture',keySecret:'local-fixture-secret',webhookSecret:'w'.repeat(32),sessionSecret:'s'.repeat(32),origins:['https://shop.khaga.test:55440']};
const gateway=new Map(),payments=new Map();let creates=0;
const provider={async create(o){creates++;const id='order_'+o.id.replaceAll('-','');gateway.set(id,{id,receipt:o.id,amount:o.body.quote.total,currency:'INR',status:'created',notes:{khaga_order_id:o.id,khaga_mode:'test'}});return id;},async findOrder(o){return [...gateway.values()].find(x=>x.receipt===o.id)||null;},async order(o){return gateway.get(o.provider_id);},async payments(id){return [...payments.values()].filter(p=>p.order_id===id);},async payment(id){return payments.get(id);},async request(path){return gateway.get(path.split('/').pop());}};
const service=commerceService({repo,store,provider,config,pinLookup:fixturePinLookup}),runtime=async()=>({config,repo,store,provider,service});
const purchase=handlerFor('purchase',runtime),confirm=handlerFor('confirm',runtime);
const app=createApp({management:{repo,session:async()=>null,handle:async()=>false},commerceApiBase:'https://api.khaga.test:55441'});
const tls={key:readFileSync('/tmp/khaga-commerce-key.pem'),cert:readFileSync('/tmp/khaga-commerce-cert.pem')};
const site=createServer(tls,(req,res)=>app.emit('request',req,res));
const api=createServer(tls,async(req,res)=>{
 const chunks=[];for await(const c of req)chunks.push(c);const raw=Buffer.concat(chunks);
 // Explicit test-only controls, solely in this fixture. No external calls.
 if(req.url==='/__fixture/stats'){res.end(JSON.stringify({creates}));return;}
 if(req.url==='/__fixture/capture'){
  const {orderId,status='captured',webhook=false}=JSON.parse(raw);const order=gateway.get(orderId),id='pay_'+orderId.slice(6);
  const p={id,order_id:orderId,amount:order.amount,currency:'INR',status,captured:status==='captured'};payments.set(id,p);
  if(webhook){const bytes=Buffer.from(JSON.stringify({event:'payment.captured',payload:{payment:{entity:p}}}));await service.webhook(bytes,createHmac('sha256',config.webhookSecret).update(bytes).digest('hex'),'evt-'+id);}
  res.end(JSON.stringify({razorpay_order_id:orderId,razorpay_payment_id:id,razorpay_signature:createHmac('sha256',config.keySecret).update(orderId+'|'+id).digest('hex')}));return;
 }
 const event={version:'2.0',rawPath:req.url,headers:req.headers,cookies:req.headers.cookie?[req.headers.cookie]:[],body:raw.toString('base64'),isBase64Encoded:true,requestContext:{http:{method:req.method,sourceIp:'127.0.0.1'}}};
 const fn=['/checkout/session','/checkout/quote','/purchase'].includes(req.url)?purchase:confirm;
 const r=await fn(event);res.writeHead(r.statusCode,{...r.headers,...(r.cookies.length?{'Set-Cookie':r.cookies}:{})});res.end(r.body);
});
site.listen(55440,'127.0.0.1');api.listen(55441,'127.0.0.1');console.log('Browser fixture ready on HTTPS 55440/55441');
