'use strict';
(()=>{
 const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(v/100);
 const BAG='khaga.preview.bag.v1',ATTEMPT='khaga.checkout.attempt.v1';
 let session=null,quote=null,checkout=null,body=null,busy=false,sdk=null,verifying=false;
 let storage=null;try{storage=window.localStorage;}catch{}
 let attemptStore=null;try{attemptStore=window.sessionStorage;}catch{}
 let bag=[];try{const saved=JSON.parse(storage?.getItem(BAG)||'null');if(saved?.version===1&&Array.isArray(saved.items))bag=saved.items;}catch{}
 const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 let attempt=null;try{attempt=JSON.parse(attemptStore?.getItem(ATTEMPT)||'null');}catch{}
 if(!attempt||!/^[a-f0-9]{64}$/.test(attempt.key||''))attempt={key:random()};
 function remember(){try{attemptStore?.setItem(ATTEMPT,JSON.stringify({key:attempt.key,id:attempt.id||null}));}catch{}}
 function error(message){$('#checkout-error').textContent=message;$('#checkout-error').hidden=!message;}
 function lock(value){busy=value;$('#pay-button').disabled=value;$('#edit-button').disabled=value;}
 async function api(path,{method='GET',data}={}){
  const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(25000),headers:{Accept:'application/json',...(data?{'Content-Type':'application/json'}:{}),...(method==='POST'?{'X-CSRF-Token':session.csrf}:{})},body:data?JSON.stringify(data):undefined});
  let result;try{result=await response.json();}catch{throw Error('Checkout could not respond. Your bag is unchanged.');}
  if(!response.ok)throw Object.assign(new Error(result.message||'Checkout did not complete.'),{code:result.error});return result;
 }
 function summary(q){$('#checkout-summary').innerHTML=q.items.map(l=>`<div class="order-line"><div><strong>${esc(l.name)}</strong><p>${esc(l.colourName)} · ${esc(l.size)} · Qty ${l.quantity}</p></div><span>${money(l.unitPrice*l.quantity)}</span></div>`).join('')+`<div class="totals"><span>Subtotal</span><span>${money(q.subtotal)}</span></div><div class="totals"><span>Test shipping</span><span>${money(q.shipping)}</span></div><div class="totals grand-total"><strong>Total (test)</strong><strong>${money(q.total)}</strong></div><p class="privacy-note">${esc(q.taxNote)}</p>`;}
 function loadSDK(){
  if(window.Razorpay)return Promise.resolve();if(sdk)return sdk;
  sdk=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://checkout.razorpay.com/v1/checkout.js';script.async=true;
   const fail=()=>{clearTimeout(timer);script.remove();sdk=null;reject(Error('The payment window could not load. Check your connection and try again.'));};
   const timer=setTimeout(fail,15000);script.onload=()=>{clearTimeout(timer);if(window.Razorpay)resolve();else fail();};script.onerror=fail;document.head.append(script);
  });return sdk;
 }
 function clearPurchased(order){
  const key='khaga.checkout.cleared.'+order.id;
  try{if(!storage||storage.getItem(key))return;const saved=JSON.parse(storage.getItem(BAG)||'null');if(saved?.version!==1||!Array.isArray(saved.items))return;
   saved.items=saved.items.flatMap(line=>{const purchased=order.quote.items.find(p=>p.product===line.product&&p.colour===line.colour&&p.size===line.size);const qty=line.quantity-(purchased?.quantity||0);return qty>0?[{...line,quantity:qty}]:[];});
   // Both records are local UX hints, never proof of payment. The server is authoritative.
   storage.setItem(BAG,JSON.stringify(saved));storage.setItem(key,'1');
  }catch{/* Keep the bag if storage cannot be updated; never affect payment status. */}
 }
 function showOrder(result){
  checkout=result;const order=result.order;attempt.id=order.id;remember();summary(order.quote);
  $('#checkout-form').hidden=true;$('#payment-step').hidden=true;$('#order-result').hidden=false;
  const complete=order.status==='paid',review=order.status==='refund_review',uncertain=['creating','creation_unknown'].includes(order.status);
  $('#order-result').innerHTML=`<div class="step-label">${complete?'TEST PAYMENT VERIFIED':'SAVED TEST ORDER'}</div><h2>${complete?'Your test is complete.':review?'Refund needs review.':uncertain?'We’re checking this attempt.':'Payment is not confirmed yet.'}</h2><p class="reference">${esc(order.reference)}</p><p>${complete?'Your test payment was verified with Razorpay and this order is saved. No real money was charged and nothing will be shipped.':review?'A refund was reported for this test payment. It is not a new successful purchase.':uncertain?'The gateway-order response was incomplete. Do not start another payment. This saved reference lets the owner investigate safely.':'An open, cancelled or authorized payment is not a completed purchase. Check status before trying payment again.'}</p><a class="secondary" href="/checkout/orders/${esc(order.id)}">Saved order status</a><button type="button" class="secondary" data-check-status>Check payment status</button>${result.payment?'<button type="button" class="primary" data-resume-payment>Resume this test payment →</button>':''}<p><a href="/collection">Return to the collection</a></p>`;
  if(complete){clearPurchased(order);try{attemptStore?.removeItem(ATTEMPT);}catch{}}
 }
 async function refresh(){if(!checkout)return;const result=await api('/api/checkout/orders/'+checkout.order.id+'/reconcile',{method:'POST',data:{}});showOrder(result);}
 async function openPayment(){
  if(busy||verifying)return;error('');lock(true);
  try{
   await loadSDK();
   if(!checkout){remember();checkout=await api('/api/checkout/orders',{method:'POST',data:{...body,requestKey:attempt.key,quoteHash:quote.hash,items:bag}});attempt.id=checkout.order.id;remember();}
   if(!checkout.payment){showOrder(checkout);lock(false);return;}
   const {order,payment}=checkout;let returned=false;
   const paymentWindow=new window.Razorpay({key:payment.keyId,order_id:payment.orderId,amount:payment.amount,currency:payment.currency,name:'KHAGA — TEST',description:order.reference+' (test only)',prefill:{name:order.customer.name,email:order.customer.email,contact:order.customer.phone},theme:{color:'#28332c'},retry:{enabled:true},modal:{confirm_close:true,ondismiss:()=>{lock(false);if(!returned&&!verifying){showOrder(checkout);error('Payment window closed. Your bag is kept. Check status before retrying.');}}},handler:async response=>{
    if(verifying)return;returned=true;verifying=true;error('Verifying payment with the server…');
    try{const result=await api('/api/checkout/orders/'+order.id+'/verify',{method:'POST',data:response});error('');showOrder(result);}
    catch(e){showOrder(checkout);error(e.message+' Use Check payment status; do not pay again yet.');}
    finally{verifying=false;lock(false);}
   }});
   paymentWindow.on('payment.failed',()=>error('This payment attempt failed. You can retry inside Razorpay or close it. Your saved order and bag are retained.'));
   paymentWindow.open();
  }catch(e){lock(false);error(e.message);if(e.code==='QUOTE_CHANGED'){checkout=null;quote=null;$('#checkout-form').hidden=false;$('#payment-step').hidden=true;}}
 }
 $('#checkout-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;error('');lock(true);
  try{
   body={customer:Object.fromEntries(new FormData(event.target))};
   quote=await api('/api/checkout/quote',{method:'POST',data:{items:bag}});summary(quote);
   $('#checkout-form').hidden=true;$('#payment-step').hidden=false;$('#order-result').hidden=true;
   $('#payment-note').textContent=`Confirm a test payment of ${money(quote.total)} for ${body.customer.name}. This is not a live purchase.`;
   // Loading the SDK does not create an order or charge a payment.
   void loadSDK().catch(e=>error(e.message));
  }catch(e){error(e.message);}finally{lock(false);}
 });
 $('#pay-button').addEventListener('click',openPayment);
 $('#edit-button').addEventListener('click',()=>{if(busy||checkout)return;$('#checkout-form').hidden=false;$('#payment-step').hidden=true;});
 document.addEventListener('click',async event=>{
  if(event.target.closest('[data-resume-payment]'))return openPayment();
  if(event.target.closest('[data-check-status]')){if(busy)return;lock(true);error('');try{await refresh();}catch(e){error(e.message);}finally{lock(false);}}
 });
 window.addEventListener('beforeunload',event=>{if(busy||verifying){event.preventDefault();event.returnValue='';}});
 async function init(){
  try{
   session=await api('/api/checkout/session');
   if(session.mode!=='test')throw Error('Test checkout is not enabled.');
   const id=$('#checkout-main').dataset.orderId || attempt.id;
   if(id){try{showOrder(await api('/api/checkout/orders/'+id));return;}catch(e){if(e.code!=='ORDER_NOT_FOUND')throw e;attempt={key:random()};remember();}}
   if(session.recent.length)$('#recent-orders').innerHTML=`<p class="hint">Recent test: <a href="/checkout/orders/${esc(session.recent[0].id)}">${esc(session.recent[0].reference)} — ${esc(session.recent[0].status)}</a></p>`;
   if(!bag.length){$('#checkout-summary').innerHTML='<p>Your bag is empty. <a href="/collection">Explore the collection</a>.</p>';return;}
   quote=await api('/api/checkout/quote',{method:'POST',data:{items:bag}});summary(quote);$('#address-fields').disabled=false;
  }catch(e){error(e.message);$('#checkout-summary').textContent='Checkout is unavailable. Your bag has not been removed.';}
 }
 void init();
})();
