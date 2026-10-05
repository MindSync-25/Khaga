import {HttpError} from '../management/errors.mjs';

// Fixed guidance only. Never surface provider bodies, headers, credentials or PII.
const messages = Object.freeze({
  PAYMENT_AUTH_FAILED:'Razorpay rejected the server credentials. The owner must verify that the saved Test Key ID and Test Key Secret are an active, matching pair.',
  PAYMENT_ACCESS_DENIED:'Razorpay denied this API operation. The owner must review access for the configured Test account.',
  PAYMENT_REQUEST_REJECTED:'Razorpay rejected the order request. The owner must review the integration; do not create another payment attempt.',
  PAYMENT_RATE_LIMITED:'Razorpay is limiting requests. Wait before checking this saved order again.',
  PAYMENT_UNAVAILABLE:'Razorpay could not be reached or did not finish responding. This is not proof that no order was created. Check the saved order before paying again.',
  PAYMENT_RESPONSE_INVALID:'The Razorpay response could not be verified. Keep this saved order and use Check payment status to recover it safely.',
  PAYMENT_RECOVERY_CONFLICT:'Razorpay returned conflicting or mismatched order records. Nothing was linked and no new order was created. The owner must review the saved order.',
  PAYMENT_ORDER_NOT_FOUND:'No matching Razorpay order was found in the configured Test account during this check. This does not prove the original request failed. No new order was created; verify the account and saved reference before another attempt.',
  PAYMENT_BINDING_FAILED:'The Razorpay order reference could not be saved or verified in KHAGA. Use Check payment status to recover the existing order; do not start another payment.',
});
export class GatewayError extends HttpError {
  constructor(code, httpStatus) {
    const safeCode=Object.hasOwn(messages,code)?code:'PAYMENT_UNAVAILABLE';
    super(safeCode==='PAYMENT_RATE_LIMITED'?429:503,safeCode,messages[safeCode]);
    if(Number.isInteger(httpStatus)&&httpStatus>=100&&httpStatus<=599)this.httpStatus=httpStatus;
  }
}
export function gatewayDiagnostic(error,stage='gateway_create') {
  const safeStage=['gateway_create','order_binding','gateway_lookup','payment_lookup'].includes(stage)?stage:'gateway_create';
  const code=error instanceof GatewayError?error.code:safeStage==='order_binding'?'PAYMENT_BINDING_FAILED':'PAYMENT_UNAVAILABLE';
  return {code,stage:safeStage,message:messages[code],...(error instanceof GatewayError&&error.httpStatus?{httpStatus:error.httpStatus}:{})};
}
export function safeGatewayError(error) {
  return error instanceof GatewayError?{status:error.status,error:error.code,message:messages[error.code]}:null;
}
