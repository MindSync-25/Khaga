import {randomUUID,createHash} from 'node:crypto';
import {products as seeds,colours as seedColours,sizes as seedSizes} from '../catalog.mjs';
import {HttpError,requireThat} from './errors.mjs';
export const imageViews=['front','back','detail','model'];
const slug=/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function text(value,name,max,min=0){requireThat(typeof value==='string'&&value.length<=max&&value.trim().length>=min&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value),422,'INVALID_PRODUCT',`${name} must contain ${min}–${max} characters.`);return value.trim();}
function int(value,min,max,name){requireThat(Number.isSafeInteger(value)&&value>=min&&value<=max,422,'INVALID_PRODUCT',`${name} must be a whole number between ${min} and ${max}.`);return value;}
function uniqueStrings(values,name,min,max,pattern){requireThat(Array.isArray(values)&&values.length>=min&&values.length<=max&&new Set(values).size===values.length&&values.every(v=>typeof v==='string'&&pattern.test(v)),422,'INVALID_PRODUCT',`Invalid ${name}.`);return [...values];}
export function validateProduct(input){
 requireThat(input&&typeof input==='object'&&!Array.isArray(input),422,'INVALID_PRODUCT','Invalid product.');
 const p={};p.id=text(input.id,'Product id',64,2);requireThat(slug.test(p.id),422,'INVALID_PRODUCT','Use a lowercase, hyphenated product id.');
 p.name=text(input.name,'Name',90,2);p.number=text(input.number,'Collection number',8,1);
 p.category=input.category;requireThat(['tees','shirts'].includes(p.category),422,'INVALID_PRODUCT','Choose T-shirts or Shirts.');
 p.price=int(input.price,100,100000000,'Price in paise');
 for(const [key,max,min] of [['note',140,1],['headline',200,1],['description',2400,10],['story',2400,0]])p[key]=text(input[key],key,max,min);
 requireThat(Array.isArray(input.details)&&input.details.length<=12,422,'INVALID_PRODUCT','Use up to 12 design details.');p.details=input.details.map(x=>text(x,'Design detail',240,1));
 p.colours=uniqueStrings(input.colours,'colours',1,16,slug);p.sizes=uniqueStrings(input.sizes,'sizes',1,12,/^[A-Za-z0-9 -]{1,12}$/);
 p.palette={};for(const c of p.colours){const v=input.palette?.[c];requireThat(v&&/^#[0-9a-fA-F]{6}$/.test(v.hex)&&/^#[0-9a-fA-F]{6}$/.test(v.ink),422,'INVALID_COLOUR','Each colour needs valid six-digit hex values.');p.palette[c]={name:text(v.name,'Colour name',50,1),hex:v.hex.toLowerCase(),ink:v.ink.toLowerCase()};}
 p.media={};p.galleryOrder={};
 for(const c of p.colours){p.media[c]={};for(const view of imageViews){const m=input.media?.[c]?.[view];if(!m)continue;requireThat(uuid.test(m.id),422,'INVALID_MEDIA','Invalid image id.');p.media[c][view]={id:m.id,alt:text(m.alt,'Image description',200,5)};}
  const order=input.galleryOrder?.[c]||imageViews.filter(v=>p.media[c][v]);p.galleryOrder[c]=uniqueStrings(order,'image order',0,4,/^(front|back|detail|model)$/);requireThat(p.galleryOrder[c].every(v=>p.media[c][v]),422,'INVALID_MEDIA','Image order references an empty slot.');
  for(const v of Object.keys(p.media[c]))if(!p.galleryOrder[c].includes(v))p.galleryOrder[c].push(v);
 }
 p.variants=[];for(const c of p.colours)for(const size of p.sizes){const v=(Array.isArray(input.variants)?input.variants:[]).find(v=>v.colour===c&&v.size===size)||{mode:'unavailable',quantity:0};requireThat(['unavailable','stock','preorder'].includes(v.mode),422,'INVALID_AVAILABILITY','Choose unavailable, stock or preorder.');const out={colour:c,size,mode:v.mode,quantity:int(v.quantity,0,1000000,'Quantity/capacity'),dispatchMin:null,dispatchMax:null};if(v.mode==='preorder'){out.dispatchMin=int(v.dispatchMin,1,180,'Minimum dispatch days');out.dispatchMax=int(v.dispatchMax,out.dispatchMin,180,'Maximum dispatch days');}p.variants.push(out);}
 p.sampleApproved=input.sampleApproved===true;
 return p;
}
export function seededProduct(p){return validateProduct({...p,sizes:seedSizes,palette:Object.fromEntries(p.colours.map(c=>[c,seedColours[c]])),media:{},galleryOrder:{},variants:[],sampleApproved:false});}
export async function seedCatalogue(repo){let inserted=0;for(const p of seeds){if(await repo.get('product',p.id))continue;try{await repo.cas('product',p.id,0,{draft:seededProduct(p),published:seededProduct(p)},'initial-import');inserted++;}catch(e){if(e.status!==409)throw e;}}return inserted;}
export async function validateMedia(repo,p){for(const c of p.colours)for(const m of Object.values(p.media[c])){const a=await repo.get('asset',m.id);requireThat(a?.body.product===p.id&&a.body.colour===c,422,'INVALID_MEDIA','An image belongs to a different product or colour.');}}
export async function saveProduct(repo,id,expected,input,actor){
 const p=validateProduct(input);requireThat(p.id===id,422,'IMMUTABLE_ID','Product id cannot change.');await validateMedia(repo,p);
 const old=await repo.get('product',id);requireThat((old?.version||0)===expected,409,'EDIT_CONFLICT','This product changed. Reload before saving.');
 return repo.cas('product',id,expected,{draft:p,published:old?.body.published||null},actor);
}
export async function publishProduct(repo,id,expected,publish,actor){
 const old=await repo.get('product',id);requireThat(old&&old.version===expected,409,'EDIT_CONFLICT','This product changed. Reload before publishing.');
 const p=validateProduct(old.body.draft);await validateMedia(repo,p);
 if(publish){const all=await repo.list('product');for(const r of all){if(r.id===id||!r.body.published)continue;for(const c of p.colours){const other=r.body.published.palette[c];if(other)requireThat(JSON.stringify(other)===JSON.stringify(p.palette[c]),422,'COLOUR_KEY_CONFLICT',`Colour key ${c} is used by another product. Use a new colour key for a different shade.`);}}}
 return repo.cas('product',id,expected,{draft:p,published:publish?p:null},actor);
}
export async function publishedSnapshot(repo){
 const all=await repo.list('product');const rows=all.filter(r=>r.body.published);const products=rows.map(r=>{const p=structuredClone(r.body.published);for(const c of p.colours)for(const v of Object.keys(p.media[c]))p.media[c][v].url=`/product-media/${p.media[c][v].id}.png`;return p;}).sort((a,b)=>a.number.localeCompare(b.number,undefined,{numeric:true})||a.id.localeCompare(b.id));
 const colours=Object.assign({},...products.map(p=>p.palette)),sizes=[...new Set(products.flatMap(p=>p.sizes))];
 // Only published projections leave the server; no draft, session or admin fields.
 return {version:createHash('sha256').update(JSON.stringify(products)).digest('hex'),preview:true,managed:true,products,colours,sizes};
}
export function assetId(){return randomUUID();}
