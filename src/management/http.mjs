import {readFileSync} from 'node:fs';
import {HttpError,requireThat} from './errors.mjs';
import {cookies,sessionCookie,checkOrigin,readBody,readJSON,token,digest,equal,verifyPassword,adminHeaders} from './security.mjs';
import {validateProduct,saveProduct,publishProduct,seedCatalogue,assetId} from './catalogue.mjs';
import {normalizePNG,MAX_IMAGE_BYTES} from './png.mjs';
const page=readFileSync(new URL('../../public/admin/index.html',import.meta.url),'utf8');
const now=()=>Date.now();
export function managementService(repo,config){
 const credentialTag=digest(config.email+'|'+config.passwordHash);
 async function session(req){
  if(!config.enabled)return null;
  const raw=cookies(req)[config.secure?'__Host-khaga_admin':'khaga_admin_local'];if(!/^[a-f0-9]{64}$/.test(raw||''))return null;
  const found=await repo.get('session',digest(raw));
  if(!found||found.body.expiresAt<=now()||found.body.credentialTag!==credentialTag)return null;
  return {...found.body,id:found.id};
 }
 async function auth(req,mutate=false){const s=await session(req);requireThat(s,401,'ADMIN_LOGIN_REQUIRED','Please sign in to manage KHAGA.');if(mutate){checkOrigin(req,config);requireThat(equal(req.headers['x-csrf-token']||'',s.csrf),403,'CSRF_DENIED','Refresh your admin session and try again.');}return s;}
 async function handle(req,res,path){
  if(path!=='/admin'&&path!=='/admin/'&&!path.startsWith('/api/admin/')&&!path.startsWith('/product-media/'))return false;
  const reply=(status,value,extra={})=>{const html=typeof value==='string';res.writeHead(status,{...adminHeaders,'Content-Type':html?'text/html; charset=utf-8':'application/json; charset=utf-8',...extra});res.end(req.method==='HEAD'?'':html?value:JSON.stringify(value));};
  try{
   const mutates=!['GET','HEAD'].includes(req.method);
   if(path.startsWith('/product-media/')){
    requireThat(!mutates,405,'METHOD_NOT_ALLOWED','Use GET.');
    const id=path.match(/^\/product-media\/([a-f0-9-]{36})\.png$/)?.[1];requireThat(id,404,'NOT_FOUND','Image not found.');
    const asset=await repo.get('asset',id);requireThat(asset&&!asset.body.deleted,404,'NOT_FOUND','Image not found.');
    const product=await repo.get('product',asset.body.product);const pub=product?.body.published;
    const isPublished=pub&&Object.values(pub.media?.[asset.body.colour]||{}).some(m=>m.id===id);
    requireThat(isPublished||await session(req),404,'NOT_FOUND','Image not found.');
    const bytes=await repo.getObject(asset.body.objectKey);
    res.writeHead(200,{...adminHeaders,'Content-Type':'image/png','Content-Length':bytes.length,'Content-Disposition':'inline','Cache-Control':isPublished?'public, max-age=0, must-revalidate':'private, no-store'});res.end(req.method==='HEAD'?'':bytes);return true;
   }
   requireThat(config.enabled,503,'ADMIN_NOT_CONFIGURED','Admin is not enabled. Configure the persistent store and owner credentials first.');
   if(path==='/admin'||path==='/admin/'){
    requireThat(!mutates,405,'METHOD_NOT_ALLOWED','Use GET.');reply(200,page);return true;
   }
   if(path==='/api/admin/login'){
    requireThat(req.method==='POST',405,'METHOD_NOT_ALLOWED','Use POST.');checkOrigin(req,config);const input=await readJSON(req);
    const identity=String(input.email||'').trim().toLowerCase().slice(0,254);
    // Never trust client-supplied X-Forwarded-For as an authenticated IP address.
    const globalAllowed=await repo.takeRate('login-global',60,900000);
    const accountAllowed=await repo.takeRate('login-'+digest(identity),10,900000);
    requireThat(globalAllowed&&accountAllowed,429,'LOGIN_RATE_LIMIT','Too many attempts. Please wait 15 minutes before retrying.');
    const passwordOK=await verifyPassword(input.password,config.passwordHash);
    requireThat(passwordOK&&equal(identity,config.email),401,'INVALID_LOGIN','The email or password is incorrect.');
    const raw=token(),csrf=token(),expiresAt=now()+config.sessionHours*3600000;
    const previous=cookies(req)[config.secure?'__Host-khaga_admin':'khaga_admin_local'];if(/^[a-f0-9]{64}$/.test(previous||''))await repo.removeSession(digest(previous));
    await repo.cas('session',digest(raw),0,{email:config.email,csrf,expiresAt,credentialTag},'authentication');
    reply(200,{email:config.email,csrf,expiresAt,driver:repo.driver},{'Set-Cookie':sessionCookie(config,raw)});return true;
   }
   const staff=await auth(req,mutates);
   if(path==='/api/admin/session'&&!mutates){reply(200,{email:staff.email,csrf:staff.csrf,expiresAt:staff.expiresAt,driver:repo.driver,checkout:'disabled'});return true;}
   if(path==='/api/admin/logout'&&req.method==='POST'){await repo.removeSession(staff.id);reply(200,{ok:true},{'Set-Cookie':sessionCookie(config,'',0)});return true;}
   if(path==='/api/admin/products'&&!mutates){reply(200,{products:await repo.list('product')});return true;}
   if(path==='/api/admin/audit'&&!mutates){reply(200,{events:await repo.audit()});return true;}
   if(path==='/api/admin/import'&&req.method==='POST'){await readJSON(req);reply(200,{inserted:await seedCatalogue(repo)});return true;}
   const productMatch=path.match(/^\/api\/admin\/products\/([a-z0-9-]+)(?:\/(publish|unpublish))?$/);
   if(productMatch){
    const [,id,action]=productMatch;
    if(req.method==='GET'&&!action){const r=await repo.get('product',id);requireThat(r,404,'NOT_FOUND','Product not found.');reply(200,r);return true;}
    const input=await readJSON(req);requireThat(Number.isSafeInteger(input.version)&&input.version>=0,422,'VERSION_REQUIRED','A valid edit version is required.');
    if(req.method==='PUT'&&!action){reply(200,await saveProduct(repo,id,input.version,input.product,staff.email));return true;}
    if(req.method==='POST'&&action){reply(200,await publishProduct(repo,id,input.version,action==='publish',staff.email));return true;}
    throw new HttpError(405,'METHOD_NOT_ALLOWED','Unsupported product operation.');
   }
   if(path==='/api/admin/media'&&req.method==='POST'){
    requireThat(await repo.takeRate('uploads-'+digest(staff.email),40,60000),429,'UPLOAD_RATE_LIMIT','Please wait before uploading more images.');
    requireThat(req.headers['content-type']==='image/png',415,'PNG_REQUIRED','Use the image uploader to normalize your image.');
    const url=new URL(req.url,config.origin),productId=url.searchParams.get('product'),colour=url.searchParams.get('colour');
    const r=await repo.get('product',productId||'invalid');requireThat(r&&r.body.draft.colours.includes(colour),422,'INVALID_VARIANT','Save this product and colour before uploading an image.');
    const normalized=normalizePNG(await readBody(req,MAX_IMAGE_BYTES));const id=assetId(),objectKey=`${productId}/${id}.png`;
    await repo.putObject(objectKey,normalized.bytes);
    // If metadata recording fails leave an unattached object, never a public URL.
    // Retry uses a new UUID; orphan cleanup is a separate audited operator task.
    await repo.cas('asset',id,0,{product:productId,colour,objectKey,width:normalized.width,height:normalized.height,bytes:normalized.bytes.length,createdAt:now()},staff.email);
    reply(201,{id,url:`/product-media/${id}.png`,width:normalized.width,height:normalized.height});return true;
   }
   if(path==='/api/admin/media'&&req.method==='GET'){const productId=new URL(req.url,config.origin).searchParams.get('product');reply(200,{assets:(await repo.list('asset')).filter(a=>!productId||a.body.product===productId).map(a=>({id:a.id,...a.body,objectKey:undefined,url:`/product-media/${a.id}.png`}))});return true;}
   throw new HttpError(404,'NOT_FOUND','Admin operation not found.');
  }catch(error){if(!(error instanceof HttpError))console.error('KHAGA admin request failed:',error.name);reply(error.status||503,{error:error.code||'SERVICE_UNAVAILABLE',message:error instanceof HttpError?error.message:'The operation did not complete. Try again.'},error.status===429?{'Retry-After':'900'}:{});return true;}
 }
 return {handle,session,repo,config};
}
