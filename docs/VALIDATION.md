# Validation — v0.1.0

## Completed locally

- Node.js 22.16.0.
- `npm ci --offline`: installs the dependency-free project successfully.
- `npm test`: **37 passed, 0 failed**.
- `npm run build`: succeeded; seven product pages and every configured colour's front/back/detail artwork validated.
- HTTP server started at localhost:3000 and `/health` returned 200 with `mode: preview`.
- Source files are served through an explicit public-asset map. Application files and `.env` are not public.
- Checkout is denied on the server even when called directly.

## Browser review

This environment's Chromium policy blocks HTTP navigation. To avoid pretending that a live deployment was tested, browser validation used an **offline, inlined mirror** of the actual local-server HTML, CSS, SVG responses and source event handlers. Transport, history and storage were supplied by a hermetic review harness. This is **not** a live-hosting end-to-end test.

Desktop/mobile screenshots were reviewed. No horizontal overflow was observed on Home, Collection, Product, Story and Preview Help at 320, 390, 768 and 1440 pixels.

The harness passed these UI checks with zero page errors:

1. Missing size produces a visible error and does not add to the bag.
2. Product colour changes the label, URL intent, front image and thumbnails.
3. Front/back/detail gallery controls work.
4. The selected colour and size appear in the bag.
5. Quantity changes recompute the catalogue-derived subtotal.
6. Checkout stays disabled.
7. Only a sanitised selection is written to the browser storage interface.
8. Escape closes the modal and returns keyboard focus.
9. Removing the last item restores the empty state.
10. Search opens with input focus.
11. Mobile navigation opens and presents its links.
12. The responsive no-overflow checks above pass.

## Still to verify after deployment

Hostinger connection, deployed branch/commit, build/runtime logs, actual HTTPS certificate and domain routing, browser asset loading under HTTP CSP, real localStorage persistence across visits, mobile browser behaviour, keyboard/screen-reader review, hosting cache behaviour and any private-preview authentication.

No live payment, email signup, order, shipping, Meta Pixel or analytics service was configured or tested.
