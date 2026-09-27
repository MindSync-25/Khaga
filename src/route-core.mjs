export function createRouter(pages,catalog){
const {home,collection,productPage,storyPage,helpPage,bagPage,notFound}=pages;
const {byId}=catalog;
// Shared pure page renderer: same templates in Node and the single browser bundle.
function renderRoute(url) {
 const path=url.pathname.replace(/\/$/,'')||'/';
 if(path==='/')return home();
 if(path==='/collection'||path==='/search')return collection(url.searchParams,path==='/search');
 if(path==='/story')return storyPage();
 if(path==='/bag')return bagPage();
 if(path==='/checkout')return helpPage('preview');
 const p=path.match(/^\/products\/([a-z0-9-]+)$/);
 if(p)return byId.has(p[1])?productPage(byId.get(p[1]),url.searchParams.get('colour')):notFound();
 const h=path.match(/^\/help\/(preview|sizing|delivery|care|privacy|terms)$/);
 if(h)return helpPage(h[1]);
 return null; // Files, external destinations and unsupported paths retain native navigation.
}

return renderRoute;
}
