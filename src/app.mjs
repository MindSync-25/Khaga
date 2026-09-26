import {createServer} from 'node:http';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,join,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,timingSafeEqual} from 'node:crypto';
import {products,byId,colours,sizes} from './catalog.mjs';
import {artwork,brandSvg} from './artwork.mjs';
import {home,collection,productPage,storyPage,helpPage,bagPage,notFound} from './views.mjs';
const publicRoot=fileURLToPath(new URL('../public/',import.meta.url));
const types={'.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.avif':'image/avif','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.json':'application/json; charset=utf-8'};
const assets=new Map();
function indexAssets(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())indexAssets(path);else if(types[extname(path)]){const data=readFileSync(path);assets.set('/'+path.slice(publicRoot.length).replaceAll('\\','/'),{data,type:types[extname(path)],etag:'"'+createHash('sha256').update(data).digest('hex').slice(0,24)+'"'});}}}
indexAssets(publicRoot);
const security={
 'X-Content-Type-Options':'nosniff',
 'X-Frame-Options':'DENY',
 'Referrer-Policy':'strict-origin-when-cross-origin',
 'Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=()',
 'X-Robots-Tag':'noindex, nofollow, noarchive',
 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
};
const digest=value=>createHash('sha256').update(value).digest();
const artworkCache=new Map();
const catalog=JSON.stringify({version:1,preview:true,products,colours,sizes});
export function createApp({username=process.env.PREVIEW_USERNAME||'',password=process.env.PREVIEW_PASSWORD||''}={}){
 if(Boolean(username)!==Boolean(password))throw new Error('Set both PREVIEW_USERNAME and PREVIEW_PASSWORD, or neither.');
 return createServer((req,res)=>{
  const head=req.method==='HEAD';
  const send=(status,body,type='text/html; charset=utf-8',extra={})=>{res.writeHead(status,{...security,'Cache-Control':'no-store','Content-Type':type,...extra,...(username?{'Cache-Control':'private, no-store'}:{})});res.end(head?'':body);};
  try{
   if(username&&password){const expected='Basic '+Buffer.from(username+':'+password).toString('base64');if(!timingSafeEqual(digest(req.headers.authorization||''),digest(expected))){send(401,'Preview access requires authentication.','text/plain; charset=utf-8',{'WWW-Authenticate':'Basic realm="KHAGA preview", charset="UTF-8"'});return;}}
   if((req.url||'').length>4096){send(414,'Request URI too long.','text/plain');return;}
   const url=new URL(req.url||'/','http://localhost');
   let path;try{path=decodeURIComponent(url.pathname);}catch{send(400,'Invalid URL encoding.','text/plain');return;}
   if(path.includes('\0')||path.includes('\\')){send(400,'Invalid path.','text/plain');return;}
   // Checkout is closed on the server, regardless of browser state or env vars.
   if(path==='/api/checkout'){send(403,JSON.stringify({error:'PREVIEW_ONLY',message:'Orders and payments are not enabled.'}),'application/json');return;}
   if(!['GET','HEAD'].includes(req.method||'')){send(405,'Method not allowed.','text/plain',{'Allow':'GET, HEAD'});return;}
   if(path==='/health'||path==='/api/health'){send(200,JSON.stringify({status:'ok',app:'khaga-storefront',version:'0.1.0',mode:'preview'}),'application/json');return;}
   if(path==='/robots.txt'){send(200,'User-agent: *\nDisallow: /\n','text/plain; charset=utf-8');return;}
   if(path==='/api/catalog'){send(200,catalog,'application/json; charset=utf-8',{'Cache-Control':'public, max-age=60'});return;}
   if(path==='/brand/wordmark.svg'||path==='/brand/emblem.svg'){send(200,brandSvg({wordmark:path.includes('wordmark'),emblem:path.includes('emblem')}),'image/svg+xml',{'Cache-Control':'public, max-age=3600'});return;}
   const art=path.match(/^\/media\/([a-z-]+)\/([a-z-]+)\/(front|back|detail)\.svg$/);
   if(art){const p=byId.get(art[1]);if(!p||!p.colours.includes(art[2])){send(404,'Image not found.','text/plain');return;}const transparent=url.searchParams.get('background')==='transparent',key=path+(transparent?'?transparent':'');if(!artworkCache.has(key))artworkCache.set(key,artwork(p,art[2],art[3],transparent));send(200,artworkCache.get(key),'image/svg+xml',{'Cache-Control':'public, max-age=3600'});return;}
   const asset=assets.get(path);
   if(asset){if(req.headers['if-none-match']===asset.etag){res.writeHead(304,{...security,'ETag':asset.etag,'Cache-Control':username?'private, no-store':'public, max-age=3600'});res.end();return;}send(200,asset.data,asset.type,{'ETag':asset.etag,'Cache-Control':'public, max-age=3600'});return;}
   if(path!=='/'&&path.endsWith('/')){send(308,'','text/plain',{'Location':path.slice(0,-1)+url.search});return;}
   if(path==='/'){send(200,home());return;}
   if(path==='/collection'||path==='/search'){send(200,collection(url.searchParams,path==='/search'));return;}
   const pMatch=path.match(/^\/products\/([a-z-]+)$/);
   if(pMatch){const p=byId.get(pMatch[1]);send(p?200:404,p?productPage(p,url.searchParams.get('colour')):notFound());return;}
   if(path==='/story'){send(200,storyPage());return;}
   if(path==='/bag'){send(200,bagPage());return;}
   if(path==='/checkout'){send(200,helpPage('preview'));return;}
   const help=path.match(/^\/help\/(preview|sizing|delivery|care|privacy|terms)$/);
   if(help){send(200,helpPage(help[1]));return;}
   send(404,notFound());
  }catch(error){console.error('KHAGA request failed:',error instanceof Error?error.message:'Unknown error');if(!res.headersSent)send(500,'The preview is temporarily unavailable. Please try again.','text/plain');else res.end();}
 });
}
