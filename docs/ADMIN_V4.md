# KHAGA phase 1: owner workspace and persistent catalogue

## Scope / important status

The code implements phase 1. No external project, account, database, bucket or paid service was created. The real Supabase migration and integration still require verification. Defaults keep `/admin` unavailable and preserve the existing preview. Payments remain blocked in every mode.

Only `khaga.slavant.com` is in scope. Do not change the Slavant website, nameservers, mail records or its database.

## Production setup

### 1. Separate persistent storage

Use a dedicated Supabase project for KHAGA (or a project you have explicitly decided to share after reviewing isolation). Choose its region and plan deliberately; current cost/limits are not assumptions in this implementation. Do not use a JSON file or SQLite in Hostinger's deployment directory as production persistence.

Run the complete `migrations/001_management.sql` in the project's SQL editor as its database owner. It is repeat-safe and non-destructive, creating:

- `khaga_private.documents`: versioned products, asset metadata and hashed sessions.
- `khaga_private.audit_log`, `khaga_private.rate_limits`.
- `public.khaga_*` RPC functions with fixed search paths, default execute permissions revoked, and execute granted only to `service_role`.
- `khaga-product-media`: private Storage bucket, PNG only, maximum 5 MB.

Do NOT grant RPC execution or storage access to anon/authenticated roles. Do NOT make the bucket public. The server checks bucket privacy at startup. The migration does not alter an existing bucket on conflict; an incorrectly public existing bucket must be corrected deliberately.

Get the project's HTTPS URL and a **server-only secret API key** (`sb_secret_...`). This version accepts modern secret keys, not publishable/anon keys or legacy JWT strings. The key is sent only from Node to Supabase through the `apikey` header, never included in browser code. Follow the provider's secret-key restrictions and rotation process.

Official references:
- https://supabase.com/docs/guides/api/api-keys
- https://supabase.com/docs/guides/storage/buckets/fundamentals
- https://supabase.com/docs/guides/storage/uploads/standard-uploads

### 2. Create the owner password hash

On a trusted local computer in the extracted KHAGA project, with Node 22+:

```sh
npm run admin:password
```

Type the same password twice (minimum 16 characters). The terminal does not echo it. Copy the entire printed `scrypt$65536$8$2$...` hash into Hostinger, not GitHub. There is no default password. Do not paste your plain password or Supabase secret into chat.

### 3. Hostinger environment

Keep the same Node/Other/entry/build settings. Set these **only on the KHAGA application**:

```text
CATALOG_DRIVER=supabase
APP_ORIGIN=https://khaga.slavant.com
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SECRET_KEY=YOUR_REAL_SERVER_ONLY_SECRET_KEY
SUPABASE_MEDIA_BUCKET=khaga-product-media
ADMIN_ENABLED=true
ADMIN_EMAIL=YOUR_OWNER_EMAIL
ADMIN_PASSWORD_HASH=YOUR_COMPLETE_GENERATED_SCRYPT_HASH
```

`APP_ORIGIN` has no path, trailing parameters, credentials or query. Paste the hash as a literal value in the environment UI; do not let a shell expand `$` characters. Never set a `NEXT_PUBLIC_`/`PUBLIC_` version of any secret. No payment keys belong in this phase.

Deploy/restart. A bad origin, missing owner hash, wrong secret, unavailable schema or public bucket fails closed. To return to the previous seeded preview without admin, explicitly set `CATALOG_DRIVER=preview` and `ADMIN_ENABLED=false`. Database contents are not deleted; a rollback will not undo saved catalogue edits.

### 4. Initial import / first edit

Open `/admin`, sign in with the configured owner email and plain password. Click **Import the seven existing concepts** and confirm. Existing records are skipped, never overwritten. Import puts those seven known concepts in the published **preview**; it does not imply available stock.

The managed database is initially empty. Until import finishes, the public collection is empty. This prevents accidental reseeding or hiding real storage failures under old catalogue data.

Open Origin Tee → Manage. Edit a price/text → **Save draft**. Open the storefront separately: it still shows the old published value. Return → **Publish saved draft** → confirm. A new storefront request should now show the new value without another deploy.

Open browser sessions check for a new published snapshot on navigation/focus after 30 seconds. Colour/gallery/size interactions remain immediate and do not wait for catalogue requests. A continuously idle open tab is not a realtime websocket feed.

### 5. Images per colour

Save the product and its colour first. Choose the colour under Colour-specific imagery. Upload JPEG/PNG/WebP <=12 MB input; the browser normalizes to a bounded PNG <=5 MB, and the server independently validates PNG data/dimensions/checksums and strips metadata before storage.

Supported slots: front, back, detail, model (one image per slot per colour in this first version). Set descriptive alt text. Move attached slots up/down to choose gallery order. Save draft then publish. The first attached ordered slot is the initial product-page image; product-card front/back still use the front/back slots. Missing views fall back to clearly labelled concept illustrations.

Uploading does not replace a published asset in place. Every original gets an immutable UUID, so the published version remains stable while a draft changes. Unattached files are private. Unpublishing revokes new public media requests; it cannot recall screenshots, previous downloads or already rendered pages.

Detaching an image changes the draft only. It is NOT permanent deletion. Orphan/object cleanup and retention automation are not implemented; review storage use periodically. Any operator deletion must check both draft and published references first. Back up media separately from database records, and test restoration before operating a real store.

Do not use these admin screens to alter the master brand mark. Uploaded product photographs must show the approved KHAGA emblem accurately.

### 6. Availability records

Each colour/size can be unavailable, stock, or preorder. Enter integer stock/capacity. Preorder needs a minimum and maximum dispatch day range, 1–180, max >= min. These are operational records only: this release does not accept orders or reserve/decrement quantities. They are not courier-delivery guarantees.

### 7. Production acceptance checklist (still to be performed)

- Correct `/health` version 0.4.0, mode preview; admin disabled when config absent.
- Successful real Supabase migration and server startup; secret kept server-side.
- Confirm anon/publishable key cannot execute `khaga_*` or read private originals; RLS/grants must be tested in the real project.
- Wrong password generic error; valid login sets Secure/HttpOnly/__Host cookie; logout and credential rotation revoke sessions.
- Missing CSRF and sibling-site Origin mutations rejected. Verify on HTTPS in Chrome and Safari.
- Draft remains private in HTML, bundle, `/api/catalog` and direct media URLs.
- Upload actual garment photo, save then publish: correct colour/front/back/model image appears without deploying.
- Restart/redeploy server and confirm saved text, versions and images persist.
- Concurrent-tab draft saves produce 409, not silent overwrites.
- Unpublish: new public product and image requests return 404; admin still sees draft.
- Existing fast colour/navigation/bag behaviour works on a physical phone.
- `/api/checkout` stays 403; no customer payments collected.

Do not open sales before the next checkout/order/fulfilment phase and actual supplier approval.

## Local development only

Use an absolute data directory outside the source tree. Node 22.16+ includes experimental `node:sqlite`. Production rejects this driver.

```sh
export NODE_ENV=development
export CATALOG_DRIVER=sqlite
export ALLOW_LOCAL_ADMIN=true
export APP_ORIGIN=http://127.0.0.1:3000
export KHAGA_DATA_DIR="$HOME/.khaga-development"
export ADMIN_ENABLED=true
# Set your own ADMIN_EMAIL and ADMIN_PASSWORD_HASH securely.
npm run admin:seed
npm start
```

A `.env` file is not loaded automatically. Use your shell's environment or your own secure environment-file setup; keep it out of Git. Local cookies deliberately omit Secure and use a different name; this exception is forbidden off-loopback or in production.
