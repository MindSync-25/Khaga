"""Real browser/network cookies+CORS+CSRF+PostgreSQL; Razorpay SDK/provider are fixtures."""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
SITE='https://shop.khaga.test:55440'
API='https://api.khaga.test:55441'
OUT=Path('/tmp/khaga-commerce-browser');OUT.mkdir(exist_ok=True)
checks=[]
def passed(s): checks.append(s); print('PASS',s)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--no-proxy-server','--host-resolver-rules=MAP shop.khaga.test 127.0.0.1, MAP api.khaga.test 127.0.0.1'])
 context=browser.new_context(ignore_https_errors=True,viewport={'width':390,'height':844})
 page=context.new_page();baseline=page.request.get('https://127.0.0.1:55441/__fixture/stats').json()['creates'];errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 sdk="""window.Razorpay=class {constructor(o){this.o=o;window.fixtureOptions=o;}on(){}open(){window.fixtureOpened=true;}};"""
 context.route('https://checkout.razorpay.com/v1/checkout.js',lambda route:route.fulfill(content_type='text/javascript',body=sdk))
 page.goto(SITE+'/products/browser-fixture')
 page.locator('[data-colour="ivory"]').first.click()
 page.locator('[data-size="M"]').click()
 page.locator('[data-add-product="browser-fixture"]').click()
 page.locator('#bag-dialog [data-test-checkout]').click()
 page.wait_for_url(SITE+'/checkout')
 passed('Existing product colour/size selection and bag launcher reach checkout')
 page.wait_for_function("() => (!document.querySelector('#address-fields').disabled)")
 passed('Guest checkout opens without admin login over separate HTTPS API origin')
 cookies=context.cookies(API);guest=[c for c in cookies if c['name']=='__Host-khaga_guest_test'][0]
 assert guest['secure'] and guest['httpOnly'] and guest['domain']=='api.khaga.test' and guest['sameSite']=='Lax'
 assert '__Host-khaga_guest_test' not in page.evaluate('document.cookie');passed('Host-only secure HttpOnly cookie stored on API host')
 assert page.request.get('https://127.0.0.1:55440/api/admin/orders').status==401;passed('All-order admin view remains protected')
 values={'name':'Fixture Buyer','email':'fixture@example.invalid','phone':'9876543210','line1':'123 Fixture Road','city':'Bengaluru','state':'Karnataka','postalCode':'560001'}
 for k,v in values.items():page.locator('[name="'+k+'"]').fill(v)
 # Delivery failures use the real local handler. Only the public lookup is a fixture.
 bag_before=page.evaluate("localStorage.getItem('khaga.preview.bag.v1')")
 for state,pin,message in [('Maharashtra','400001','We’re currently unable to deliver to this address.\nPlease choose another delivery address.'),('Karnataka','400001','The state and PIN code don’t match.'),('Karnataka','999999','We couldn’t find that PIN code.'),('Karnataka','560002','We couldn’t verify your delivery address right now.')]:
  page.locator('[name="state"]').fill(state);page.locator('[name="postalCode"]').fill(pin)
  page.locator('#checkout-form button').click()
  page.wait_for_function("message => document.querySelector('#checkout-error').textContent.includes(message)",arg=message)
  if state=='Maharashtra':assert page.locator('#checkout-error').inner_text()==message
  assert page.locator('[name="postalCode"]').input_value()==pin
  assert page.locator('[name="line1"]').input_value()==values['line1']
  assert page.evaluate("localStorage.getItem('khaga.preview.bag.v1')")==bag_before
  assert not page.locator('#payment-step').is_visible()
  assert not page.evaluate('Boolean(window.fixtureOpened || window.Razorpay)')
  assert page.request.get('https://127.0.0.1:55441/__fixture/stats').json()['creates']==baseline
 passed('Unsupported/mismatched/unknown/outage delivery preserves bag and details; no order or SDK/payment window')
 page.locator('[name="state"]').fill('Karnataka');page.locator('[name="postalCode"]').fill('560001')
 with page.expect_response(lambda r:r.url==API+'/checkout/quote'):
  page.evaluate("""() => {document.querySelector('#checkout-form').requestSubmit();const line=document.querySelector('[name=line1]');line.value='321 Edited During Review';line.dispatchEvent(new Event('input',{bubbles:true}));}""")
 page.wait_for_function("() => !document.querySelector('#pay-button').disabled")
 assert not page.locator('#payment-step').is_visible()
 assert page.locator('[name="line1"]').input_value()=='321 Edited During Review'
 passed('Late quote response cannot restore payment after an address edit')
 page.locator('#checkout-form button').click();page.wait_for_selector('#payment-step',state='visible')
 assert '₹1,000.00' in page.locator('#checkout-summary').inner_text()
 assert page.request.get('https://127.0.0.1:55441/__fixture/stats').json()['creates']==baseline;passed('Reviewed server total precedes order creation and payment')
 page.locator('#edit-button').click()
 assert not page.locator('#payment-step').is_visible()
 assert '₹1,000.00' not in page.locator('#checkout-summary').inner_text()
 page.locator('[name="line1"]').fill('456 Changed Fixture Road')
 assert page.evaluate("localStorage.getItem('khaga.preview.bag.v1')")==bag_before
 page.locator('#checkout-form button').click();page.wait_for_selector('#payment-step',state='visible')
 passed('Editing delivery invalidates reviewed total and requires a fresh quote without clearing bag')
 # Real credentialed fetch; browser sends preflight and cookie. No fetch mocks.
 csrf=page.evaluate("async()=> (await (await fetch('"+API+"/checkout/session',{method:'POST',credentials:'include'})).json()).csrf")
 rejected=page.evaluate("async()=> (await fetch('"+API+"/checkout/quote',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:'{}'})).status")
 assert rejected==403;passed('Actual cross-origin POST rejects missing CSRF')
 page.locator('#pay-button').click();page.wait_for_function('() => window.fixtureOpened===true')
 options=page.evaluate('({orderId:fixtureOptions.order_id,amount:fixtureOptions.amount})');assert options['amount']==100000
 page.evaluate('fixtureOptions.modal.ondismiss()');page.wait_for_selector('[data-check-status]')
 assert len(page.evaluate("JSON.parse(localStorage.getItem('khaga.preview.bag.v1')).items"))==1;passed('Cancellation preserves bag and saved order')
 page.reload();page.wait_for_selector('[data-resume-payment]');passed('Refresh recovers pending order with same guest cookie')
 page.locator('[data-resume-payment]').click();page.wait_for_function('() => window.fixtureOpened===true')
 assert page.request.get('https://127.0.0.1:55441/__fixture/stats').json()['creates']==baseline+1;passed('Resume does not create another gateway order')
 callback=page.request.post('https://127.0.0.1:55441/__fixture/capture',data={'orderId':options['orderId'],'status':'authorized'}).json()
 page.evaluate('(data)=>fixtureOptions.handler(data)',callback)
 page.wait_for_function("() => (document.querySelector('#order-result').textContent.includes('not confirmed'))")
 assert len(page.evaluate("JSON.parse(localStorage.getItem('khaga.preview.bag.v1')).items"))==1;passed('Authorized payment stays pending and retains bag')
 saved_id=page.evaluate("JSON.parse(localStorage.getItem('khaga.checkout.attempt.v1')).id")
 page.close()
 context.request.post('https://127.0.0.1:55441/__fixture/capture',data={'orderId':options['orderId'],'webhook':True})
 page=context.new_page();page.goto(SITE+'/checkout/orders/'+saved_id);page.wait_for_function("() => (document.querySelector('#order-result').textContent.includes('Your test is complete'))")
 assert len(page.evaluate("JSON.parse(localStorage.getItem('khaga.preview.bag.v1')).items"))==0;passed('Closed-browser webhook persists captured order; returning browser confirms and clears purchased bag')
 page.screenshot(path=str(OUT/'confirmed-mobile.png'),full_page=True)
 other=browser.new_context(ignore_https_errors=True);otherpage=other.new_page();otherpage.goto(SITE+'/checkout/orders/'+saved_id)
 otherpage.wait_for_function("() => (document.querySelector('#checkout-error').textContent.length>0 || document.querySelector('#checkout-summary').textContent.includes('empty'))")
 assert 'Your test is complete' not in otherpage.locator('#order-result').inner_text();passed('Another guest cannot read order by UUID')
 assert not errors,errors
 browser.close()
(OUT/'report.json').write_text(json.dumps({'checks':checks,'count':len(checks),'errors':errors,'limitations':'Local HTTPS and PostgreSQL. Razorpay SDK/provider simulated. No deployed AWS or hosted Razorpay transaction.'},indent=2))
