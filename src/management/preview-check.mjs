import {checkManagementSetup, safeDiagnostic} from './diagnostics.mjs';

const scheduled = new WeakMap();

// One read-only check per running preview, using already-staged server settings.
// This task never participates in app.ready, changes flags, or supplies catalogue
// data. A failed check cannot switch a healthy preview to maintenance mode.
export function schedulePreviewCheck(app, {env=process.env, check=checkManagementSetup, log=console.info}={}) {
  if (scheduled.has(app)) return scheduled.get(app);
  const staged = {...env};
  const report = result => {
    try { log(JSON.stringify({event:'KHAGA_SETUP_CHECK', ...result})); } catch {}
    return result;
  };
  const task = Promise.resolve(app.ready).then(async startup => {
    if (startup?.state !== 'ready' || startup.catalogue !== 'preview' || !app.server.listening) {
      return {skipped:true, reason:'not-a-running-preview'};
    }
    const hasStagedConnection = ['SUPABASE_URL','SUPABASE_SECRET_KEY'].some(name => String(staged[name] ?? '').trim());
    if (!hasStagedConnection) return report({state:'skipped', reason:'no-staged-supabase-settings'});
    report({state:'running', scope:'configuration-schema-private-bucket', readOnly:true});
    // checkManagementSetup validates a private copy and returns redacted fields.
    // Its provider adapter has per-request timeouts; there is no retry loop.
    const result = await check(staged);
    return report({state:result.ok ? 'passed' : 'failed', ...result});
  }).catch(error => report({state:'failed', ok:false, ...safeDiagnostic(error)}));
  scheduled.set(app, task);
  return task;
}
