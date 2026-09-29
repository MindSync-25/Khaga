// Never return any portion, length, or fingerprint of the submitted secret.
// This explains the existing policy; it does not alter accepted credentials.
const issue = (code, reason, message) => ({field:'SUPABASE_SECRET_KEY', code, reason, message});
export function secretKeyIssue(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return issue('KEY_MISSING','missing','Set the server-only secret API key on the KHAGA application.');
  if (value.startsWith('sb_publishable_') || value.startsWith('eyJ'))
    return issue('KEY_TYPE','wrong_type','Use a server-only sb_secret_ key, not a publishable key or legacy JWT.');
  if (/^(?:export\s+)?SUPABASE_SECRET_KEY\s*=/.test(value))
    return issue('KEY_FORMAT','assignment_in_value','The value includes SUPABASE_SECRET_KEY=. Put the variable name in Name and only the key in Value.');
  if (/^Bearer\s/i.test(value))
    return issue('KEY_FORMAT','authorization_prefix','The value contains a Bearer prefix. Store only the key, not an Authorization header.');
  if (/["'`\u2018\u2019\u201c\u201d]/u.test(value))
    return issue('KEY_FORMAT','quotation_marks','The value contains quotation marks or backticks. Paste the key without those characters.');
  if (/[\r\n]/.test(value))
    return issue('KEY_FORMAT','embedded_line_break','The value contains an internal line break. Copy the full key as one uninterrupted line.');
  if (/\s/u.test(value))
    return issue('KEY_FORMAT','embedded_whitespace','The value contains whitespace inside the key. Copy the full key with no internal spaces or tabs.');
  if (/[^\x21-\x7e]/.test(value))
    return issue('KEY_FORMAT','non_ascii_or_control','The value contains a non-ASCII or control character, possibly an invisible character or display ellipsis. Copy the actual key using its Copy control.');
  if (!value.startsWith('sb_secret_'))
    return issue('KEY_FORMAT','wrong_prefix','The value does not start exactly with sb_secret_. Copy the Secret key value, not its name, URL or connection string.');
  if (value.length < 26)
    return issue('KEY_FORMAT','too_short','The value is shorter than this application accepts. Copy the full Secret key, not just its prefix or shortened display.');
  if (value.length > 1024)
    return issue('KEY_FORMAT','too_long','The value exceeds the application limit. Copy only the Secret key, not a settings block or document.');
  return null;
}
