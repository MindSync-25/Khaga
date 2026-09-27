import {managementConfig} from '../src/management/config.mjs';
import {openRepository} from '../src/management/repository.mjs';
import {seedCatalogue} from '../src/management/catalogue.mjs';
const config=managementConfig();if(config.driver==='preview')throw Error('Configure a persistent catalogue first.');
const repo=await openRepository(config);
try{console.log(`Imported ${await seedCatalogue(repo)} missing concepts. Existing drafts/publications preserved.`);}finally{await repo.close();}
