import {products,colours,sizes} from './catalog.mjs';
import {createCatalog} from './catalog-core.mjs';
import {createViews} from './view-core.mjs';
import {createRouter} from './route-core.mjs';
const catalogue=createCatalog({products,colours,sizes});
export const renderRoute=createRouter(createViews(catalogue),catalogue);
