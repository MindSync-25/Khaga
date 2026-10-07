// Disposable LOCAL database harness. Never use this against Supabase/production.
import {HttpError} from '../../src/management/errors.mjs';
import {products as seedProducts} from '../../src/catalog.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
const exec=promisify(execFile);
export async function sql(query){const {stdout}=await exec('psql',['-h','127.0.0.1','-p','55439','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1','-c',query],{maxBuffer:2e6});return stdout.trim();}
export const literal=s=>"'"+String(s).replaceAll("'","''")+"'";
export async function setup(){
 await sql(`DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$; CREATE SCHEMA IF NOT EXISTS storage; CREATE TABLE IF NOT EXISTS storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
 for(const f of ['001_management.sql','002_test_checkout.sql','003_commerce.sql'])await sql(await readFile(new URL('../../migrations/'+f,import.meta.url),'utf8'));
}
export class LocalRepository{
 async rpc(name,args={}){const keys=Object.keys(args);const result=await sql(`SELECT public.khaga_${name}(${keys.map(k=>k+' => '+(args[k]===null?'NULL':literal(typeof args[k]==='object'?JSON.stringify(args[k]):args[k]))).join(',')})`);return result?JSON.parse(result):null;}
 list(kind){return this.rpc('list',{p_kind:kind});}
 async takeRate(key,limit,window){return (await this.rpc('rate',{p_key:key,p_limit:limit,p_window_ms:window})).allowed;}
}
export const policy={mode:'test',enabled:true,version:1,shippingPaise:10000,freeShippingAt:200000,taxBps:1800,taxTreatment:'inclusive',taxShipping:true,taxNote:'Fixture policy only. Not approved for customers.'};
export async function seedProduct(id,capacity=3){
 const p={...seedProducts[0],id,name:'Fixture tee',number:'99',colours:['ivory'],sizes:['M'],price:100000,sampleApproved:true,palette:{ivory:{name:'Ivory',hex:'#ffffff',ink:'#000000'}},media:{ivory:{}},variants:[{colour:'ivory',size:'M',mode:'stock',quantity:capacity,dispatchMin:null,dispatchMax:null}]};
 await sql(`INSERT INTO khaga_private.documents VALUES('product',${literal(id)},1,${literal(JSON.stringify({published:p,draft:p}))},0) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body;`);
 return p;
}
export const deliveryPolicy={...policy,shippingPaise:0,freeShippingAt:null};
export const fixturePinLookup=async pin=>{
 if(pin==='560002')throw Error('Fixture lookup outage');
 if(pin==='999999')throw new HttpError(422,'INVALID_ADDRESS','We couldn’t find that PIN code. Please check your delivery address.');
 return pin==='560001'?{state:'Karnataka'}:pin==='400001'?{state:'Maharashtra'}:null;
};
export async function seedPolicy(mode='test'){await sql(`INSERT INTO khaga_private.commerce_policy VALUES(${literal(mode)},${literal(JSON.stringify({...deliveryPolicy,mode}))}) ON CONFLICT(mode) DO UPDATE SET settings=excluded.settings`);}
