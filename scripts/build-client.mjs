import {readFileSync,writeFileSync} from 'node:fs';
import {Script} from 'node:vm';
const root=new URL('../',import.meta.url);
// Fixed browser-safe graph. Seed products and management code NEVER enter it.
const modules=['src/utils.mjs','src/catalog-core.mjs','src/view-core.mjs','src/route-core.mjs','public/cart-model.mjs'];
let output=`/* KHAGA 0.4.0 — generated browser script */\n(()=>{'use strict';\n`;
for(const path of modules){let source=readFileSync(new URL(path,root),'utf8').replace(/^import[^\n]*;\r?\n/gm,'').replace(/^export (?=(?:const|let|function)\b)/gm,'');if(/^import\b|^export\b/m.test(source))throw Error(`Unsupported syntax: ${path}`);output+='\n'+source+'\n';}
output+=`const e=escapeHtml;\nconst initial=JSON.parse(document.getElementById('catalogue-data').content.textContent);\nconst catalog=createCatalog(initial);\nconst {products,colours,sizes,byId,money,variant}=catalog;\nconst pages=createViews(catalog);\nconst {media,galleryViews,UI_BUILD}=pages;\nconst renderRoute=createRouter(pages,catalog);\n`;
output+=readFileSync(new URL('public/app.js',root),'utf8')+'\n})();\n';
new Script(output,{filename:'site.js'});writeFileSync(new URL('public/site.js',root),output);
console.log(`Browser bundle: ${Buffer.byteLength(output)} bytes; published data embedded per request, no blocking catalogue bootstrap.`);
