import {requireThat as need} from '../management/errors.mjs';
import {GatewayError} from './gateway-errors.mjs';

async function readJSON(response) {
  const chunks=[];let size=0;
  for await(const chunk of response.body || []) {
    size+=chunk.length;
    if(size>262144)throw new Error('Response exceeds the bounded reader');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function responseError(status,payload) {
  // Razorpay documents authentication failure as HTTP 400 as well as 401.
  // Inspect only for classification; never log or return any provider text.
  const description=typeof payload?.error?.description==='string'?payload.error.description:'';
  const auth=status===401 || (status===400 && /^(?:authentication failed\.?|invalid api key\.?|the api key provided is invalid\.?)$/i.test(description.trim()));
  const code=auth?'PAYMENT_AUTH_FAILED':status===403?'PAYMENT_ACCESS_DENIED':status===429?'PAYMENT_RATE_LIMITED':status>=400&&status<500?'PAYMENT_REQUEST_REJECTED':'PAYMENT_UNAVAILABLE';
  return new GatewayError(code,status);
}
function matchesOrder(result,order) {
  return /^order_[A-Za-z0-9]+$/.test(result?.id||'') && result.amount===order.body.quote.total && result.currency==='INR' && result.receipt===order.id;
}
export class RazorpayProvider {
  constructor(config,fetcher=fetch) { this.config=config;this.fetcher=fetcher; }
  async request(path, body) {
    let response;
    try {
      response=await this.fetcher('https://api.razorpay.com/v1'+path,{method:body?'POST':'GET',headers:{Authorization:'Basic '+Buffer.from(this.config.keyId+':'+this.config.keySecret).toString('base64'),Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000),redirect:'error'});
    } catch { throw new GatewayError('PAYMENT_UNAVAILABLE'); }
    let result;
    try { result=await readJSON(response); }
    catch { throw response.ok?new GatewayError('PAYMENT_RESPONSE_INVALID',response.status):responseError(response.status); }
    if(!response.ok)throw responseError(response.status,result);
    return result;
  }
  async create(order) {
    const result=await this.request('/orders',{amount:order.body.quote.total,currency:'INR',receipt:order.id,partial_payment:false,notes:{khaga_order_id:order.id,khaga_mode:'test'}});
    if(!matchesOrder(result,order))throw new GatewayError('PAYMENT_RESPONSE_INVALID');
    return result.id;
  }
  // Reconcile a LOST response/binding using GET only. Receipt filtering may match
  // substrings, so independently require one exact receipt and all identity fields.
  // Never conclude that a zero-result list authorizes another create request.
  async findOrder(order) {
    need(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(order?.id||''),422,'INVALID_REQUEST','Invalid saved order reference.');
    const result=await this.request('/orders?'+new URLSearchParams({receipt:order.id,count:'100',skip:'0'}));
    if(!Array.isArray(result?.items)||result.items.length>=100 || result.count!==result.items.length)throw new GatewayError('PAYMENT_RECOVERY_CONFLICT');
    const matches=result.items.filter(item=>item?.receipt===order.id);
    if(!matches.length)return null;
    if(matches.length!==1)throw new GatewayError('PAYMENT_RECOVERY_CONFLICT');
    const candidate=matches[0];
    if(!matchesOrder(candidate,order)||candidate.entity!=='order'||candidate.notes?.khaga_order_id!==order.id||candidate.notes?.khaga_mode!=='test'||!['created','attempted','paid'].includes(candidate.status))throw new GatewayError('PAYMENT_RECOVERY_CONFLICT');
    return candidate;
  }
  async order(order) {
    need(/^order_[A-Za-z0-9]+$/.test(order?.provider_id||''),422,'INVALID_REQUEST','Invalid provider order reference.');
    const result=await this.request('/orders/'+order.provider_id);
    if(!matchesOrder(result,order)||result.id!==order.provider_id||!['created','attempted','paid'].includes(result.status))throw new GatewayError('PAYMENT_RECOVERY_CONFLICT');
    return result;
  }
  async payment(id) { need(/^pay_[A-Za-z0-9]+$/.test(id||''),422,'INVALID_REQUEST','Invalid payment reference.');return this.request('/payments/'+id); }
  async payments(orderId) {
    need(/^order_[A-Za-z0-9]+$/.test(orderId||''),422,'INVALID_REQUEST','Invalid provider order reference.');
    const result=await this.request('/orders/'+orderId+'/payments');
    if(!Array.isArray(result?.items)||result.items.length>100)throw new GatewayError('PAYMENT_RESPONSE_INVALID');
    return result.items;
  }
}
