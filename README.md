# Decksprig

## 使用指导

[简明中文指南](docs/open-source/getting-started.zh-CN.md) · [AI 提问示例](docs/open-source/prompt-examples.zh-CN.md) · [给 AI 的接入指南](docs/open-source/agent-guide.md) · [AI 阅读入口](llms.txt)

## Public release

The canonical local workspace is `~/Projects/decksprig/`. It contains the current development code, local documents, imported originals and the public repository's Git history. The former `~/Projects/deck-studio/` path is a compatibility symlink to this same directory; it is not another checkout. Existing document identifiers, browser storage and environment variable names remain compatible.

The [official source repository](https://github.com/Ken-pan/decksprig), [release downloads](https://github.com/Ken-pan/decksprig/releases), [live editor and demo](https://decksprig.kens-toolbox.com/) and [Chinese guide](https://decksprig.kens-toolbox.com/guide.zh-CN.html) remain separate delivery surfaces. Create release artifacts with the packaging scripts; a second sibling release checkout is no longer needed. The pre-consolidation release files and development Git metadata are retained under `output/local-consolidation-20261115/` for recovery. This directory is private local working material and is excluded from Git and packaged releases.

A local slide editor for portfolios, project reviews and design proposals. Create editable slides, review AI proposals, and export presentations.

An early 0.1 release by Ken Pan, built with Codex. Code is [MIT licensed](LICENSE): commercial use and closed-source derivatives are welcome. Project-created decorative artwork uses CC0; [third-party assets and branding](ASSET_LICENSES.md) have separate terms.

## Run locally

Use Node.js 22.14 or newer and a modern browser.

```sh
npm ci
npm run dev
```

Open [the local editor](http://127.0.0.1:4310/). The service listens on the local loopback address. Start with a template or import your own presentation. Templates contain fictional placeholders and project-generated artwork. Try the [three-slide introduction](public/examples/deckleaf-demo.deck.json) by downloading it and choosing Import document.

```sh
npm run check
npm test
npm run build
npm start
```

## Editing

- Text, images, shapes, tables and editable charts.
- Groups, nested auto layout, alignment, snapping, layers and reversible layout suggestions.
- Slide templates, document styles, speaker notes, transitions and presentation mode.
- Local fonts and resource libraries, with retained source and license information.
- Optional AI proposals that are reviewed before application and use the same revision and undo system as manual edits.

## Import and export

| Format | Current support |
| --- | --- |
| Deck JSON | Native editable documents, including embedded media and metadata |
| PowerPoint | Editable import/export of supported objects; verify complex effects, charts and typography in the target app |
| PDF | Reference rendering and extracted text; not a fully editable reconstruction |
| Keynote | Local macOS conversion requires Keynote; reference rendering can also require LibreOffice |
| Figma and Google Slides | Optional API/token or plugin workflows; supported objects and source references vary by source |
| Structured slide JSON | User-supplied content, images and speaker notes |
| HTML | Standalone presentation with embedded local media/fonts; remote images and prototypes may still need the network |
| Broadser JSON | Local file exchange |

PPTX/Keynote archive imports are limited to 100 MB of input, 15,000 entries, 40 MB per expanded entry and 256 MB in total. Encrypted, ZIP64 and unsafe archives are rejected; re-export a smaller PPTX or PDF from the source app.

A preserved source render and an editable conversion have different purposes. Import reports describe unsupported content. No general pixel-exact or lossless round-trip claim is made.

Saved Figma Slides connections reappear in the header after reload, with direct access to status, conflict review and reconnect. Native spring controls retain the full playback duration; editor, preview and HTML export share rebound approximations checked against native playback. See the [compatibility evidence and remaining limits](docs/figma-slides-compatibility.md) and [feature inventory](docs/figma-slides-feature-parity.md).

## Data and optional connections

The local edition stores documents, history and imported files in `.data/`; recovery drafts also use browser storage. Back up Deck JSON files and the data directory. Browser-only builds use IndexedDB; export backups before clearing site data or changing browsers.

Ordinary local editing needs no account or AI key. When you enable AI, selected document context, your prompt and relevant tool results are sent to your chosen provider. Resource search, online fonts, cloud import and embedded prototypes contact their providers. See [data and network behavior](docs/open-source/data-and-network.md).

Keep credentials in session memory or local environment configuration. Never put them in a document, public frontend bundle or Git. Configure Google OAuth outside the repository using a personal Desktop OAuth client and enable the required Google APIs. Optional integrations are not required for local editing.

## Browser build

```sh
npm run build:web
```

The browser publication package is prepared under `output/website/dist`, with resource functions under `output/web-editor/functions`. Publishing that package is a separate action. The local Node service is designed for one user on loopback; exposing it as a shared internet service requires a separate authentication, authorization and resource-limit design.

## Separate distribution packages

```sh
npm run package:distribution
```

This builds a fresh local release under `output/distribution/<release-id>/`: `app/`, `website/` and `export-sources/`, plus three tar.gz archives, SHA-256 manifests and per-package/aggregate byte counts in `release.json`. Existing releases are never merged or removed. To choose a fresh location, pass `-- --output output/my-release`.

The app contains full editable PPTX/POTX font payloads, browser fonts and licenses, and original template media for offline export. Website assets and PPTX-builder source TTF files are kept in their separate packages; no export needs to download the source package. The source archive preserves the original font manifest, full TTF faces, generator and all hashed source inputs. Repository originals remain intact.

Extract the app archive and run `node app/runtime/server.mjs` with Node.js 22.14 or newer. The archive includes the production service, MCP service and runtime dependencies. Open [the local editor](http://127.0.0.1:4310/). Documents default to `app/.data`. Set `DECK_STUDIO_DATA` to an absolute path to use an existing library. For stdio MCP, use `node /path/to/app/runtime/mcp.mjs` with the same library setting.

The service streams packed Brotli assets at their original URLs. Identical template and gallery images share a single copy on filesystems that preserve tar hard links. Native conversion uses separately installed tools such as Keynote or LibreOffice. Remote-only media, online fonts and interactive embeds depend on their providers.

For a smaller download of the full app, build the compact offline installer from an existing distribution. Use Rust 1.89+, the `wasm32-wasip1` Rust target and a WASI SDK. The SDK is used only to build the installer. For example, for a distribution staged at `output/my-release`:

```sh
WASI_SDK_PATH=/path/to/wasi-sdk npm run package:compact -- --input output/my-release --output output/my-compact-release
```

Extract `decksprig-compact-offline.tar`, then run `node installer/unpack.mjs /path/to/new-folder`. The bundled decoder restores the original PNG bytes and verifies the installation against the release manifest before placing the app in the new folder. After installation, start `node /path/to/new-folder/app/runtime/server.mjs`.

The same build tools can prepare a directly extractable app with a smaller on-disk footprint. Pass `--pack-artwork` to `package:distribution` with `WASI_SDK_PATH` set. The app includes the decoder, retains the original artwork at its existing URLs and uses prebuilt gallery thumbnails. Users extract and start the app with the standard commands above.

`npm run build` produces only the app resources. `npm run build:website` produces a standalone marketing site under `output/website-only/dist`; its `/app` link is a hosting integration point. `npm run package:export-sources` creates only the font source archive. The existing `build:web` command deliberately assembles the compatible combined browser-hosting layout; setting `DECK_STUDIO_WEB_OUTPUT=output/my-browser-build` stages that build separately without changing the default publication output.

## Source package

```sh
npm run package:source
```

This prepares `output/open-source/deckleaf-source.tar.gz` and `deckleaf-source-manifest.json` with SHA-256 hashes from explicit source inputs. It excludes local documents, private evidence, historical builds and extracted portfolio cases. Source artwork and original font/resource notices remain available. Illustration ZIP downloads are created on demand in the gallery; a duplicate full PNG archive is not bundled.

The package is a reviewable local release candidate. Creating a public repository and deploying a demo are separate actions. See [release preparation](docs/open-source/release-checklist.md), [source provenance](docs/provenance.md), and [brand documentation](docs/branding.md).

## Licenses and contributions

Fonts, libraries, icons and illustrations retain their individual licenses. These are separate from the MIT code license. Notices are stored in `public/fonts`, `public/resources/licenses` and `public/licenses/charts`. Imported content and user-created documents remain subject to their own rights.

Read [complete third-party notices](THIRD_PARTY_NOTICES.md), [privacy](PRIVACY.md), [security reporting](SECURITY.md) and [contribution guidelines](CONTRIBUTING.md). Small bug reports with fictional reproductions are especially useful.

Decksprig and Broadser are personal tools by Ken Pan. Legacy `deck-studio` document identifiers, storage keys and environment variables remain compatible; no document migration is required.

To enable stock-photo APIs on a local server, its maintainer may set `UNSPLASH_ACCESS_KEY` or `PEXELS_API_KEY` outside Git. Ordinary users do not need developer accounts. The browser edition uses open collections and links to provider websites; it never accepts stock-provider developer keys. The hosted open-photo proxy is disabled by default. Set `DECKLEAF_PHOTO_SEARCH_ENABLED=true` on a reviewed deployment to enable it; remove the variable or set it to `false` to shut it down.

AI template authoring uses the native template catalog to match reader tasks and evidence. Create with AI can choose a family automatically or honor an explicit family; review shows the selected family and page layout. Mapped authored template pages can be read and adapted through `read_template` and `prepare_template_update`, with the same scoped, revision-bound proposals and undo as manual editing. Imported and older unmapped pages remain editable through their existing objects.

Duoquill blue and black illustrations also have a standalone [CC0 collection](https://github.com/Ken-pan/duoquill). The editor retains its pinned local copy for offline use. [Clovlets](https://github.com/Ken-pan/clovlets) is a separate CC0 sticker collection from the personal Broadser project.
