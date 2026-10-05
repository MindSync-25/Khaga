"""Offline UI QA. Real templates/scripts; simulated fetch/storage/Razorpay.
Does NOT validate provider calls, native cookies, network navigation or CSP.
Start browser-fixture.mjs locally first. Images/CSS embedded to avoid network.
"""
import base64, json, os, re
from pathlib import Path
import requests
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(os.environ.get('KHAGA_QA_OUTPUT','/mnt/data/khaga-checkout-qa'));OUT.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('KHAGA_QA_URL','http://127.0.0.1:3145')
s=requests.Session();r=s.post(BASE+'/api/admin/login',headers={'Origin':BASE},json={'email':'owner@example.test','password':'local-browser-qa-password-only'});r.raise_for_status()
html=s.get(BASE+'/checkout').text
html=re.sub(r'<script defer[^>]+></script>','',html)
html=re.sub(r'<link rel="stylesheet"[^>]+>',lambda _: '<style>'+ (ROOT/'public/checkout.css').read_text()+'</style>',html)
for path in ['/brand/wordmark.svg','/brand/emblem.svg']:
 data=base64.b64encode(s.get(BASE+path).content).decode();html=html.replace(path,'data:image/svg+xml;base64,'+data)
bootstrap=r"""
const initialBag={version:1,items:[{product:'origin-tee',colour:'ivory',size:'M',quantity:1}]};
function memory(initial={}){const map=new Map(Object.entries(initial));return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};}
Object.defineProperty(window,'localStorage',{value:memory({'khaga.preview.bag.v1':JSON.stringify(initialBag)}),configurable:true});
Object.defineProperty(window,'sessionStorage',{value:memory(),configurable:true});
window.__errors=[];window.__calls=[];window.__paymentAction='success';window.__creates=0;
const quote={mode:'test',currency:'INR',items:[{...initialBag.items[0],name:'Origin Tee',colourName:'Ivory White',unitPrice:299000}],subtotal:299000,shipping:0,total:299000,taxNote:'Illustrative prices. No additional tax or shipping is applied in this test.',hash:'fixturehash'};
const id='12345678-1234-1234-1234-123456789abc';let record=null;
window.fetch=async(path,options={})=>{__calls.push(String(path));const input=options.body?JSON.parse(options.body):null;
 if(path==='/api/checkout/session')return Response.json({mode:'test',csrf:'fixturecsrf',recent:[]});
 if(path==='/api/checkout/quote')return Response.json(quote);
 if(path==='/api/checkout/orders'){__creates++;record={order:{id,reference:'KHAGA-T-12345678',status:'payment_pending',mode:'test',quote,customer:input.customer,createdAt:'2026-10-05T10:00:00Z'},payment:{keyId:'rzp_test_fixture123',orderId:'order_fixture',currency:'INR',amount:299000}};if(__paymentAction==='unknown'){record.order.status='creation_unknown';record.payment=null;record.issue={code:'PAYMENT_RESPONSE_INVALID',message:'The Razorpay response could not be verified.'};}return Response.json(record);}
 if(String(path).endsWith('/verify')){if(__paymentAction!=='pending'){record.order.status='paid';record.payment=null;}return Response.json(record);}
 if(String(path).endsWith('/reconcile')){
  if(__paymentAction==='auth-failure')return Response.json({error:'PAYMENT_AUTH_FAILED',message:'Razorpay rejected the server credentials. Verify the matching Test pair.'},{status:503});
  if(__paymentAction==='no-match')return Response.json({error:'PAYMENT_ORDER_NOT_FOUND',message:'No matching Razorpay order was found. No new order was created.'},{status:503});
  if(__paymentAction==='recover'){record.order.status='payment_pending';record.payment={keyId:'rzp_test_fixture123',orderId:'order_fixture',currency:'INR',amount:299000};delete record.issue;return Response.json(record);}
  if(__paymentAction!=='cancel'){record.order.status='paid';record.payment=null;}return Response.json(record);
 }
 if(String(path).includes('/api/checkout/orders/'))return Response.json(record);
 throw Error('Unexpected offline request '+path);
};
window.Razorpay=class{constructor(options){this.options=options;}on(){}open(){if(__paymentAction==='cancel'){this.options.modal.ondismiss();return;}this.options.handler({razorpay_order_id:'order_fixture',razorpay_payment_id:'pay_fixture',razorpay_signature:'a'.repeat(64)});}};
"""
checks=[]
def passed(name): checks.append(name);print('PASS',name,flush=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':1100});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def reset(mode='success'):
  global page
  page.close();page=browser.new_page(viewport={'width':1440,'height':1100});page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(html,wait_until='domcontentloaded');page.evaluate('() => {'+bootstrap+'}');page.evaluate("window.__paymentAction="+json.dumps(mode));page.add_script_tag(content=(ROOT/'public/checkout.js').read_text());page.wait_for_function("!document.getElementById('address-fields').disabled")
 def fill():
  for name,value in {'name':'Test Buyer','email':'buyer@example.test','phone':'9000000000','line1':'123 Test Street','city':'Test City','state':'Karnataka','postalCode':'560001'}.items():page.locator('[name="'+name+'"]').fill(value)
 def review():fill();page.locator('#checkout-form button').click();page.wait_for_selector('#payment-step:not([hidden])')
 reset();assert '2,990' in page.locator('#checkout-summary').inner_text();passed('Published quote appears')
 page.locator('#checkout-form button').click();assert page.locator('#checkout-form').is_visible();assert page.evaluate('__creates')==0;passed('Invalid empty address cannot submit')
 fill();page.screenshot(path=str(OUT/'checkout-desktop.png'),full_page=True)
 for w in [360,390,768,1440]:
  page.set_viewport_size({'width':w,'height':1000});assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1');passed('Layout fits '+str(w))
  if w==390:page.screenshot(path=str(OUT/'checkout-mobile.png'),full_page=True)
 page.locator('#checkout-form button').click();page.wait_for_selector('#payment-step:not([hidden])');assert page.evaluate('__creates')==0;passed('Review alone does not create payment')
 page.locator('#edit-button').click();assert page.locator('#checkout-form').is_visible();assert page.locator('[name="name"]').input_value()=='Test Buyer';passed('Edit preserves address')
 page.locator('#checkout-form button').click();page.locator('#pay-button').click();page.wait_for_selector('[data-check-status]');assert 'Your test is complete' in page.locator('#order-result').inner_text();passed('Server-confirmed result renders test confirmation')
 assert page.evaluate("JSON.parse(localStorage.getItem('khaga.preview.bag.v1')).items.length")==0;passed('Verified payment removes purchased lines from bag')
 page.screenshot(path=str(OUT/'checkout-confirmation.png'),full_page=True)
 reset('cancel');review();page.locator('#pay-button').click();page.wait_for_function("document.querySelector('#checkout-error').textContent.includes('Payment window closed')");assert 'Payment window closed' in page.locator('#checkout-error').inner_text();assert page.evaluate("JSON.parse(localStorage.getItem('khaga.preview.bag.v1')).items.length")==1;passed('Cancel retains bag and saved reference')
 page.locator('[data-resume-payment]').click();assert page.evaluate('__creates')==1;passed('Resume reuses saved gateway order')
 reset('pending');review();page.locator('#pay-button').click();page.wait_for_selector('[data-check-status]');assert 'not confirmed' in page.locator('#order-result').inner_text();assert page.evaluate("JSON.parse(localStorage.getItem('khaga.preview.bag.v1')).items.length")==1;passed('Pending payment is not shown as paid')
 page.locator('[data-check-status]').click();page.wait_for_function("document.querySelector('#order-result').textContent.includes('Your test is complete')");passed('Explicit reconciliation updates confirmation')
 reset('unknown');review();page.locator('#pay-button').click();page.wait_for_selector('[data-check-status]');assert 'Order creation needs review' in page.locator('#order-result').inner_text();assert 'response could not be verified' in page.locator('#order-result').inner_text();assert page.locator('[data-resume-payment]').count()==0;passed('Uncertain create shows truthful state and cause without resume')
 assert page.evaluate("JSON.parse(localStorage.getItem('khaga.preview.bag.v1')).items.length")==1;passed('Uncertain create preserves bag')
 page.evaluate("__paymentAction='auth-failure'");page.locator('[data-check-status]').click();page.wait_for_function("document.querySelector('#checkout-error').textContent.includes('matching Test pair')");assert page.evaluate('__creates')==1;passed('Existing saved order reports authentication failure without another create')
 page.evaluate("__paymentAction='no-match'");page.locator('[data-check-status]').click();page.wait_for_function("document.querySelector('#checkout-error').textContent.includes('No matching')");assert page.locator('[data-resume-payment]').count()==0;assert page.evaluate('__creates')==1;passed('Unmatched order stays blocked with actionable result')
 page.evaluate("__paymentAction='recover'");page.locator('[data-check-status]').click();page.wait_for_selector('[data-resume-payment]');assert page.evaluate('__creates')==1;passed('Recovery resumes the original saved order without another create')
 page.screenshot(path=str(OUT/'checkout-recovered.png'),full_page=True)
 page.locator('[data-resume-payment]').click();page.wait_for_function("document.querySelector('#order-result').textContent.includes('Your test is complete')");assert page.evaluate('__creates')==1;passed('Recovered order completes using the same gateway order')
 assert not errors,errors;passed('No unhandled browser script exceptions')
 browser.close()
(OUT/'report.json').write_text(json.dumps({'checks':checks,'count':len(checks),'errors':errors,'limitations':'Offline UI harness. API, storage and Razorpay are simulated; native network navigation is blocked.'},indent=2))
