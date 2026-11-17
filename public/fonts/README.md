# Bundled fonts

26 free open-source families, licensed under SIL OFL 1.1. Each family retains its complete copyright and license notice. Downloaded files are unmodified Fontsource distributions; versions and official source links are recorded in src/core/font-catalog.json. Fonts are served locally.

Refresh explicitly with `node scripts/vendor-fonts.mjs`. Existing Inter, Manrope and Bodoni Moda source files are preserved.

The private application families load `ui-inter.woff2` and `ui-manrope.woff2`,
losslessly compressed from the preserved `inter.ttf` and `manrope.ttf`. These
are full variable fonts with the same glyphs, metrics and OFL notices; document
fonts and exports continue to use the original sources. Regenerate with FontTools
4.67.0 and Brotli: `fonttools ttLib.woff2 compress public/fonts/inter.ttf -o public/fonts/ui-inter.woff2`
(and the equivalent Manrope paths). The editor
preloads only its essential UI family; the brand family loads when used.
