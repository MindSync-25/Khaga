// Browser-safe factory. No unpublished catalogue, credentials or provider code.
export function createCatalog(snapshot) {
 const products=structuredClone(snapshot.products||[]),colours=structuredClone(snapshot.colours||{}),sizes=[...(snapshot.sizes||[])];
 const byId=new Map(products.map(p=>[p.id,p]));
 const money=amount=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:amount%100?2:0,maximumFractionDigits:2}).format(amount/100);
 const variant=(p,c)=>p.colours.includes(c)?c:p.colours[0];
 const filterProducts=({category='all',q='',sort='collection'}={})=>{
  const query=String(q).trim().toLowerCase().slice(0,100);
  const result=products.filter(p=>(category==='all'||p.category===category)&&(!query||[p.name,p.note,...p.colours.map(c=>colours[c]?.name||c)].join(' ').toLowerCase().includes(query)));
  if(sort==='price-asc')result.sort((a,b)=>a.price-b.price);if(sort==='price-desc')result.sort((a,b)=>b.price-a.price);return result;
 };
 const catalog={version:snapshot.version||'seed',managed:!!snapshot.managed,preview:true,checkout:snapshot.checkout||null,products,colours,sizes,byId,money,variant,filterProducts};
 catalog.replace=next=>{products.splice(0,products.length,...structuredClone(next.products));for(const c of Object.keys(colours))delete colours[c];Object.assign(colours,structuredClone(next.colours));sizes.splice(0,sizes.length,...next.sizes);byId.clear();for(const p of products)byId.set(p.id,p);catalog.version=next.version;catalog.managed=!!next.managed;};
 catalog.snapshot=()=>({version:catalog.version,managed:catalog.managed,preview:true,...(catalog.checkout?{checkout:catalog.checkout}:{}),products,colours,sizes});
 return catalog;
}
