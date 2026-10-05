import {HttpError,requireThat as need} from '../management/errors.mjs';
export class RazorpayProvider {
  constructor(config,fetcher=fetch) { this.config=config;this.fetcher=fetcher; }
  async request(path, body) {
    let response;
    try {
      response=await this.fetcher('https://api.razorpay.com/v1'+path,{method:body?'POST':'GET',headers:{Authorization:'Basic '+Buffer.from(this.config.keyId+':'+this.config.keySecret).toString('base64'),Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000),redirect:'error'});
      if(!response.ok) { await response.body?.cancel(); throw new Error('Provider error'); }
      const chunks=[];let size=0;
      for await(const chunk of response.body){size+=chunk.length;if(size>262144)throw new Error('Oversize');chunks.push(chunk);}
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { throw new HttpError(503,'PAYMENT_UNAVAILABLE','The payment provider did not complete the request. Check this order’s status before paying again.'); }
  }
  async create(order) {
    const result=await this.request('/orders',{amount:order.body.quote.total,currency:'INR',receipt:order.id,partial_payment:false,notes:{khaga_order_id:order.id,khaga_mode:'test'}});
    need(/^order_[A-Za-z0-9]+$/.test(result?.id||'') && result.amount===order.body.quote.total && result.currency==='INR' && result.receipt===order.id,503,'PAYMENT_UNAVAILABLE','The payment provider returned an unexpected order.');
    return result.id;
  }
  async payment(id) { need(/^pay_[A-Za-z0-9]+$/.test(id||''),422,'INVALID_REQUEST','Invalid payment reference.');return this.request('/payments/'+id); }
  async payments(orderId) { need(/^order_[A-Za-z0-9]+$/.test(orderId||''),422,'INVALID_REQUEST','Invalid provider order reference.');return (await this.request('/orders/'+orderId+'/payments')).items || []; }
}
