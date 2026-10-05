-- KHAGA test checkout. Run after 001_management.sql in the dedicated project.
-- Separate test records; cannot be used to record a live order in this release.
BEGIN;
CREATE TABLE IF NOT EXISTS khaga_private.test_orders (
 id uuid PRIMARY KEY,
 guest_hash text NOT NULL CHECK(guest_hash ~ '^[a-f0-9]{64}$'),
 request_key text NOT NULL CHECK(request_key ~ '^[a-f0-9]{64}$'),
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 body jsonb NOT NULL CHECK(jsonb_typeof(body)='object' AND body @> '{"mode":"test"}'::jsonb AND octet_length(body::text)<=65536),
 status text NOT NULL DEFAULT 'creating' CHECK(status IN ('creating','payment_pending','creation_unknown','paid','refund_review')),
 provider_id text UNIQUE CHECK(provider_id ~ '^order_[A-Za-z0-9]+$'),
 payment_id text UNIQUE CHECK(payment_id ~ '^pay_[A-Za-z0-9]+$'),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(guest_hash,request_key)
);
CREATE INDEX IF NOT EXISTS khaga_test_orders_newest ON khaga_private.test_orders(created_at DESC);
CREATE TABLE IF NOT EXISTS khaga_private.test_payment_events (
 digest text PRIMARY KEY CHECK(digest ~ '^[a-f0-9]{64}$'),
 order_id uuid NOT NULL REFERENCES khaga_private.test_orders(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE khaga_private.test_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE khaga_private.test_payment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON khaga_private.test_orders,khaga_private.test_payment_events FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.khaga_checkout_status() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT '{"schema":1,"mode":"test"}'::jsonb;
$$;
CREATE OR REPLACE FUNCTION public.khaga_checkout_create(p_id uuid,p_guest text,p_key text,p_fingerprint text,p_body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r khaga_private.test_orders; made boolean;
BEGIN
 INSERT INTO khaga_private.test_orders(id,guest_hash,request_key,fingerprint,body)
 VALUES(p_id,p_guest,p_key,p_fingerprint,p_body) ON CONFLICT(guest_hash,request_key) DO NOTHING RETURNING * INTO r;
 made := FOUND;
 IF NOT made THEN SELECT * INTO r FROM khaga_private.test_orders WHERE guest_hash=p_guest AND request_key=p_key; END IF;
 RETURN jsonb_build_object('created',made,'order',to_jsonb(r));
END $$;
CREATE OR REPLACE FUNCTION public.khaga_checkout_get(p_id uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT to_jsonb(o) FROM khaga_private.test_orders o WHERE id=p_id;
$$;
CREATE OR REPLACE FUNCTION public.khaga_checkout_find(p_provider text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT to_jsonb(o) FROM khaga_private.test_orders o WHERE provider_id=p_provider;
$$;
CREATE OR REPLACE FUNCTION public.khaga_checkout_list(p_guest text,p_offset integer) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) FROM (
 SELECT * FROM khaga_private.test_orders WHERE p_guest IS NULL OR guest_hash=p_guest
 ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET greatest(0,least(p_offset,10000))
 ) s;
$$;
CREATE OR REPLACE FUNCTION public.khaga_checkout_bind(p_id uuid,p_provider text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r khaga_private.test_orders;
BEGIN
 SELECT * INTO r FROM khaga_private.test_orders WHERE id=p_id FOR UPDATE;
 IF r.id IS NULL OR (r.provider_id IS NOT NULL AND r.provider_id<>p_provider) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Order binding conflict'; END IF;
 IF r.provider_id IS NULL THEN
 UPDATE khaga_private.test_orders SET provider_id=p_provider,status='payment_pending',updated_at=now()
 WHERE id=p_id AND status IN ('creating','creation_unknown') RETURNING * INTO r;
 END IF;
 RETURN to_jsonb(r);
END $$;
CREATE OR REPLACE FUNCTION public.khaga_checkout_uncertain(p_id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 UPDATE khaga_private.test_orders SET status='creation_unknown',updated_at=now() WHERE id=p_id AND status='creating';
$$;
CREATE OR REPLACE FUNCTION public.khaga_checkout_mark(p_id uuid,p_provider text,p_payment text,p_status text,p_event text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r khaga_private.test_orders;
BEGIN
 IF p_status NOT IN ('paid','refund_review') THEN RAISE EXCEPTION 'Unsupported transition'; END IF;
 SELECT * INTO r FROM khaga_private.test_orders WHERE id=p_id FOR UPDATE;
 IF r.id IS NULL OR r.provider_id IS DISTINCT FROM p_provider OR (r.payment_id IS NOT NULL AND r.payment_id<>p_payment) THEN
 RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Payment binding conflict'; END IF;
 IF p_event IS NOT NULL THEN
 INSERT INTO khaga_private.test_payment_events(digest,order_id) VALUES(p_event,p_id) ON CONFLICT(digest) DO NOTHING;
 IF NOT FOUND THEN RETURN to_jsonb(r); END IF;
 END IF;
 -- Never regress refund review or paid status on late/duplicate notifications.
 UPDATE khaga_private.test_orders SET status=CASE WHEN status='refund_review' THEN status ELSE p_status END,
 payment_id=p_payment,updated_at=now() WHERE id=p_id RETURNING * INTO r;
 RETURN to_jsonb(r);
END $$;
REVOKE ALL ON FUNCTION public.khaga_checkout_status() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.khaga_checkout_create(uuid,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.khaga_checkout_get(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.khaga_checkout_find(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.khaga_checkout_list(text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.khaga_checkout_bind(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.khaga_checkout_uncertain(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.khaga_checkout_mark(uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.khaga_checkout_status(),public.khaga_checkout_create(uuid,text,text,text,jsonb),public.khaga_checkout_get(uuid),public.khaga_checkout_find(text),public.khaga_checkout_list(text,integer),public.khaga_checkout_bind(uuid,text),public.khaga_checkout_uncertain(uuid),public.khaga_checkout_mark(uuid,text,text,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
