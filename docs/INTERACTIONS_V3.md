# KHAGA 0.3.0 — interaction and editorial refresh

## Scope and deployment baseline

Built against verified main commit `fe6d2d8bffb9076000ac84305b34fb75c5fe5ca0`.
The previous v2 ZIP had not been pushed to main. This release replaces that proposed
refresh, rather than requiring users to layer ZIPs manually.

The original `public/brand/khaga-master.svg` and `src/artwork.mjs` are unchanged.
Regression tests pin their Git blob hashes. No location, new logo, products,
pricing tiers, payments or stock claims were added. Existing Slavant hosting and
DNS were not modified.

## Findings in the previous client

- Internal anchors and filter/sort form submissions used native page navigation.
- Product colour, size, gallery and bag listeners were registered only after the
  `/api/catalog` bootstrap request resolved. Before resolution, colour anchors
  navigated normally and buttons did not have their handlers. A failed request
  left most of those controls unbound.
- The browser fetched a module entry plus an imported `.mjs` cart module. No
  specific Hostinger MIME/CSP failure has been confirmed; this release removes
  that runtime module-chain dependency rather than guessing it was the cause.
- The live subdomain was not reachable from this environment. These are verified
  code findings, not a claim that the precise production failure was reproduced.

## Changes

The server and browser now share the catalogue, pure route renderer and HTML
views. A fixed build step combines those modules with the cart model and delegated
handlers into one deferred script. No external bundler or runtime dependency is
needed. Opening a product, category, story, search result or help page replaces
only the main content. The document, header, dialogs and cart stay alive.

Colour and gallery updates do not wait on any API and do not navigate the document.
Selection updates immediately; media can still require its first network fetch.
Likely image variants are prewarmed with a bounded cache, and asset responses use
gzip where supported. There is no claim of zero latency on uncached images.

Controls include card front/back toggles, colour swatches, size validation,
gallery thumbnails/next/enlargement, mobile menu, search, filters/sort, fit note,
bag quantities/removal and media retry feedback. Delegation prevents stale or
repeated handlers after route changes. The URL is updated and Back/Forward
restores the route and scroll state. Native deep links and no-JS page links remain.
External links, downloads and modified clicks retain normal browser behavior.

The homepage now uses a large campaign-led composition, quieter product cards,
category editorials and one signature feature. Product pages have clearer
hierarchy, tactile selectors and an enlarged image view. Reduced motion and
keyboard dialog behavior remain supported.

## Validation actually performed

- `npm run check`: **51 Node tests passed**; bundle syntax and build validation passed.
- The shared browser renderer was compared with actual local Node HTTP responses.
- Tested gzip/identity, MIME, Vary, validators, version headers, protected assets,
  deep-link output, search escaping and the server-side checkout lock.
- **29 offline Chromium interaction/layout checks passed**, executing the actual
  built browser script and rendered templates. Covered route changes, category
  filtering, sort, search, colour/size/view retention, rapid colour changes,
  gallery enlargement, Escape, fit note, bag add/quantity/remove, repeated
  navigation, saved bag restoration and blocked storage.
- No unhandled script exceptions in that interaction run. No page/catalogue fetch
  was required. Layout widths checked: 360, 390, 768 and 1440 pixels.
- Desktop/mobile homepage and product-page screenshots were inspected.

### Limitations

Browser HTTP navigation is administratively blocked in this execution environment.
The Chromium check therefore uses embedded real assets with simulated same-origin
History and storage adapters; it is not native browser-network, native history,
Safari, physical-mobile or Hostinger deployment validation. Local Node HTTP tests
are real HTTP tests. Live deployment status is unverified.

The reproducible offline harness is `scripts/browser-qa.py`. With Python requests,
Playwright and Chromium installed, start `PORT=3110 npm start`, then run it with
`KHAGA_TEST_URL=http://127.0.0.1:3110`. Optional `KHAGA_QA_OUTPUT` selects the output
folder. It deliberately does not make live-site assertions.

## Hostinger settings — unchanged

Other / Node 22 / repository root / build script `build` / entry `server.mjs`.
Use the latest main commit. `npm run build` and `npm start` generate `public/site.js`;
it is intentionally not committed. No new secrets, payment keys or DNS changes.

## Live verification after deployment

1. `/health` should report version `0.3.0` and mode `preview`.
2. One refresh should request `/site.js?v=0.3.0`; it must return HTTP 200 with
   JavaScript MIME. The console should have no startup or CSP errors.
3. Colour, gallery and size controls should respond immediately; colour changes
   should not issue document requests or reset scroll. Uncached images may load.
4. Click category/filter/search/product links; Back/Forward should restore the
   correct route and scroll. Check on a real phone and Safari as well as Chrome.
5. Add different colours/sizes to the bag, change quantity, remove, reload once,
   and confirm browser storage persistence. Test with storage blocked too.
6. `/api/checkout` remains HTTP 403 (`PREVIEW_ONLY`). Orders are not enabled.

Rollback: redeploy the preceding known-good commit in Hostinger. No data migration
is involved and the browser bag keeps the same versioned storage key.

## Publication status for this delivery

A GitHub tree upload was blocked before a release commit or branch update. The
main branch was rechecked and remains `fe6d2d8bffb9076000ac84305b34fb75c5fe5ca0`.
No partial version was published. The complete tested v3 source is supplied in
`KHAGA-website-v3-fast-editorial.zip`; all source files must be committed together
to main (or a reviewed branch), then deployed. Do not combine this with the old v2 patch.
