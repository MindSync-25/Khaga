import {createHash, createHmac, timingSafeEqual} from 'node:crypto';
import {HttpError, requireThat as need} from '../management/errors.mjs';
export const sha = value => createHash('sha256').update(value).digest('hex');
export const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function checkoutConfig(env, management) {
  const mode = String(env.CHECKOUT_MODE || 'off').trim().toLowerCase();
  if (mode === 'off') return null;
  // Intentionally test-only until provider, storage, cookie and live acceptance pass.
  need(mode === 'test', 503, 'CHECKOUT_MODE_INVALID', 'This release supports CHECKOUT_MODE=test only. Live payments are not enabled.');
  need(management?.config?.enabled && management.repo, 503, 'CHECKOUT_STORE_REQUIRED', 'Configure the persistent catalogue and owner login before testing checkout.');
  const keyId = String(env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = String(env.RAZORPAY_KEY_SECRET || '').trim();
  need(/^rzp_test_[A-Za-z0-9]+$/.test(keyId), 503, 'RAZORPAY_TEST_KEY_REQUIRED', 'Use a Razorpay Test Key ID. Live keys are rejected in this release.');
  need(keySecret.length >= 8 && keySecret.length <= 1024 && !/[\s"'`]/.test(keySecret), 503, 'RAZORPAY_SECRET_REQUIRED', 'Set the matching Razorpay test secret without whitespace or quotation marks.');
  const webhookSecret = String(env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  need(!webhookSecret || (webhookSecret.length >= 24 && webhookSecret.length <= 1024 && !/[\r\n]/.test(webhookSecret)), 503, 'WEBHOOK_SECRET_FORMAT', 'The optional webhook secret must be a separate random value of at least 24 characters.');
  return {mode, keyId, keySecret, webhookSecret, origin:management.config.origin, secure:management.config.secure, shipping:0};
}
function field(value, name, min, max) {
  need(typeof value === 'string', 422, 'INVALID_ADDRESS', `Enter ${name}.`);
  const text = value.trim();
  need(text.length >= min && text.length <= max && !/[\u0000-\u001f\u007f]/.test(text), 422, 'INVALID_ADDRESS', `Check ${name}.`);
  return text;
}
export function customerInput(value) {
  need(value && typeof value === 'object' && !Array.isArray(value), 422, 'INVALID_ADDRESS', 'Enter your contact and delivery details.');
  const result = {
    name:field(value.name,'name',2,100), email:field(value.email,'email',3,254).toLowerCase(),
    phone:field(value.phone,'phone',10,16).replace(/[ ()-]/g,''),
    line1:field(value.line1,'address line 1',5,160), line2:field(value.line2 || '', 'address line 2',0,160),
    city:field(value.city,'city',2,80), state:field(value.state,'state or union territory',2,80),
    postalCode:field(value.postalCode,'PIN code',6,6), country:value.country,
  };
  need(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email), 422, 'INVALID_ADDRESS', 'Check the email address.');
  if (/^[6-9][0-9]{9}$/.test(result.phone)) result.phone = '+91' + result.phone;
  need(/^\+91[6-9][0-9]{9}$/.test(result.phone), 422, 'INVALID_ADDRESS', 'Enter a valid Indian mobile number.');
  need(/^[1-9][0-9]{5}$/.test(result.postalCode) && result.country === 'IN', 422, 'INVALID_ADDRESS', 'This test checkout supports Indian addresses with a six-digit PIN code.');
  return result;
}
export function quoteItems(input, snapshot) {
  need(snapshot?.managed === true, 503, 'CATALOGUE_NOT_READY', 'The managed product catalogue is not ready.');
  need(Array.isArray(input) && input.length > 0 && input.length <= 20, 422, 'INVALID_BAG', 'Choose between one and twenty variants.');
  const merged = new Map();
  for (const line of input) {
    need(line && typeof line === 'object' && Number.isInteger(line.quantity) && line.quantity >= 1 && line.quantity <= 10, 422, 'INVALID_BAG', 'Quantity must be between 1 and 10.');
    const p = snapshot.products.find(p => p.id === line.product);
    need(p && p.colours.includes(line.colour) && (p.sizes || snapshot.sizes).includes(line.size), 409, 'VARIANT_UNAVAILABLE', 'A selected product, colour or size is no longer published. Review your bag.');
    need(Number.isSafeInteger(p.price) && p.price >= 100, 503, 'INVALID_CATALOGUE_PRICE', 'A product price needs correction.');
    const key = [p.id,line.colour,line.size].join('|');
    const quantity = (merged.get(key)?.quantity || 0) + line.quantity;
    need(quantity <= 10, 422, 'INVALID_BAG', 'Maximum ten of each variant per test order.');
    merged.set(key,{product:p.id,name:p.name,colour:line.colour,colourName:snapshot.colours[line.colour]?.name || line.colour,size:line.size,quantity,unitPrice:p.price});
  }
  const items = [...merged.values()].sort((a,b)=>[a.product,a.colour,a.size].join('|').localeCompare([b.product,b.colour,b.size].join('|')));
  const subtotal = items.reduce((sum,line)=>sum+line.unitPrice*line.quantity,0);
  need(Number.isSafeInteger(subtotal) && subtotal <= 100000000, 422, 'TOTAL_LIMIT', 'The test order total is too large.');
  // Explicit simulation, never an asserted live tax/shipping policy.
  const quote = {items,currency:'INR',subtotal,shipping:0,total:subtotal,mode:'test',taxNote:'Illustrative prices. No additional tax or shipping is applied in this test.'};
  return {...quote,hash:sha(JSON.stringify(quote))};
}
export function validSignature(message, signature, secret) {
  if (!secret || typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256',secret).update(message).digest();
  return timingSafeEqual(expected,Buffer.from(signature,'hex'));
}
export function paymentUpdate(order, payment) {
  need(payment && /^pay_[A-Za-z0-9]+$/.test(payment.id || '') && payment.order_id === order.provider_id && payment.amount === order.body.quote.total && payment.currency === 'INR', 409, 'PAYMENT_MISMATCH', 'Payment does not match this order.');
  need(!order.payment_id || order.payment_id === payment.id, 409, 'PAYMENT_MISMATCH', 'A different payment is already attached to this order.');
  if (payment.status === 'refunded' || Number(payment.amount_refunded || 0) > 0) return {status:'refund_review',paymentId:payment.id};
  if (payment.status === 'captured' && payment.captured === true) return {status:'paid',paymentId:payment.id};
  // Authorized is not captured. Failed attempts must not erase a captured order.
  return null;
}
export function safeCheckoutError(error) {
  const allowed = new Set(['INVALID_ADDRESS','INVALID_BAG','VARIANT_UNAVAILABLE','CATALOGUE_NOT_READY','TOTAL_LIMIT','QUOTE_CHANGED','INVALID_CATALOGUE_PRICE','INVALID_REQUEST','ORDER_NOT_FOUND','IDEMPOTENCY_CONFLICT','ORDER_PENDING','ORDER_CREATION_UNCERTAIN','ORDER_EXPIRED','PAYMENT_MISMATCH','INVALID_SIGNATURE','PAYMENT_UNAVAILABLE','CSRF_DENIED','ORIGIN_DENIED','CROSS_SITE_DENIED','RATE_LIMITED','COOKIE_REQUIRED','ADMIN_LOGIN_REQUIRED','METHOD_NOT_ALLOWED','JSON_REQUIRED','INVALID_JSON','BODY_TOO_LARGE','ENCODING_NOT_ALLOWED','WEBHOOK_DISABLED']);
  return error instanceof HttpError && allowed.has(error.code) ? {status:error.status,error:error.code,message:error.message} : {status:503,error:'CHECKOUT_UNAVAILABLE',message:'Checkout is temporarily unavailable. Your bag is unchanged. Do not pay again if a payment is pending.'};
}
