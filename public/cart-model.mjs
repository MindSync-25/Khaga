export const STORAGE_KEY='khaga.preview.bag.v1';
export const MAX_QUANTITY=10;
export function cleanItems(input,catalog){
 if(!Array.isArray(input))return [];
 const result=new Map();
 for(const item of input.slice(0,100)){
  if(!item||typeof item!=='object')continue;
  const p=catalog.products.find(p=>p.id===item.product);
  if(!p||!p.colours.includes(item.colour)||!(p.sizes||catalog.sizes).includes(item.size)||!Number.isInteger(item.quantity)||item.quantity<1)continue;
  const key=`${p.id}|${item.colour}|${item.size}`;
  const current=result.get(key);
  result.set(key,{product:p.id,colour:item.colour,size:item.size,quantity:Math.min(MAX_QUANTITY,(current?.quantity||0)+item.quantity)});
 }
 return [...result.values()];
}
export function total(items,catalog){return items.reduce((sum,item)=>sum+(catalog.products.find(p=>p.id===item.product)?.price||0)*item.quantity,0);}
export function readBag(storage,catalog){try{const data=JSON.parse(storage.getItem(STORAGE_KEY)||'null');return data?.version===1?cleanItems(data.items,catalog):[];}catch{return [];}}
