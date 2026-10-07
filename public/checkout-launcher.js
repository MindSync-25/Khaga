'use strict';
// Enabled by the server for configured guest commerce, or legacy owner tests.
(()=>{
 function update(){
  document.querySelectorAll('.checkout-disabled').forEach(button=>{
   const link=document.createElement('a');link.href='/checkout';link.className='button';link.dataset.testCheckout='';link.textContent='Continue to checkout →';button.replaceWith(link);
  });
 }
 // The isolated payment document has its own CSP/SDK. Existing colour, gallery,
 // search and normal storefront routing remain unchanged.
 document.addEventListener('click',event=>{
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const link=event.target instanceof Element?event.target.closest('[data-test-checkout]'):null;
  if(link){event.preventDefault();location.assign('/checkout');}
 },true);
 const observer=new MutationObserver(update);
 for(const element of [document.getElementById('main'),document.getElementById('bag-dialog')])if(element)observer.observe(element,{childList:true,subtree:true});
 update();
})();
