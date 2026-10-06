import {SupabaseRepository} from '../management/repository.mjs';
import {RazorpayProvider} from '../checkout/provider.mjs';
import {CommerceStore} from './store.mjs';
import {commerceService} from './service.mjs';
import {requireThat as need} from '../management/errors.mjs';
let cached;
export function validateConfig(secret,env){
 const mode=env.COMMERCE_MODE;
 need(env.COMMERCE_ENVIRONMENT!=='prod'||mode==='live',503,'CONFIGURATION_REQUIRED','Production requires Live payment mode.');
 need(['test','live'].includes(mode)&&secret.mode===mode&&(mode!=='live'||env.LIVE_API_APPROVED==='true'),503,'CONFIGURATION_REQUIRED','Commerce mode is not enabled.');
 need(new RegExp('^rzp_'+mode+'_[A-Za-z0-9]+$').test(secret.keyId||''),503,'CONFIGURATION_REQUIRED','Payment configuration mismatch.');
 need(typeof secret.keySecret==='string'&&secret.keySecret.length>=8&&!/[\s"'`]/.test(secret.keySecret)&&typeof secret.webhookSecret==='string'&&secret.webhookSecret.length>=24&&secret.webhookSecret.length<=1024&&secret.webhookSecret!==secret.keySecret&&typeof secret.sessionSecret==='string'&&secret.sessionSecret.length>=32&&secret.sessionSecret.length<=1024&&secret.sessionSecret!==secret.webhookSecret&&secret.sessionSecret!==secret.keySecret,503,'CONFIGURATION_REQUIRED','Secret configuration is incomplete.');
 need(/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(secret.supabaseURL||'')&&typeof secret.secretKey==='string'&&secret.secretKey.length>=20,503,'CONFIGURATION_REQUIRED','Database configuration is incomplete.');
 const origins=String(env.FRONTEND_ORIGINS||'').split(',');
 need(origins.length>0&&origins.every(o=>{try{return new URL(o).origin===o&&o.startsWith('https://');}catch{return false;}}),503,'CONFIGURATION_REQUIRED','Configure exact frontend origins.');
 return {...secret,mode,origins,purchasesEnabled:env.PURCHASES_ENABLED==='true'};
}
export async function runtime(){
 if(cached&&cached.until>Date.now())return cached.value;
 // SDK v3 is provided by the Node 22 Lambda runtime. No credentials in env or bundle.
 const {SecretsManagerClient,GetSecretValueCommand}=await import('@aws-sdk/client-secrets-manager');
 const response=await new SecretsManagerClient({}).send(new GetSecretValueCommand({SecretId:process.env.COMMERCE_SECRET_ARN}));
 const config=validateConfig(JSON.parse(response.SecretString),process.env);
 const repo=new SupabaseRepository(config),store=new CommerceStore(repo,config.mode),provider=new RazorpayProvider(config);
 const value={config,repo,store,provider,service:commerceService({repo,store,provider,config})};
 cached={value,until:Date.now()+60000};return value;
}
