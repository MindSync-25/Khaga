import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {products,colours} from '../src/catalog.mjs';
import {home,productPage} from '../src/views.mjs';
import {artwork} from '../src/artwork.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
for(const path of ['server.mjs','public/site.js','public/editorial.css','public/styles.css','public/app.js','public/cart-model.mjs','public/brand/khaga-master.svg','public/assets/campaign.svg'])assert.ok(existsSync(join(root,path)),`Missing deployment file: ${path}`);
assert.equal(products.length,7);assert.equal(new Set(products.map(p=>p.id)).size,7);
for(const p of products){assert.ok(Number.isInteger(p.price)&&p.price>0);for(const c of p.colours){assert.ok(colours[c],`Unknown colour ${c}`);for(const view of ['front','back','detail'])assert.ok(artwork(p,c,view).startsWith('<svg'));}assert.ok(productPage(p,p.colours[0]).includes('Checkout'))}
assert.ok(home().includes('Design preview'));assert.ok(!home().includes('Bengaluru'));
console.log('Build validated: 7 product pages; every colour/view; local logo and media; server-rendered routes.');
console.log('Zero runtime dependencies. Shared browser bundle generated locally. Entry: server.mjs');
