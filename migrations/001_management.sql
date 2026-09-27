-- Run in a NEW/dedicated Supabase project SQL editor as its database owner.
-- No application credentials appear here. Re-runnable, no destructive operations.
BEGIN;
CREATE SCHEMA IF NOT EXISTS khaga_private;
REVOKE ALL ON SCHEMA khaga_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS khaga_private.documents (
  kind text NOT NULL CHECK(kind IN ('product','asset','session')),
  id text NOT NULL CHECK(id ~ '^[a-z0-9_-]{1,100}$'),
  version integer NOT NULL CHECK(version>0), body jsonb NOT NULL,
  updated_at bigint NOT NULL, PRIMARY KEY(kind,id)
);
CREATE TABLE IF NOT EXISTS khaga_private.audit_log (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor text NOT NULL,
 kind text NOT NULL,record_id text NOT NULL,version integer NOT NULL,at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS khaga_private.rate_limits(key text PRIMARY KEY, hits integer NOT NULL, until_ms bigint NOT NULL);
ALTER TABLE khaga_private.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE khaga_private.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE khaga_private.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA khaga_private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.khaga_status() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT '{"schema":1}'::jsonb $$;
CREATE OR REPLACE FUNCTION public.khaga_get(p_kind text,p_id text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT to_jsonb(d) FROM khaga_private.documents d WHERE kind=p_kind AND id=p_id;
$$;
CREATE OR REPLACE FUNCTION public.khaga_list(p_kind text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.id),'[]'::jsonb) FROM khaga_private.documents d WHERE d.kind=p_kind;
$$;
CREATE OR REPLACE FUNCTION public.khaga_write(p_kind text,p_id text,p_expected integer,p_body jsonb,p_actor text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result khaga_private.documents; now_ms bigint := floor(extract(epoch from clock_timestamp())*1000);
BEGIN
 -- Serialize product writes across instances so shared colour keys cannot race.
 IF p_kind='product' THEN
  PERFORM pg_advisory_xact_lock(7219,1);
  IF p_body->'published' IS NOT NULL AND p_body->'published'<>'null'::jsonb AND EXISTS (
   SELECT 1 FROM jsonb_each(p_body->'published'->'palette') incoming
   JOIN khaga_private.documents d ON d.kind='product' AND d.id<>p_id
   WHERE d.body->'published'->'palette' ? incoming.key
    AND d.body->'published'->'palette'->incoming.key <> incoming.value
  ) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='Published colour key conflict'; END IF;
 END IF;
 IF p_expected<0 OR p_expected>2147483000 OR octet_length(p_body::text)>200000 OR length(p_actor)>254 OR jsonb_typeof(p_body)<>'object' THEN
  RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='Invalid document';
 END IF;
 IF p_expected=0 THEN
  INSERT INTO khaga_private.documents(kind,id,version,body,updated_at) VALUES(p_kind,p_id,1,p_body,now_ms)
  ON CONFLICT(kind,id) DO NOTHING RETURNING * INTO result;
 ELSE
  UPDATE khaga_private.documents SET body=p_body,version=version+1,updated_at=now_ms
  WHERE kind=p_kind AND id=p_id AND version=p_expected RETURNING * INTO result;
 END IF;
 IF result.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Edit conflict'; END IF;
 IF p_kind<>'session' THEN INSERT INTO khaga_private.audit_log(actor,kind,record_id,version,at) VALUES(p_actor,p_kind,p_id,result.version,now_ms); END IF;
 RETURN to_jsonb(result);
END $$;
CREATE OR REPLACE FUNCTION public.khaga_remove_session(p_id text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ DELETE FROM khaga_private.documents WHERE kind='session' AND id=p_id; $$;
CREATE OR REPLACE FUNCTION public.khaga_rate(p_key text,p_limit integer,p_window_ms integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE now_ms bigint:=floor(extract(epoch from clock_timestamp())*1000); count_now integer;
BEGIN
 IF length(p_key)>100 OR p_limit<1 OR p_limit>10000 OR p_window_ms<1000 OR p_window_ms>86400000 THEN RAISE EXCEPTION 'Invalid rate limit'; END IF;
 DELETE FROM khaga_private.documents WHERE kind='session' AND (body->>'expiresAt')::bigint<=now_ms;
 DELETE FROM khaga_private.rate_limits WHERE until_ms<now_ms;
 INSERT INTO khaga_private.rate_limits(key,hits,until_ms) VALUES(p_key,1,now_ms+p_window_ms)
 ON CONFLICT(key) DO UPDATE SET hits=khaga_private.rate_limits.hits+1
 RETURNING hits INTO count_now;
 RETURN jsonb_build_object('allowed',count_now<=p_limit);
END $$;
CREATE OR REPLACE FUNCTION public.khaga_audit() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) FROM (SELECT actor,kind,record_id,version,at FROM khaga_private.audit_log ORDER BY id DESC LIMIT 100) a;
$$;
-- PUBLIC EXECUTE is the Postgres default. Explicitly revoke it for EVERY RPC.
REVOKE ALL ON FUNCTION public.khaga_status() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.khaga_get(text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.khaga_list(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.khaga_write(text,text,integer,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.khaga_remove_session(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.khaga_rate(text,integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.khaga_audit() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.khaga_status(),public.khaga_get(text,text),public.khaga_list(text),public.khaga_write(text,text,integer,jsonb,text),public.khaga_remove_session(text),public.khaga_rate(text,integer,integer),public.khaga_audit() TO service_role;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('khaga-product-media','khaga-product-media',false,5242880,ARRAY['image/png']) ON CONFLICT(id) DO NOTHING;
-- The server refuses to start with management enabled if this bucket is public.
-- No anon/authenticated Storage policies are created. Only the server secret key
-- accesses originals; Node authorizes each delivery using the published snapshot.
NOTIFY pgrst, 'reload schema';
COMMIT;
