// Allowlist packaging: never upload .env, .git, local test fixtures or credentials.
import {mkdir,rm,cp,writeFile} from 'node:fs/promises';
const target=new URL('../dist/commerce/',import.meta.url);
await rm(target,{recursive:true,force:true});await mkdir(target,{recursive:true});
await cp(new URL('../src/',import.meta.url),new URL('src/',target),{recursive:true,filter:path=>!path.includes('.env')});
await writeFile(new URL('package.json',target),JSON.stringify({name:'khaga-commerce',version:'1.0.0',private:true,type:'module'}));
console.log('Commerce artifact: dist/commerce (source modules only; SDK provided by Lambda runtime).');
