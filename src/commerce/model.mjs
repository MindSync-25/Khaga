import {quoteItems,sha} from '../checkout/core.mjs';
import {requireThat as need} from '../management/errors.mjs';
export function price(items,snapshot,policy,mode) {
 need(policy?.enabled === true && policy.mode===mode && Number.isInteger(policy.version),503,'POLICY_REQUIRED','Checkout settings await owner approval.');
 for(const k of ['shippingPaise','taxBps'])need(Number.isSafeInteger(policy[k])&&policy[k]>=0,503,'POLICY_REQUIRED','Checkout settings await owner approval.');
 need(policy.taxBps<=10000 && ['inclusive','exclusive'].includes(policy.taxTreatment) && typeof policy.taxNote==='string' && policy.taxNote.length>0 && typeof policy.taxShipping==='boolean',503,'POLICY_REQUIRED','Checkout settings await owner approval.');
 need(policy.freeShippingAt===null || Number.isSafeInteger(policy.freeShippingAt)&&policy.freeShippingAt>=0,503,'POLICY_REQUIRED','Checkout settings await owner approval.');
 const base=quoteItems(items,snapshot);
 for(const item of base.items){const p=snapshot.products.find(p=>p.id===item.product),v=p.variants?.find(v=>v.colour===item.colour&&v.size===item.size);need(p.sampleApproved && v && ['stock','preorder'].includes(v.mode) && v.quantity>=item.quantity,409,'VARIANT_UNAVAILABLE','This size or colour is unavailable. Review your bag.');item.availability=v.mode;item.dispatchMin=v.dispatchMin;item.dispatchMax=v.dispatchMax;}
 const shipping=policy.freeShippingAt!==null&&base.subtotal>=policy.freeShippingAt?0:policy.shippingPaise;
 const taxable=base.subtotal+(policy.taxShipping?shipping:0);
 const tax=Math.floor((taxable*policy.taxBps+(policy.taxTreatment==='inclusive'?10000+policy.taxBps:10000)/2)/(policy.taxTreatment==='inclusive'?10000+policy.taxBps:10000));
 const total=base.subtotal+shipping+(policy.taxTreatment==='exclusive'?tax:0);
 need(Number.isSafeInteger(total)&&total>=100&&total<=100000000,422,'TOTAL_LIMIT','This order exceeds the checkout limit.');
 const result={items:base.items,currency:'INR',subtotal:base.subtotal,shipping,tax,total,mode,taxNote:policy.taxNote,taxTreatment:policy.taxTreatment,policyVersion:policy.version};
 return {...result,hash:sha(JSON.stringify(result))};
}
export const publicOrder=o=>({id:o.id,reference:`KHAGA-${o.mode==='test'?'T':'L'}-${o.id.toUpperCase()}`,mode:o.mode,status:o.status,quote:o.body.quote,customer:o.body.customer,createdAt:o.created_at,paymentId:o.payment_id||null});
