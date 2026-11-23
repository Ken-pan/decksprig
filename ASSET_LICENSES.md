# Artwork and brand permissions

Ken Pan dedicates any copyright and related rights he holds in the project-created artwork listed below to the public domain under [CC0 1.0](public/licenses/upstream/CC0-1.0.txt), effective 14 October 2026. Commercial reuse, modification and redistribution are allowed without attribution. This grant applies only to those rights; AI output may be non-exclusive or lack copyright protection in some jurisdictions.

| Material | Permission and evidence |
| --- | --- |
| Project-created images in `public/examples/template-assets` | CC0 1.0; generation provenance and original hashes accompany the templates |
| `public/resources/blue-black-v1/png`, the PNG artwork and masks in `characters-v1` | CC0 1.0; original files, generation metadata and hashes are preserved |
| Deck graphics whose manifest creator is Deckleaf or the legacy name Deck Studio | CC0 1.0; deterministic geometry and original hashes in the manifest |
| Twelve adapted Hero Patterns in `deck-graphics-v1` | **CC BY 4.0**, Steve Schoger; retain creator, source, license and adaptation notices in the manifest and exported credits. This row is excluded from the CC0 grant |
| Open Doodles by Pablo Stanley | Their upstream CC0 dedication; retain source evidence |
| The pinned free legacy illlustrations dataset | Its upstream CC0 dedication; excludes paid/pro collections |
| Bundled fonts | Individual SIL OFL 1.1 notices in `public/fonts`; embedding does not relicense the fonts |
| Icon datasets and code libraries | Their own MIT, ISC, Apache and other notices; see THIRD_PARTY_NOTICES.md |
| Online resource searches and imported user content | Each source's rights and license. The project grants no rights in these materials |

The Deckleaf double-leaf mark, Broadser mark and product names identify Ken Pan's products. Their artwork can be redistributed unmodified with an authentic copy of this project, and used to refer to it. The software license does not authorize misleading branding, endorsement claims or trademark registration. Forks marketed as separate products should use their own branding. No registered-trademark status is claimed.

CC0 does not clear someone else's trademark, privacy, publicity or patent rights. The MIT code license does not automatically apply to fonts, datasets, brand marks or imported documents. Keep resource attribution metadata when making presentations; modified CC BY artwork must retain attribution and identify changes.

The original Blue & Black collection is published independently at https://github.com/Ken-pan/blue-and-black, version 1.0.0. Deckleaf retains its existing artwork snapshot; originals and hashes remain unchanged. Broadser raster stickers are independently available as Mallowbits at https://github.com/Ken-pan/mallowbits and are not part of the Deckleaf source package.

The Unicode 17 case-folding conformance reference in `tests/fixtures/unicode/CaseFolding-17.0.0.txt` is upstream Unicode data, under Unicode License V3, and is excluded from the CC0 grant. Its original header and the full license in `tests/fixtures/unicode/LICENSE.txt` are retained. Source: https://www.unicode.org/Public/17.0.0/ucd/CaseFolding.txt. It is test data and is not included in the application runtime.

Native PowerPoint faces in `public/fonts/pptx` are generated from the existing licensed bundled originals. All 26 bundled families have their available regular, bold and italic native styles; source hashes, complete OFL notices and original glyph coverage are retained. Editable PowerPoint exports include the complete selected-family notices in the standard custom document properties part. This does not relicense imported or online fonts, which are not converted by this font builder.

The independent CFF/CFF2 font fixtures in `tests/fixtures/fonts` are derived from the existing OFL Manrope original, retain its notice in `OFL.txt` and source hash in `source.json`, and use the distinct family name Decksprig CFF Fixture. They are test-only resources and are excluded from the CC0 artwork grant and application runtime.

The unmodified WOFF2 codec WASM (`src/vendor/woff2-codec/codec.wasm`) is taken
from the pinned `woff2-codec@0.3.2` npm archive. Its SHA-256, archive identity and
Google source revisions are in `src/vendor/woff2-codec/source.json`; the MIT and
compiler-runtime notices are reproduced in
`public/licenses/upstream/font-runtime-woff2-codec.txt` and generated dependency
notices. Only the WOFF2 binary is used; the package's Node wrapper and WOFF1
components are excluded. The app uses its own typed decoder adapter on Node 22
and in browsers, with a 64 MB output cap. The notices generator validates the
binary and notice hashes before including this vendored asset.
