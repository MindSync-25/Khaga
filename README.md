# KHAGA 0.4.0 — catalogue management, sales still closed

Storefront: `khaga.slavant.com`. Entry: `server.mjs`. Hostinger preset: **Other**, Node **22**, root `/`, build script `build`.

This release implements **phase 1** of the operations roadmap. It does **not** implement live/test payment checkout, stored customer orders, emails, shipping, tax calculation or inventory reservations. `/api/checkout` remains hard-disabled with `403 PREVIEW_ONLY`. The existing Slavant site and DNS are not part of this change.

## What is implemented

- `/admin`: one private owner account, password hashing, revocable HttpOnly sessions, expiry, persistent login limits, same-origin checks and CSRF protection.
- Persistent products, colours, per-product sizes, price in paise and availability records.
- Separate draft and published snapshots. Save privately; explicitly publish or unpublish. Optimistic version checks prevent silent lost edits.
- Front/back/detail/model imagery per colour, descriptions, ordering, replacement and detachment.
- Private immutable originals. New uploads are not public merely because they have a URL. Every media request checks whether an image is in a published product or the requester is signed in.
- One-time, repeat-safe import of the seven existing concepts. New products start as hidden drafts. Import does not overwrite existing edits.
- Persistent stock/preorder capacity and dispatch-day records. These are planning records, **not reservations** and not yet enforced for checkout.
- Activity log of product/media mutations without passwords, tokens or request bodies.
- The original master logo and garment artwork remain byte-for-byte unchanged.
- Fast navigation, colour/size selection, gallery and browser bag remain. Public catalogue data is embedded per response, not baked into the browser script. A background check refreshes managed catalogues on navigation/focus when at least 30 seconds have passed; colour clicks do not wait on an API.

## Storage modes

| Mode | Purpose |
|---|---|
| `preview` (default) | Existing seeded read-only storefront. Admin disabled. No external account needed. |
| `supabase` | Production adapter for persistent Postgres documents and a **private** Storage bucket. Requires configuration and migration. No resources have been provisioned by this code. |
| `sqlite` | Local development/automated tests only. Requires explicit loopback origin, development opt-in and a data directory outside the repository. Rejected in production. |

Using external persistent storage keeps product data and uploads outside Hostinger's deployment directory. This does not imply any Supabase plan is unlimited/free or that your Hostinger plan includes a database. Review the provider's current terms and usage limits before provisioning. No paid resources were created.

## Run / validate

Node 22.16+ (or 24) is recommended. No npm runtime dependencies.

```sh
npm ci
npm run check
npm start
```

The build generates `public/site.js` from shared browser-safe catalogue/view/router modules. It never bundles the management code, owner hash, storage key or unpublished records. `npm start` rebuilds via `prestart`.

The server uses `PORT` from Hostinger and binds to `0.0.0.0`. Do not guess/set a new production port.

## Enable the owner workspace

Follow **[docs/ADMIN_V4.md](docs/ADMIN_V4.md)**. The implementation is not configured or verified against a real Supabase project yet. Do not enable admin until the migration, private bucket and server-only secret are ready. There is **no default admin password** or public account-registration endpoint.

Basic steps:
1. Create/use a dedicated Supabase project; run `migrations/001_management.sql` as its owner.
2. Generate your owner password hash locally with `npm run admin:password`.
3. Set `CATALOG_DRIVER=supabase`, `APP_ORIGIN`, `SUPABASE_URL`, server-only `SUPABASE_SECRET_KEY`, `ADMIN_ENABLED=true`, `ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH` in Hostinger environment variables.
4. Deploy, open `/admin`, sign in and explicitly import the seven existing concepts.
5. Validate a real save → publish → new storefront visit → restart/redeploy cycle and private image access before relying on the integration.

An empty managed database gives an empty collection until import; it never silently falls back to stale seed data when a database is unavailable. Invalid management config fails startup rather than leaving an unprotected admin.

## Authentication / privacy notes

Production uses `__Host-khaga_admin` with Secure, HttpOnly, SameSite=Strict, Path=/ and no Domain attribute. Session tokens are random; only their digest is stored. Owner password changes invalidate old sessions. Logout revokes the current session. The owner identity is deployment configuration, not supplied by a request.

Optional sitewide preview authentication still uses BOTH `PREVIEW_USERNAME` and `PREVIEW_PASSWORD`. This is separate from admin authentication and also protects public media and health routes. No customer accounts or payment details are collected.

All real credentials must stay in Hostinger environment configuration. Never commit `.env`, password hashes, API keys, database files or real customer details. The repository's `.env.example` contains only placeholders; the server does not automatically load a `.env` file.

## Relevant files

- `src/management/`: config, authentication, catalogue validation, persistence adapters, private media and admin routes.
- `migrations/001_management.sql`: Supabase schema/RPCs/private bucket; grants restricted to server role.
- `public/admin/`, `public/admin.js`, `public/admin.css`: owner workspace.
- `src/catalog-core.mjs`, `src/view-core.mjs`, `src/route-core.mjs`: shared public rendering without seeded/private data in the browser bundle.
- `src/catalog.mjs`: unchanged server-side initial concepts for preview/import only.
- `public/brand/khaga-master.svg`, `src/artwork.mjs`: original approved signature/artwork; do not substitute new logos.

## Validation and limitations

See **[docs/VALIDATION_V4.md](docs/VALIDATION_V4.md)** for commands and actual results. Local HTTP/database tests and offline browser tests are separate. Offline browser mocks are not proof of real Supabase grants, native cookie behaviour, Safari, physical phone or Hostinger deployment success.

Before accepting orders: verify real samples/measurements/media, persistent catalogue setup, then implement guest checkout, authoritative totals, payment verification/idempotent webhooks, stored orders and manual fulfilment. Phase 2 is still outstanding. No sales switch exists in this release.
