import {randomBytes, createHash, timingSafeEqual, scrypt as scryptCallback} from 'node:crypto';
import {promisify} from 'node:util';
import {HttpError,requireThat} from './errors.mjs';
const scrypt=promisify(scryptCallback);
export const digest=value=>createHash('sha256').update(String(value)).digest('hex');
export const token=()=>randomBytes(32).toString('hex');
export function equal(a,b){return timingSafeEqual(Buffer.from(digest(a)),Buffer.from(digest(b)));}
export async function hashPassword(password) {
  requireThat(typeof password==='string' && password.length>=16 && Buffer.byteLength(password)<=1024,422,'PASSWORD_POLICY','Use a password of at least 16 characters (up to 1024 UTF-8 bytes).');
  const salt=randomBytes(16).toString('hex');
  const key=await scrypt(password,Buffer.from(salt,'hex'),64,{N:65536,r:8,p:2,maxmem:96*1024*1024});
  return `scrypt$65536$8$2$${salt}$${key.toString('hex')}`;
}
let runningHashes=0;
export async function verifyPassword(password,encoded) {
  if(typeof password!=='string' || Buffer.byteLength(password)>1024 || !/^scrypt\$65536\$8\$2\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(encoded)) return false;
  if(runningHashes>=2)throw new HttpError(429,'AUTH_BUSY','Please wait before trying again.');
  runningHashes++;
  try{const parts=encoded.split('$'); const key=await scrypt(password,Buffer.from(parts[4],'hex'),64,{N:65536,r:8,p:2,maxmem:96*1024*1024}); return timingSafeEqual(key,Buffer.from(parts[5],'hex'));}
  finally{runningHashes--;}
}
export function cookies(req){
  const values=Object.create(null);
  for(const item of String(req.headers.cookie||'').split(';')){const n=item.indexOf('=');if(n<1)continue;const key=item.slice(0,n).trim(); if(Object.hasOwn(values,key)){values[key]='';continue;}values[key]=item.slice(n+1).trim();}
  return values;
}
export function sessionCookie(config,value,maxAge=28800){
  const name=config.secure?'__Host-khaga_admin':'khaga_admin_local';
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${config.secure?'; Secure':''}`;
}
export function checkOrigin(req,config) {
  requireThat(req.headers.origin===config.origin,403,'ORIGIN_DENIED','This action must come from the KHAGA admin website.');
  requireThat(!req.headers['sec-fetch-site'] || req.headers['sec-fetch-site']==='same-origin',403,'CROSS_SITE_DENIED','Cross-site requests are not accepted.');
}
export async function readBody(req,limit=196608) {
  requireThat(!req.headers['content-encoding'] || req.headers['content-encoding']==='identity',415,'ENCODING_NOT_ALLOWED','Compressed request bodies are not supported.');
  requireThat(!req.headers['content-length'] || /^\d+$/.test(req.headers['content-length'])&&Number(req.headers['content-length'])<=limit,413,'BODY_TOO_LARGE','The request is too large.');
  const chunks=[];let length=0;const timeout=setTimeout(()=>req.destroy(),15000);timeout.unref();
  try {for await (const chunk of req){length+=chunk.length;if(length>limit)throw new HttpError(413,'BODY_TOO_LARGE','The request is too large.');chunks.push(chunk);}return Buffer.concat(chunks);}
  finally{clearTimeout(timeout);}
}
export async function readJSON(req){
  requireThat(/^application\/json(?:;|$)/i.test(req.headers['content-type']||''),415,'JSON_REQUIRED','Send application/json.');
  try{const value=JSON.parse((await readBody(req)).toString('utf8'));requireThat(value&&typeof value==='object'&&!Array.isArray(value),400,'INVALID_JSON','Expected a JSON object.');return value;}
  catch(e){if(e instanceof HttpError)throw e;throw new HttpError(400,'INVALID_JSON','The JSON request could not be read.');}
}
export const adminHeaders={
  'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow, noarchive',
  'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
};
