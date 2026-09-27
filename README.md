# KHAGA — Collection 001: Ascent

A deployable **preview** storefront for `khaga.slavant.com`.

## What is included

- Responsive editorial homepage, seven product pages, collection filters and search.
- Origin, Solar, Flight, Eclipse and Ascent tees; Form and Nocturne shirts.
- Colour-specific front, back and signature illustrations using one supplied KHAGA master emblem.
- Size selection, a persistent local preview bag, quantity controls and indicative INR subtotals.
- Story, sizing, care, delivery/returns status, privacy and preview-terms pages.
- No third-party scripts, external fonts, database, API keys or runtime dependencies.
- Server-rendered HTML, progressive navigation, native accessible dialogs and reduced-motion styles.

This is plain **Node.js + HTML/CSS/JavaScript**, not Next.js. It deliberately uses no npm runtime dependencies so the initial deployment can be validated independently of a package registry. The catalogue and artwork modules are kept separate from the UI for later changes.

## Run locally

Use Node.js 22 (tested on 22.16.0) or 24.

```sh
npm ci
npm run check
npm start
```

Open `http://localhost:3000`. `npm run dev` starts Node's watch mode.

`npm run build` generates one deferred browser bundle (`public/site.js`) from the shared page templates, catalogue and controls, then validates all pages and artwork. No external bundler or runtime packages are required. The Node server entry and Hostinger settings stay the same. `npm start` also rebuilds the bundle via `prestart`.

## Hostinger: import from GitHub

Deploy this repository as the **KHAGA subdomain website only**. Do not change the existing `slavant.com` site, its files or its email/DNS records.

| Field | Value |
|---|---|
| Repository | `MindSync-25/Khaga` |
| Branch | `main` |
| Application / framework | **Other** (`other`), not Next.js |
| Node.js | **22** |
| Root directory | `/` (repository root) |
| Package manager | npm |
| Install command, if shown | `npm ci` |
| Build script | `build` |
| Full build command, if shown instead | `npm run build` |
| Entry file | **`server.mjs`** (relative to repository root) |
| Start command, if shown | `npm start` |
| Output directory | Leave blank; Other ignores it when an entry file is set |
| Required secrets | None |

The server binds to `0.0.0.0` and uses Hostinger's `PORT` environment variable, falling back to 3000 locally. Do not set a guessed production port.

Hostinger reference: https://docs.hostinger.com/node.js/build-settings
GitHub import reference: https://docs.hostinger.com/node.js/github

After clicking Deploy, verify:

1. Deployment logs show `Build validated: 7 product pages`.
2. Runtime logs show `KHAGA preview running on port ...`.
3. `https://khaga.slavant.com/health` returns status `ok`, app `khaga-storefront`, version `0.3.0`, mode `preview`.
4. Images and styles load, a colour changes the product image, and the preview bag works on a phone.
5. `POST /api/checkout` remains 403 with code `PREVIEW_ONLY`.

A successful local test is **not** confirmation of Hostinger deployment or its GitHub connection. Confirm these in hPanel. Once automatic deployment is enabled, a push to `main` can publish a new preview.

## Optional private preview

The site is publicly accessible by default. `noindex` and `robots.txt` are not authentication.

Set BOTH environment variables in Hostinger to require HTTP Basic Authentication:

```text
PREVIEW_USERNAME=your-review-username
PREVIEW_PASSWORD=your-long-unique-password
```

Do not commit actual credentials. Both values must be set together. Authentication also protects assets, API routes and the health endpoint. Authenticated responses are private and not cached publicly. Hostinger must provide HTTPS.

## Edit the collection

- `src/catalog.mjs`: names, proposed prices in paise, descriptions, colours and size choices.
- `src/views.mjs`: server-rendered pages and content.
- `public/styles.css`: desktop/mobile design system.
- `public/app.js`: delegated gallery, colour, dialog, bag and local navigation controls.
- `src/routes.mjs`: shared pure renderer for browser navigation.
- `scripts/build-client.mjs`: combines the fixed module graph into one deferred script.
- `public/editorial.css`: the v3 responsive editorial layer; original logo/artwork are unchanged.
- `public/cart-model.mjs`: validated, versioned localStorage bag model.
- `src/artwork.mjs`: concept garment illustration layers. Decorations are separate from the brand mark.
- `public/brand/khaga-master.svg`: the single supplied emblem and wordmark silhouette. Do not generate substitute logos.
- `public/assets/campaign.svg`: cropped existing Ascent campaign concept, embedded as AVIF for a self-contained asset.

No city is part of the identity. Do not add Bengaluru, another location, fake founding dates, fake stock, fake reviews or unsupported fabric claims.

## Important: not ready to accept orders

- The checkout API is hard-disabled, not merely hidden by the browser.
- No live payments, order database, inventory reservations, tax calculation or shipping integration exists.
- Prices are indicative proposals, not current offers. Colourways are concepts, not confirmed supplier stock.
- The bag is saved only on this browser, and never sent as an order. It contains no personal/payment information.
- The S–XXL controls are demonstration options, not a final sizing chart.
- Product pictures are digital design studies; the campaign is existing AI concept imagery. They must not substitute for approved product photographs.
- Final fabric composition, measurements, fit, embroidery, colour, pricing, availability and care must be approved on samples.
- Business identity, customer support, legal policies, payment verification/webhooks, shipping and returns must be implemented before opening orders.
- The existing Slavant website has not been modified by this code.

## Tests

`npm test` builds the client and runs 51 Node tests covering HTTP pages, all variant artwork, catalogue filtering, search escaping, 404s, security headers, path traversal rejection, disabled checkout, optional authentication and cart validation.

See `docs/VALIDATION.md` for the actual local validation and its limitations.

## 0.3.0 — fast interactions and editorial refresh

Normal internal navigation, search and filtering use the same templates in the browser without document reloads. Colours, sizes and gallery views no longer depend on a separate `/api/catalog` request. URL history, native deep links and no-JavaScript page browsing remain available. Ctrl/Cmd clicks, downloads, external links and unsupported destinations retain native behavior. The browser bag is still a preview, never a submitted order.

The package now includes one generated `site.js`, versioned script/style URLs, bounded image prewarming, gzip for text/SVG assets, and media retry feedback. Checkout remains blocked in Node. No payment, analytics or credential configuration changed.

See `docs/INTERACTIONS_V3.md` for testing evidence, limitations and the live Hostinger verification checklist. The preceding v2 ZIP was not present on main; v3 builds on verified commit `fe6d2d8`.
