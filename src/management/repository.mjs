import {mkdirSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {HttpError,requireThat} from './errors.mjs';
const kinds=new Set(['product','asset','session']);
function validKey(kind,id){requireThat(kinds.has(kind)&&typeof id==='string'&&/^[a-z0-9_-]{1,100}$/.test(id),400,'INVALID_KEY','Invalid storage key.');}
function record(row){return row?{id:row.id,version:Number(row.version),body:typeof row.body==='string'?JSON.parse(row.body):row.body,updatedAt:Number(row.updated_at)}:null;}
export class SupabaseRepository {
 constructor(config,fetcher=fetch){this.config=config;this.fetcher=fetcher;this.driver='supabase';}
 async request(path,{method='GET',json,body,headers={}}={}){
  let response;try{response=await this.fetcher(this.config.supabaseURL+path,{method,headers:{apikey:this.config.secretKey,...(json!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:json!==undefined?JSON.stringify(json):body,signal:AbortSignal.timeout(12000),redirect:'error'});}catch{throw new HttpError(503,'STORAGE_UNAVAILABLE','The persistent store is temporarily unavailable.');}
  if(!response.ok){const diagnostics={401:['STORAGE_AUTH_FAILED','Supabase rejected server authentication. Verify the key belongs to this project.'],403:['STORAGE_ACCESS_DENIED','Supabase denied this operation. Check the migration grants and server key.'],404:['STORAGE_NOT_FOUND','A required Supabase function or private bucket was not found.'],429:['STORAGE_RATE_LIMITED','Supabase requested a slower retry.']};if(diagnostics[response.status]){const [code,message]=diagnostics[response.status];throw new HttpError(503,code,message);}if(response.status===422)throw new HttpError(422,'STORE_VALIDATION','The saved data conflicts with an existing published colour. Refresh and use a unique colour key.');if(response.status===409)throw new HttpError(409,'EDIT_CONFLICT','This item changed elsewhere. Reload it before saving.');throw new HttpError(503,'STORAGE_UNAVAILABLE','The persistent store request did not complete.');}
  return response;
 }
 async rpc(name,args){return (await this.request('/rest/v1/rpc/khaga_'+name,{method:'POST',json:args})).json();}
 async ready(){
  try{const v=await this.rpc('status',{});requireThat(v?.schema===1,503,'SCHEMA_REQUIRED','Apply the KHAGA database migration first.');}catch(error){error.stage='schema';throw error;}
  try{const b=await(await this.request('/storage/v1/bucket/'+encodeURIComponent(this.config.bucket))).json();requireThat(b.public===false,503,'PRIVATE_BUCKET_REQUIRED','KHAGA product media must use a private bucket.');}catch(error){error.stage='media';throw error;}
 }
 async get(kind,id){validKey(kind,id);return record(await this.rpc('get',{p_kind:kind,p_id:id}));}
 async list(kind){requireThat(kinds.has(kind),400,'INVALID_KEY','Invalid storage kind.');return (await this.rpc('list',{p_kind:kind})).map(record);}
 async cas(kind,id,expected,body,actor='system'){validKey(kind,id);return record(await this.rpc('write',{p_kind:kind,p_id:id,p_expected:expected,p_body:body,p_actor:actor}));}
 async removeSession(id){validKey('session',id);await this.rpc('remove_session',{p_id:id});}
 async takeRate(key,limit,windowMs){const data=await this.rpc('rate',{p_key:key,p_limit:limit,p_window_ms:windowMs});return data.allowed;}
 async audit(){return this.rpc('audit',{});}
 async putObject(key,bytes){checkObjectKey(key);await this.request('/storage/v1/object/'+encodeURIComponent(this.config.bucket)+'/'+key,{method:'POST',body:bytes,headers:{'Content-Type':'image/png','x-upsert':'false','Cache-Control':'no-store'}});}
 async getObject(key){checkObjectKey(key);const r=await this.request('/storage/v1/object/authenticated/'+encodeURIComponent(this.config.bucket)+'/'+key);const n=Number(r.headers.get('content-length'));requireThat(!n||n<=5242880,503,'INVALID_STORED_IMAGE','Stored image is too large.');const bytes=Buffer.from(await r.arrayBuffer());requireThat(bytes.length<=5242880,503,'INVALID_STORED_IMAGE','Stored image is too large.');return bytes;}
 async deleteObject(key){checkObjectKey(key);await this.request('/storage/v1/object/'+encodeURIComponent(this.config.bucket),{method:'DELETE',json:{prefixes:[key]}});}
 async close(){}
}
function checkObjectKey(key){requireThat(typeof key==='string'&&/^[a-z0-9-]+\/[a-f0-9-]{36}\.png$/.test(key),400,'INVALID_OBJECT_KEY','Invalid image object key.');}
export class SQLiteRepository {
 static async open(path){const {DatabaseSync}=await import('node:sqlite');return new SQLiteRepository(path,DatabaseSync);}
 constructor(path,DatabaseSync){
  this.driver='sqlite';this.path=path;mkdirSync(path,{recursive:true,mode:0o700});mkdirSync(join(path,'objects'),{recursive:true,mode:0o700});
  this.db=new DatabaseSync(join(path,'khaga.sqlite'));this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
  CREATE TABLE IF NOT EXISTS documents(kind TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,body TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(kind,id));
  CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT NOT NULL,kind TEXT NOT NULL,record_id TEXT NOT NULL,version INTEGER NOT NULL,at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS rates(key TEXT PRIMARY KEY,count INTEGER NOT NULL,until_ms INTEGER NOT NULL);`);
 }
 async ready(){}
 async get(kind,id){validKey(kind,id);return record(this.db.prepare('SELECT * FROM documents WHERE kind=? AND id=?').get(kind,id));}
 async list(kind){requireThat(kinds.has(kind),400,'INVALID_KEY','Invalid storage kind.');return this.db.prepare('SELECT * FROM documents WHERE kind=? ORDER BY id').all(kind).map(record);}
 async cas(kind,id,expected,body,actor='system'){
  validKey(kind,id);this.db.exec('BEGIN IMMEDIATE');
  try{
   const previous=this.db.prepare('SELECT version FROM documents WHERE kind=? AND id=?').get(kind,id);
   if((previous?.version||0)!==expected)throw new HttpError(409,'EDIT_CONFLICT','This item changed elsewhere. Reload it before saving.');
   if(kind==='product'&&body.published){
    const others=this.db.prepare("SELECT body FROM documents WHERE kind='product' AND id<>?").all(id);
    for(const row of others){const p=JSON.parse(row.body).published;if(!p)continue;
     for(const [key,shade] of Object.entries(body.published.palette||{})){const other=p.palette?.[key];if(other)requireThat(['name','hex','ink'].every(k=>other[k]===shade[k]),422,'COLOUR_KEY_CONFLICT','A different published shade already uses this colour key.');}
    }
   }
   const version=expected+1,now=Date.now();
   this.db.prepare('INSERT INTO documents(kind,id,version,body,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET version=excluded.version,body=excluded.body,updated_at=excluded.updated_at').run(kind,id,version,JSON.stringify(body),now);
   if(kind!=='session')this.db.prepare('INSERT INTO audit(actor,kind,record_id,version,at) VALUES(?,?,?,?,?)').run(actor,kind,id,version,now);
   this.db.exec('COMMIT');return {id,version,body:structuredClone(body),updatedAt:now};
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 async removeSession(id){this.db.prepare('DELETE FROM documents WHERE kind=? AND id=?').run('session',id);}
 async takeRate(key,limit,windowMs){
  const now=Date.now();this.db.exec('BEGIN IMMEDIATE');
  try{this.db.prepare("DELETE FROM documents WHERE kind='session' AND json_extract(body,'$.expiresAt')<=?").run(now);this.db.prepare('DELETE FROM rates WHERE until_ms<?').run(now);const r=this.db.prepare('SELECT * FROM rates WHERE key=?').get(key);
   if(r&&r.count>=limit){this.db.exec('COMMIT');return false;}
   this.db.prepare('INSERT INTO rates(key,count,until_ms) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count').run(key,(r?.count||0)+1,r?.until_ms||now+windowMs);
   this.db.exec('COMMIT');return true;
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 async audit(){return this.db.prepare('SELECT actor,kind,record_id,version,at FROM audit ORDER BY id DESC LIMIT 100').all();}
 async putObject(key,bytes){checkObjectKey(key);const path=join(this.path,'objects',key);mkdirSync(join(path,'..'),{recursive:true,mode:0o700});writeFileSync(path,bytes,{flag:'wx',mode:0o600});}
 async getObject(key){checkObjectKey(key);return readFileSync(join(this.path,'objects',key));}
 async deleteObject(key){checkObjectKey(key);try{unlinkSync(join(this.path,'objects',key));}catch(e){if(e.code!=='ENOENT')throw e;}}
 async close(){this.db.close();}
}
export async function openRepository(config){const repo=config.driver==='supabase'?new SupabaseRepository(config):await SQLiteRepository.open(config.dataDir);await repo.ready();return repo;}
