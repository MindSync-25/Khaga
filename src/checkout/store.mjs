import {requireThat as need} from '../management/errors.mjs';
const decode = row => row ? {...row,body:typeof row.body==='string'?JSON.parse(row.body):row.body} : null;
export class SupabaseOrderStore {
 constructor(repo){this.repo=repo;}
 async call(name,args={}){return this.repo.rpc('checkout_'+name,args);}
 async ready(){const v=await this.call('status');need(v?.schema===1 && v.mode==='test',503,'CHECKOUT_SCHEMA_REQUIRED','Apply migrations/002_test_checkout.sql before enabling test checkout.');}
 async create(o){return this.call('create',{p_id:o.id,p_guest:o.guest_hash,p_key:o.request_key,p_fingerprint:o.fingerprint,p_body:o.body});}
 async get(id){return this.call('get',{p_id:id});}
 async find(provider){return this.call('find',{p_provider:provider});}
 async list(guest=null,offset=0){return this.call('list',{p_guest:guest,p_offset:offset});}
 async bind(id,provider){return this.call('bind',{p_id:id,p_provider:provider});}
 async uncertain(id){await this.call('uncertain',{p_id:id});}
 async mark(id,provider,payment,status,event=null){return this.call('mark',{p_id:id,p_provider:provider,p_payment:payment,p_status:status,p_event:event});}
}
// Only used with the existing explicitly local-development SQLite driver.
export class SQLiteOrderStore {
 constructor(repo){this.db=repo.db;this.db.exec(`CREATE TABLE IF NOT EXISTS test_orders (
 id TEXT PRIMARY KEY,guest_hash TEXT NOT NULL,request_key TEXT NOT NULL,fingerprint TEXT NOT NULL,
 body TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'creating',provider_id TEXT UNIQUE,payment_id TEXT UNIQUE,
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(guest_hash,request_key));
 CREATE TABLE IF NOT EXISTS test_payment_events(digest TEXT PRIMARY KEY,order_id TEXT NOT NULL);`);}
 async ready(){}
 async create(o){
  const now=new Date().toISOString();
  const result=this.db.prepare(`INSERT INTO test_orders(id,guest_hash,request_key,fingerprint,body,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(guest_hash,request_key) DO NOTHING`).run(o.id,o.guest_hash,o.request_key,o.fingerprint,JSON.stringify(o.body),now,now);
  const order=decode(this.db.prepare('SELECT * FROM test_orders WHERE guest_hash=? AND request_key=?').get(o.guest_hash,o.request_key));
  return {created:result.changes===1,order};
 }
 async get(id){return decode(this.db.prepare('SELECT * FROM test_orders WHERE id=?').get(id));}
 async find(provider){return decode(this.db.prepare('SELECT * FROM test_orders WHERE provider_id=?').get(provider));}
 async list(guest=null,offset=0){return this.db.prepare('SELECT * FROM test_orders WHERE ? IS NULL OR guest_hash=? ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET ?').all(guest,guest,offset).map(decode);}
 async bind(id,provider){
  const r=await this.get(id);need(r && (!r.provider_id || r.provider_id===provider),409,'PAYMENT_MISMATCH','Order binding conflict.');
  this.db.prepare("UPDATE test_orders SET provider_id=?,status='payment_pending',updated_at=? WHERE id=? AND provider_id IS NULL AND status IN ('creating','creation_unknown')").run(provider,new Date().toISOString(),id);
  return this.get(id);
 }
 async uncertain(id){this.db.prepare("UPDATE test_orders SET status='creation_unknown' WHERE id=? AND status='creating'").run(id);}
 async mark(id,provider,payment,status,event=null){
  this.db.exec('BEGIN IMMEDIATE');
  try {
   const r=decode(this.db.prepare('SELECT * FROM test_orders WHERE id=?').get(id));
   need(r && r.provider_id===provider && (!r.payment_id || r.payment_id===payment) && ['paid','refund_review'].includes(status),409,'PAYMENT_MISMATCH','Payment binding conflict.');
   if(event){const inserted=this.db.prepare('INSERT INTO test_payment_events(digest,order_id) VALUES(?,?) ON CONFLICT(digest) DO NOTHING').run(event,id);if(!inserted.changes){this.db.exec('COMMIT');return r;}}
   this.db.prepare("UPDATE test_orders SET status=CASE WHEN status='refund_review' THEN status ELSE ? END,payment_id=?,updated_at=? WHERE id=?").run(status,payment,new Date().toISOString(),id);
   this.db.exec('COMMIT');return this.get(id);
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
}
export function orderStore(repo){return repo.driver==='supabase'?new SupabaseOrderStore(repo):new SQLiteOrderStore(repo);}
