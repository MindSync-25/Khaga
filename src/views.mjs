import {products,colours,sizes} from './catalog.mjs';
import {createCatalog} from './catalog-core.mjs';
import {createViews} from './view-core.mjs';
export const {UI_BUILD,media,galleryViews,card,shell,home,collection,productPage,storyPage,helpPage,bagPage,notFound}=createViews(createCatalog({products,colours,sizes}));
