import test from 'node:test';
import assert from 'node:assert/strict';
import {secretKeyIssue} from '../../src/management/secret-key-format.mjs';
const key = 'sb_secret_fixture-only-NOT-A-LIVE-KEY-1234567890';
const cases = [
  ['missing', '', 'KEY_MISSING'],
  ['wrong_type', 'sb_publishable_fixture-1234567890', 'KEY_TYPE'],
  ['wrong_type', 'eyJfixture-legacy-token', 'KEY_TYPE'],
  ['assignment_in_value', 'SUPABASE_SECRET_KEY='+key, 'KEY_FORMAT'],
  ['assignment_in_value', 'export SUPABASE_SECRET_KEY='+key, 'KEY_FORMAT'],
  ['authorization_prefix', 'Bearer '+key, 'KEY_FORMAT'],
  ['quotation_marks', '"'+key+'"', 'KEY_FORMAT'],
  ['quotation_marks', '\u201c'+key+'\u201d', 'KEY_FORMAT'],
  ['embedded_line_break', key+'\nextra', 'KEY_FORMAT'],
  ['embedded_whitespace', key+' extra', 'KEY_FORMAT'],
  ['embedded_whitespace', key+'\textra', 'KEY_FORMAT'],
  ['non_ascii_or_control', key+'\u200b', 'KEY_FORMAT'],
  ['non_ascii_or_control', key+'\u2026', 'KEY_FORMAT'],
  ['wrong_prefix', 'default-fixture-not-a-key', 'KEY_FORMAT'],
  ['too_short', 'sb_secret_short', 'KEY_FORMAT'],
  ['too_long', key+'x'.repeat(1024), 'KEY_FORMAT'],
];
for (const [reason, value, code] of cases) test(`Explains ${reason} without exposing the value`, () => {
  const r = secretKeyIssue(value);
  assert.equal(r.code, code);
  assert.equal(r.reason, reason);
  assert.equal(r.field, 'SUPABASE_SECRET_KEY');
  assert.deepEqual(Object.keys(r).sort(), ['code','field','message','reason']);
  assert.ok(!JSON.stringify(r).includes(key));
  if (value) assert.ok(!JSON.stringify(r).includes(value));
});
test('Accepts normal and opaque-token punctuation as before; trims only the outside', () => {
  for (const v of [key, ' '+key+'\n', 'sb_secret_opaque.payload+/example=12345']) assert.equal(secretKeyIssue(v), null);
});
test('Preserves the old accept/reject policy across a deterministic corpus', () => {
  const oldAccepts = raw => {
    const s = String(raw ?? '').trim();
    return !!s && !s.startsWith('sb_publishable_') && !s.startsWith('eyJ') && s.startsWith('sb_secret_') && s.length >= 26 && s.length <= 1024 && !/[^\x21-\x7e]|["'`]/.test(s);
  };
  const corpus = [undefined, null, '', ...cases.map(c=>c[1]), key];
  for (const size of [0,1,16,17,1015,1016]) corpus.push('sb_secret_'+'x'.repeat(size));
  for (let n=0; n<256; n++) {
    const c = String.fromCharCode(n);
    corpus.push(key+c, c+key, key.slice(0,15)+c+key.slice(15));
  }
  for (const v of corpus) assert.equal(secretKeyIssue(v)===null, oldAccepts(v), 'Fixture policy diverged');
});

test('Configuration wiring includes the precise reason but never the secret', async () => {
  const {managementConfig,ConfigurationError} = await import('../../src/management/config.mjs');
  const env={CATALOG_DRIVER:'supabase',APP_ORIGIN:'https://khaga.example',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SECRET_KEY:'"'+key+'"'};
  assert.throws(()=>managementConfig(env), error=>error instanceof ConfigurationError && error.issues.some(i=>i.reason==='quotation_marks') && !JSON.stringify(error).includes(key) && !error.stack.includes(key));
  assert.deepEqual(managementConfig({...env,CATALOG_DRIVER:'preview'}),{driver:'preview',enabled:false});
  assert.equal(managementConfig({...env,SUPABASE_SECRET_KEY:key}).secretKey,key);
});
