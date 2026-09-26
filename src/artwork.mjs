import {readFileSync} from 'node:fs';
import {colours,variant} from './catalog.mjs';
import {escapeHtml as e} from './utils.mjs';
// One traced silhouette from the supplied master asset is reused everywhere.
// Collection decorations are separate layers and never alter the emblem.
const master=readFileSync(new URL('../public/brand/khaga-master.svg',import.meta.url),'utf8');
const paths=master.match(/<path[\s\S]*?<\/svg>/)[0].replace('</svg>','');
export function brandSvg({wordmark=false,emblem=false,fill='#20211f'}={}) {
 const box=wordmark?'90 985 1080 195':emblem?'35 70 1140 895':'30 55 1160 1135';
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" fill="${fill}" role="img" aria-label="KHAGA">${paths}</svg>`;
}
const mark=(x,y,w,ink,onlyIcon=false)=>`<svg x="${x}" y="${y}" width="${w}" height="${onlyIcon?w*.77:w*.98}" viewBox="${onlyIcon?'35 70 1140 895':'30 55 1160 1135'}" fill="${ink}" overflow="hidden">${paths}</svg>`;
const label=(x,y,text,ink,size=10)=>`<text x="${x}" y="${y}" fill="${ink}" font-family="Georgia,serif" font-size="${size}" text-anchor="middle" letter-spacing="4">${e(text)}</text>`;
export function artwork(product,requestedColour,view='front',transparent=false) {
 const colour=variant(product,requestedColour), c=colours[colour];
 const ink=product.id==='nocturne-shirt'?'#73736e':c.ink, back=view==='back', detail=view==='detail', shirt=product.category==='shirts';
 const tee='M226 127Q300 153 374 127L455 156 541 299 465 336 438 296 444 644Q300 665 156 644L162 296 135 336 59 299 145 156Z';
 const shirtPath='M247 116L213 133 145 155Q128 194 117 272L77 603 149 618 192 344 181 646Q300 692 419 646L408 344 451 618 523 603 483 272Q472 194 455 155L387 133 353 116Z';
 let art='';
 if(!back){
  if(product.id==='origin-tee'||product.id==='solar-tee')art+=mark(263,230,74,ink);
  else art+=mark(351,231,64,ink);
  if(product.id==='solar-tee')for(let i=0;i<13;i++){const a=(195+i*12.5)*Math.PI/180;art+=`<path d="M${300+27*Math.cos(a)} ${246+27*Math.sin(a)}L${300+40*Math.cos(a)} ${246+40*Math.sin(a)}" stroke="${ink}" stroke-width=".8" opacity=".8"/>`;}
  if(product.id==='flight-tee')art+=`<g fill="${ink}" opacity=".78"><path d="M151 188Q193 197 230 234Q197 212 151 194Z"/><path d="M150 203Q179 211 207 240Q175 222 153 210Z"/><path d="M156 220Q180 230 193 247Q171 232 159 228Z"/></g>`;
  if(product.id==='eclipse-tee')art+=`<path d="M166 213Q237 275 168 341Q264 277 166 213Z" fill="${ink}" opacity=".8"/>`;
  if(product.id==='ascent-tee')art+=`<g stroke="${ink}" fill="none" stroke-width="1.8" stroke-linecap="round"><path d="M154 446L212 377 224 386 250 347 363 462"/><path d="M183 414L244 374 268 391 283 388 334 431"/></g>`;
 }else{
  if(product.id==='origin-tee')art+=mark(282,177,36,ink,true);
  if(product.id==='solar-tee'){art+=mark(280,179,40,ink,true);art+=`<path d="M300 216v91" stroke="${ink}" stroke-width="1"/>`;}
  if(product.id==='flight-tee'){art+=label(300,188,'KHAGA',ink);art+=`<path d="M204 205Q300 242 396 205" stroke="${ink}" stroke-width="1.5" fill="none"/>`;}
  if(product.id==='eclipse-tee'){art+=label(300,187,'KHAGA',ink);for(let i=0;i<7;i++){const y=213+i*24;art+=i===3?`<circle cx="300" cy="${y}" r="7" fill="none" stroke="${ink}"/>`:`<path d="M293 ${y-3}A7 7 0 1 0 307 ${y-3}Q300 ${y+6-i%3} 293 ${y-3}Z" fill="${ink}"/>`;}}
  if(product.id==='ascent-tee'){art+=label(300,186,'KHAGA',ink);art+=`<path d="M300 205v24M300 303v28" stroke="${ink}"/>`+label(300,255,'HIGHER',ink,9)+label(300,273,'EVERYDAY',ink,9);}
 }
 const surface=shirt?shirtPath:tee;
 const collar=shirt?(back?`<path d="M247 116Q300 145 353 116L348 147Q300 166 252 147Z" fill="url(#collar)"/>`:
   product.id==='nocturne-shirt'?`<path d="M247 116L223 164 263 207 296 250 266 162Z" fill="url(#collar)"/><path d="M353 116L377 164 337 207 304 250 334 162Z" fill="url(#collar)"/><path d="M296 250v416h10V247" fill="url(#placket)" opacity=".65"/>`:
    `<path d="M247 116L219 159 259 214 283 158Z" fill="url(#collar)" stroke="#000" stroke-opacity=".08"/><path d="M353 116L381 159 341 214 317 158Z" fill="url(#collar)" stroke="#000" stroke-opacity=".08"/><path d="M291 161V667h18V161" fill="url(#placket)"/>${[200,267,334,401,468,535,602].map(y=>`<circle cx="300" cy="${y}" r="5" fill="${c.hex}" stroke="#111" stroke-opacity=".2"/><circle cx="298.5" cy="${y}" r=".6" fill="#000" opacity=".35"/><circle cx="301.5" cy="${y}" r=".6" fill="#000" opacity=".35"/>`).join('')}`):`<path d="M226 127Q300 173 374 127L367 143Q300 198 233 143Z" fill="url(#collar)"/><path d="M235 141Q300 186 365 141" stroke="#000" stroke-opacity=".15" fill="none"/>`;
 const body=`<g filter="url(#shadow)"><path d="${surface}" fill="${c.hex}"/><path d="${surface}" fill="url(#cloth)"/><g clip-path="url(#garment)"><rect x="50" y="100" width="500" height="580" filter="url(#texture)" opacity=".095"/><path d="M178 213Q189 377 168 610M423 222Q402 385 431 612" stroke="#000" opacity=".08" stroke-width="18" fill="none" filter="url(#soft)"/>${art}</g>${collar}<path d="${shirt?'M147 171L190 344M453 171L410 344M87 578L152 592M448 592L513 578M187 644Q300 682 413 644':'M146 160L165 295M454 160L435 295M70 296L134 326M466 326L530 296M162 638Q300 655 438 638'}" stroke="#000" opacity=".15" fill="none" stroke-width="1.2"/>${back&&shirt?'<path d="M189 182Q300 197 411 182" stroke="#000" opacity=".15" fill="none"/>':''}</g>`;
 const content=detail?`<rect width="600" height="760" fill="${c.hex}"/><rect width="600" height="760" fill="url(#cloth)"/><rect width="600" height="760" filter="url(#texture)" opacity=".1"/>${mark(170,205,260,ink)}${label(300,580,'SIGNATURE STUDY',ink,10)}`:body;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="760" viewBox="0 0 600 760" role="img" aria-label="${e(product.name)} in ${e(c.name)} — ${view} concept illustration"><defs><linearGradient id="background" x2="1" y2="1"><stop stop-color="#eeebe4"/><stop offset="1" stop-color="#ddd9d0"/></linearGradient><linearGradient id="cloth" x2="1" y2=".1"><stop stop-color="#000" stop-opacity=".12"/><stop offset=".2" stop-color="#fff" stop-opacity=".09"/><stop offset=".43" stop-color="#fff" stop-opacity=".02"/><stop offset=".68" stop-color="#000" stop-opacity=".05"/><stop offset=".9" stop-color="#fff" stop-opacity=".10"/><stop offset="1" stop-color="#000" stop-opacity=".17"/></linearGradient><linearGradient id="collar" x2="0" y2="1"><stop stop-color="${c.hex}"/><stop offset="1" stop-color="${c.hex}"/><stop offset="1" stop-color="#000" stop-opacity=".15"/></linearGradient><linearGradient id="placket"><stop stop-color="#000" stop-opacity=".08"/><stop offset=".5" stop-color="#fff" stop-opacity=".03"/><stop offset="1" stop-color="#000" stop-opacity=".08"/></linearGradient><filter id="texture"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><filter id="shadow" x="-30%" y="-20%" width="160%" height="160%"><feDropShadow dx="0" dy="17" stdDeviation="13" flood-color="#302d26" flood-opacity=".15"/></filter><filter id="soft"><feGaussianBlur stdDeviation="9"/></filter><clipPath id="garment"><path d="${surface}"/></clipPath></defs>${transparent?'':'<rect width="600" height="760" fill="url(#background)"/>'}${content}</svg>`;
}
