# Decksprig identity

The active mark is the user-selected solid rounded card with a transparent two-leaf sprout cutout and one rear card. The original clipboard PNG is retained unchanged as `public/brand/references/approved-logo-source.png` (SHA-256 `c13f7da15b77f9acbacdd841bc9e213f8c3b5b0a24f5ca535f5a188b654324bf`). The reviewed vector master is `public/brand/references/approved-logo-vector.svg`.

The vector contains two editable cubic paths and no embedded bitmap. Card corners and the rear cap meet straight edges tangentially; source sprout curves and spacing are preserved. Negative space is transparent. Default ink remains `#055841`, the selected application brand color. The source image's texture and gradient are not part of the vector mark.

The editor document navigation uses a dedicated outline variant, following the user's Figma Slides UI reference. Its editable authority is `public/brand/references/header-outline-vector.svg`; the card-and-sprout contour reduces the rear card to one short vertical line. The overall mark is optically centered, using a 1.125px stroke at 24px and a wider stem opening and a smooth, tangent-continuous leaf junction; the sprout cutout meets the lower edge. Navigation uses tighter title spacing, with the phone target kept at 44px. The navigation mark remains 24px with an independent button target. Library, About, browser icons and exported brand artwork keep the approved solid mark.

## Active assets

| Purpose | Asset |
| --- | --- |
| Editable mark | `public/brand/logo.svg` |
| Editor navigation outline | `public/brand/header-outline.svg` |
| Transparent mark, 1024px | `public/brand/logo.png` |
| App icon artwork | `public/brand/app-icon.svg`, `app-icon.png` (1024), `app-icon-512.png`, `app-icon-192.png` |
| Browser icon | `public/favicon.svg`, `public/favicon.ico` (16/32px frames), `public/brand/favicon-16.png`, `favicon-32.png` |
| Home-screen artwork | `public/brand/apple-touch-icon.svg`, `apple-touch-icon.png` (180px) |
| Asset revision and hashes | `public/brand/manifest.json` |
| Downloadable brand kit | `output/brand/Decksprig-Brand-Kit.zip` |
| Current brand board | `output/branding-pass/brand-system.png` |
| Logo/icon size preview | `output/brand/brand-preview.png` |

`src/components/BrandLockup.svelte` owns the reusable application wordmark and mark. The editor, library, empty/loading states, About and brand guide consume it. The retained character-page component also uses this lockup; the current `characters.html` entry redirects to the illustration library. Entry icon metadata is generated regardless of that routing choice. The local Figma export plugin embeds the same vector paths and inherits the host's text color; no remote logo dependency is added to the plugin.

## Theme and caching

Header, Library and About marks use black in light appearance and white in dark appearance, independent of the accent palette. Other application marks use the selected accent; controls and states use existing semantic roles. All seven palettes support light, dark and system appearance. The browser icon uses the palette's paired accent/foreground roles. Document and illustration colors stay independent. Exported artwork is the default ink-green identity; home-screen artwork is a static asset.

The solid vector SHA determines its asset revision; the navigation outline has an independent source hash and CSS mask URL. `src/brand-assets.ts`, `src/brand-assets.css` and all three entry-page icon links are generated together. CSS masks and dynamic browser icons request the versioned master, so a previous logo URL is not reused after a new release. Do not hand-edit generated files.

## Regenerate and verify

```sh
npm run build:brand
npm run check
npm test
npm run build
```

`build:brand` validates PNG provenance, adopts the reviewed master, generates all SVG/PNG/ICO derivatives with the pinned local renderer, updates entry metadata/plugin artwork, and packages the brand kit. No browser or terminal SVG installation is needed. Normal `build` regenerates these assets before bundling and precompression.

For current screenshots, start the app and run the bundled Playwright CLI's `run-code --filename=scripts/render-brand.js`. It captures the actual theme-aware brand guide and small-size preview without changing application preferences. [Brand guide](../brand.html) offers independent palette previews.

## Preservation and evidence

Original references, previous outline/two-leaf and three-leaf marks stay under `public/brand/references`. Older candidate images and verification records remain historical; current documentation does not substitute new results into old reports. See [historical branding records](branding-history.md).

The reviewed silhouette has 99.758% binary overlap with the supplied image after tangent-corner cleanup. This is a shape comparison, not a claim of pixel-identical texture. Current full-adoption checks are recorded in `docs/verification/branding-current-20261012.json`. UI screenshots are under `output/playwright/brand-current`; preview artifacts are local. App-icon artwork has not been packaged or installed as a native app.
