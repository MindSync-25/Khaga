-- Additive: preserves all legacy test records and catalogue/admin data.
BEGIN;
CREATE TABLE IF NOT EXISTS khaga_private.commerce_policy (
 mode text PRIMARY KEY CHECK(mode IN ('test','live')), settings jsonb NOT NULL
);
-- No invented business settings. Operators insert reviewed policy per mode.
CREATE TABLE IF NOT EXISTS khaga_private.commerce_orders (
 id uuid PRIMARY KEY, mode text NOT NULL CHECK(mode IN ('test','live')),
 guest_hash text NOT NULL CHECK(guest_hash ~ '^[a-f0-9]{64}$'),
 request_key text NOT NULL CHECK(request_key ~ '^[a-f0-9]{64}$'), fingerprint text NOT NULL,
 body jsonb NOT NULL, status text NOT NULL DEFAULT 'creating'
 CHECK(status IN ('creating','creation_unknown','creation_rejected','payment_pending','paid','refund_review','closed_unpaid')),
 provider_id text, payment_id text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(mode,guest_hash,request_key), UNIQUE(mode,provider_id), UNIQUE(mode,payment_id)
);
CREATE TABLE IF NOT EXISTS khaga_private.commerce_reservations (
 order_id uuid REFERENCES khaga_private.commerce_orders(id),mode text NOT NULL,
 product text NOT NULL,colour text NOT NULL,size text NOT NULL, quantity integer NOT NULL CHECK(quantity>0),
 PRIMARY KEY(order_id,product,colour,size)
);
CREATE INDEX IF NOT EXISTS commerce_capacity ON khaga_private.commerce_reservations(mode,product,colour,size);
CREATE TABLE IF NOT EXISTS khaga_private.commerce_events (
 mode text NOT NULL,digest text NOT NULL,order_id uuid REFERENCES khaga_private.commerce_orders(id),
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(mode,digest)
);
CREATE TABLE IF NOT EXISTS khaga_private.commerce_payments (
 mode text NOT NULL,payment_id text NOT NULL,order_id uuid NOT NULL REFERENCES khaga_private.commerce_orders(id),
 status text NOT NULL,PRIMARY KEY(mode,payment_id)
);
CREATE TABLE IF NOT EXISTS khaga_private.commerce_review (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,order_id uuid NOT NULL,action text NOT NULL,evidence text NOT NULL,at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE khaga_private.commerce_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE khaga_private.commerce_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE khaga_private.commerce_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE khaga_private.commerce_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE khaga_private.commerce_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE khaga_private.commerce_review ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON khaga_private.commerce_policy,khaga_private.commerce_orders,khaga_private.commerce_reservations,khaga_private.commerce_events,khaga_private.commerce_payments,khaga_private.commerce_review FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.khaga_commerce(p_mode text,p_action text,p_args jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o khaga_private.commerce_orders; policy jsonb; item jsonb; product jsonb; variant jsonb;
 used bigint; subtotal bigint:=0; shipping bigint; tax bigint; taxable bigint; total bigint; q jsonb; payment jsonb;
BEGIN
 IF p_mode NOT IN ('test','live') OR p_mode IS NULL THEN RAISE EXCEPTION 'Invalid mode'; END IF;
 IF p_action='policy' THEN RETURN (SELECT settings FROM khaga_private.commerce_policy WHERE mode=p_mode); END IF;
 IF p_action='get' THEN RETURN (SELECT to_jsonb(t) FROM khaga_private.commerce_orders t WHERE mode=p_mode AND id=(p_args->>'id')::uuid); END IF;
 IF p_action='find' THEN RETURN (SELECT to_jsonb(t) FROM khaga_private.commerce_orders t WHERE mode=p_mode AND provider_id=p_args->>'provider'); END IF;
 IF p_action='list' THEN RETURN (SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM (SELECT * FROM khaga_private.commerce_orders WHERE mode=p_mode AND (p_args->>'guest' IS NULL OR guest_hash=p_args->>'guest') ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET least(greatest(coalesce((p_args->>'offset')::integer,0),0),10000)) t); END IF;
 -- Same lock as catalogue publication: capacity/price checks and reservations
 -- serialize with each other AND admin writes, across both Lambda functions.
 PERFORM pg_advisory_xact_lock(7219,1);
 IF p_action='event' THEN
  INSERT INTO khaga_private.commerce_events(mode,digest) VALUES(p_mode,p_args->>'event') ON CONFLICT DO NOTHING;
  RETURN 'true';
 END IF;
 IF p_action='create' THEN
  SELECT * INTO o FROM khaga_private.commerce_orders WHERE mode=p_mode AND guest_hash=p_args->>'guest' AND request_key=p_args->>'key';
  IF FOUND THEN RETURN jsonb_build_object('created',false,'order',to_jsonb(o)); END IF;
  -- One unresolved intent per guest also serializes double-clicks from tabs with different keys.
  IF EXISTS(SELECT 1 FROM khaga_private.commerce_orders WHERE mode=p_mode AND guest_hash=p_args->>'guest' AND status IN ('creating','creation_unknown','payment_pending')) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='An order is already pending; open recent order';
  END IF;
  SELECT settings INTO policy FROM khaga_private.commerce_policy WHERE mode=p_mode FOR SHARE;
  q:=p_args->'body'->'quote';
  IF policy IS NULL OR policy->>'enabled'<>'true' OR policy->>'mode'<>p_mode OR q->>'mode'<>p_mode OR p_args->'body'->>'mode'<>p_mode OR q->>'policyVersion'<>policy->>'version' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Policy changed'; END IF;
  IF jsonb_array_length(q->'items') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Invalid items'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(q->'items') LOOP
   SELECT body->'published' INTO product FROM khaga_private.documents WHERE kind='product' AND id=item->>'product';
   SELECT value INTO variant FROM jsonb_array_elements(product->'variants') WHERE value->>'colour'=item->>'colour' AND value->>'size'=item->>'size';
   IF product IS NULL OR product->>'sampleApproved'<>'true' OR variant IS NULL OR variant->>'mode' NOT IN ('stock','preorder') OR (item->>'quantity')::integer NOT BETWEEN 1 AND 10 OR (item->>'unitPrice')::bigint<>(product->>'price')::bigint OR item->>'availability'<>variant->>'mode' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Variant or price changed'; END IF;
   SELECT coalesce(sum(quantity),0) INTO used FROM khaga_private.commerce_reservations r WHERE r.mode=p_mode AND r.product=item->>'product' AND r.colour=item->>'colour' AND r.size=item->>'size';
   IF used+(item->>'quantity')::integer>(variant->>'quantity')::bigint THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Variant capacity unavailable'; END IF;
   subtotal:=subtotal+(item->>'unitPrice')::bigint*(item->>'quantity')::integer;
  END LOOP;
  shipping:=CASE WHEN policy->>'freeShippingAt' IS NOT NULL AND subtotal>=(policy->>'freeShippingAt')::bigint THEN 0 ELSE (policy->>'shippingPaise')::bigint END;
  taxable:=subtotal+CASE WHEN (policy->>'taxShipping')::boolean THEN shipping ELSE 0 END;
  tax:=round(taxable::numeric*(policy->>'taxBps')::integer/CASE WHEN policy->>'taxTreatment'='inclusive' THEN 10000+(policy->>'taxBps')::integer ELSE 10000 END);
  total:=subtotal+shipping+CASE WHEN policy->>'taxTreatment'='exclusive' THEN tax ELSE 0 END;
  IF total IS NULL OR total NOT BETWEEN 100 AND 100000000 OR total<>(q->>'total')::bigint OR subtotal<>(q->>'subtotal')::bigint OR shipping<>(q->>'shipping')::bigint OR tax<>(q->>'tax')::bigint OR q->>'currency'<>'INR' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Quote changed'; END IF;
  INSERT INTO khaga_private.commerce_orders(id,mode,guest_hash,request_key,fingerprint,body) VALUES((p_args->>'id')::uuid,p_mode,p_args->>'guest',p_args->>'key',p_args->>'fingerprint',p_args->'body') RETURNING * INTO o;
  FOR item IN SELECT value FROM jsonb_array_elements(q->'items') LOOP
   INSERT INTO khaga_private.commerce_reservations VALUES(o.id,p_mode,item->>'product',item->>'colour',item->>'size',(item->>'quantity')::integer);
  END LOOP;
  RETURN jsonb_build_object('created',true,'order',to_jsonb(o));
 END IF;
 SELECT * INTO o FROM khaga_private.commerce_orders WHERE mode=p_mode AND id=(p_args->>'id')::uuid FOR UPDATE;
 IF o.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Order not found'; END IF;
 IF p_action='bind' THEN
  IF p_args->>'provider' !~ '^order_[A-Za-z0-9]+$' OR (o.provider_id IS NOT NULL AND o.provider_id<>p_args->>'provider') OR o.status IN ('creation_rejected','closed_unpaid') THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Binding conflict'; END IF;
  UPDATE khaga_private.commerce_orders SET provider_id=p_args->>'provider',status=CASE WHEN status IN ('creating','creation_unknown') THEN 'payment_pending' ELSE status END,updated_at=now() WHERE id=o.id RETURNING * INTO o;
 ELSIF p_action='state' THEN
  IF p_args->>'status' NOT IN ('creation_unknown','creation_rejected') THEN RAISE EXCEPTION 'Invalid transition'; END IF;
  IF o.status='creating' AND o.provider_id IS NULL THEN
   UPDATE khaga_private.commerce_orders SET status=p_args->>'status',updated_at=now() WHERE id=o.id RETURNING * INTO o;
   IF o.status='creation_rejected' THEN DELETE FROM khaga_private.commerce_reservations WHERE order_id=o.id; END IF;
  END IF;
 ELSIF p_action='mark' THEN
  payment:=p_args->'payment';
  IF payment->>'id' !~ '^pay_[A-Za-z0-9]+$' OR o.provider_id IS NULL OR o.provider_id<>payment->>'order_id' OR (payment->>'amount')::bigint<>(o.body->'quote'->>'total')::bigint OR payment->>'currency'<>'INR' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Payment mismatch'; END IF;
  IF p_args->>'event' IS NOT NULL THEN
   INSERT INTO khaga_private.commerce_events(mode,digest,order_id) VALUES(p_mode,p_args->>'event',o.id) ON CONFLICT DO NOTHING;
   IF NOT FOUND THEN RETURN to_jsonb(o); END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM khaga_private.commerce_payments WHERE mode=p_mode AND payment_id=payment->>'id' AND order_id<>o.id) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Payment reused'; END IF;
  INSERT INTO khaga_private.commerce_payments VALUES(p_mode,payment->>'id',o.id,payment->>'status') ON CONFLICT(mode,payment_id) DO UPDATE SET status=CASE WHEN khaga_private.commerce_payments.status IN ('captured','refunded') THEN khaga_private.commerce_payments.status ELSE excluded.status END;
  IF payment->>'status'='captured' AND payment->>'captured'='true' AND coalesce((payment->>'amount_refunded')::bigint,0)=0 THEN
   IF o.payment_id IS NOT NULL AND o.payment_id<>payment->>'id' THEN
    INSERT INTO khaga_private.commerce_review(order_id,action,evidence) VALUES(o.id,'additional_capture',payment->>'id');
   ELSE
    UPDATE khaga_private.commerce_orders SET status=CASE WHEN status='refund_review' THEN status ELSE 'paid' END,payment_id=payment->>'id',updated_at=now() WHERE id=o.id RETURNING * INTO o;
   END IF;
  ELSIF payment->>'status'='refunded' OR coalesce((payment->>'amount_refunded')::bigint,0)>0 THEN
   UPDATE khaga_private.commerce_orders SET status='refund_review',payment_id=coalesce(payment_id,payment->>'id'),updated_at=now() WHERE id=o.id RETURNING * INTO o;
  END IF;
 ELSE RAISE EXCEPTION 'Unknown operation'; END IF;
 RETURN to_jsonb(o);
END $$;
REVOKE ALL ON FUNCTION public.khaga_commerce(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.khaga_commerce(text,text,jsonb) TO service_role;
-- Operator-only recovery. NOT granted to service_role or exposed through HTTP.
-- After provider support confirms no gateway order/payment exists, close the
-- ambiguous intent and release capacity. Evidence is mandatory and retained.
CREATE OR REPLACE FUNCTION khaga_private.close_uncreated_order(p_id uuid,p_evidence text) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE o khaga_private.commerce_orders;
BEGIN
 PERFORM pg_advisory_xact_lock(7219,1);
 SELECT * INTO o FROM khaga_private.commerce_orders WHERE id=p_id FOR UPDATE;
 IF o.id IS NULL OR o.status NOT IN ('creating','creation_unknown') OR o.provider_id IS NOT NULL OR o.created_at>now()-interval '1 hour' OR length(trim(p_evidence))<20 THEN RAISE EXCEPTION 'Provider investigation and evidence required'; END IF;
 INSERT INTO khaga_private.commerce_review(order_id,action,evidence) VALUES(p_id,'close_uncreated',p_evidence);
 UPDATE khaga_private.commerce_orders SET status='closed_unpaid',updated_at=now() WHERE id=p_id;
 DELETE FROM khaga_private.commerce_reservations WHERE order_id=p_id;
END $$;
REVOKE ALL ON FUNCTION khaga_private.close_uncreated_order(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
