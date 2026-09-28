import {ConfigurationError, managementConfig} from './config.mjs';
import {openRepository} from './repository.mjs';
const guidance = Object.freeze({
  STORAGE_AUTH_FAILED:'Supabase rejected authentication. Check the server key and project pairing.',
  STORAGE_ACCESS_DENIED:'Supabase denied access. Check server-key permissions and migration grants.',
  STORAGE_NOT_FOUND:'A required RPC function or bucket was not found in this project.',
  STORAGE_RATE_LIMITED:'Supabase rate limit reached. Retry later.',
  STORAGE_UNAVAILABLE:'Supabase could not be reached or did not complete the request.',
  SCHEMA_REQUIRED:'The KHAGA schema check failed. Review the applied migration.',
  PRIVATE_BUCKET_REQUIRED:'The media bucket must remain private.',
});
export function safeDiagnostic(error) {
  if (error instanceof ConfigurationError) return {code:error.code,issues:error.issues};
  const code=Object.hasOwn(guidance,error?.code)?error.code:'STARTUP_CHECK_FAILED';
  return {code,stage:['schema','media'].includes(error?.stage)?error.stage:'startup',
    message:guidance[code]||'Setup did not complete. Review the application configuration without sharing secrets.'};
}
// Checks staged settings without changing process.env, enabling admin, seeding
// products, creating tables, uploading objects, or publishing any data.
export async function checkManagementSetup(env=process.env,open=openRepository) {
  let repo;
  try {
    const config=managementConfig({...env,CATALOG_DRIVER:'supabase',ADMIN_ENABLED:'true'});
    repo=await open(config);
    return {ok:true,checks:['configuration','schema-access','private-media-bucket'],
      note:'Read-only checks passed. Owner login, writes, permissions and restart persistence still need acceptance testing.'};
  } catch(error) { return {ok:false,...safeDiagnostic(error)}; }
  finally { try{await repo?.close();}catch{} }
}
