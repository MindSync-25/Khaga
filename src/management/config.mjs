import {resolve, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
export function managementConfig(env = process.env) {
  const driver = env.CATALOG_DRIVER || 'preview';
  if (!['preview','supabase','sqlite'].includes(driver)) throw new Error('Unsupported CATALOG_DRIVER.');
  if (driver === 'preview') {
    if (env.ADMIN_ENABLED === 'true') throw new Error('Admin requires a persistent catalogue driver.');
    return {driver, enabled:false};
  }
  const origin = new URL(env.APP_ORIGIN || '');
  if (origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw new Error('APP_ORIGIN must be a bare origin.');
  const local = ['localhost','127.0.0.1','[::1]'].includes(origin.hostname);
  if (origin.protocol !== 'https:' && !(local && env.NODE_ENV !== 'production' && env.ALLOW_LOCAL_ADMIN === 'true')) throw new Error('Management requires HTTPS outside explicitly enabled local development.');
  if (driver === 'sqlite') {
    if (!local || env.NODE_ENV === 'production' || env.ALLOW_LOCAL_ADMIN !== 'true') throw new Error('SQLite is development-only; use Supabase for deployment.');
    if (!env.KHAGA_DATA_DIR || !isAbsolute(env.KHAGA_DATA_DIR)) throw new Error('KHAGA_DATA_DIR must be an absolute local data directory.');
    const path=resolve(env.KHAGA_DATA_DIR);
    if (path === root.slice(0,-1) || path.startsWith(root)) throw new Error('Store development data outside the source/deployment directory.');
  }
  let supabaseURL;
  if(driver === 'supabase') {
    supabaseURL = new URL(env.SUPABASE_URL || '');
    if(supabaseURL.protocol !== 'https:' || supabaseURL.username || supabaseURL.password || supabaseURL.search || supabaseURL.hash || supabaseURL.pathname !== '/') throw new Error('SUPABASE_URL must be an HTTPS origin.');
    if (!/^sb_secret_[A-Za-z0-9_-]{16,}$/.test(env.SUPABASE_SECRET_KEY || '')) throw new Error('Use a server-only Supabase secret API key, not a publishable key.');
  }
  const enabled = env.ADMIN_ENABLED === 'true';
  const email=(env.ADMIN_EMAIL || '').trim().toLowerCase();
  const passwordHash=env.ADMIN_PASSWORD_HASH || '';
  if(enabled && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^scrypt\$65536\$8\$2\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(passwordHash))) throw new Error('Set ADMIN_EMAIL and a hash generated with npm run admin:password.');
  return {driver,enabled,origin:origin.origin,secure:origin.protocol==='https:',email,passwordHash,
    dataDir:env.KHAGA_DATA_DIR, supabaseURL:supabaseURL?.origin, secretKey:env.SUPABASE_SECRET_KEY,
    bucket:env.SUPABASE_MEDIA_BUCKET || 'khaga-product-media', sessionHours:8};
}
