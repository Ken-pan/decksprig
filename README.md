# Decksprig

A local-first presentation editor. Make slides, review optional AI changes, and take your work with you.

[**Try the editable sample**](https://decksprig.kens-toolbox.com/app?demo=1) · [Website & demo](https://decksprig.kens-toolbox.com/) · [Getting started](docs/open-source/getting-started.md) · [中文](README.zh-CN.md) · [Downloads](https://github.com/Ken-pan/decksprig/releases/tag/v0.1.8)

![The actual Decksprig editor](public/website/assets/editor-light.jpg)

An early **0.1.8** release by Ken Pan, developed with Codex. Code is [MIT licensed](LICENSE); commercial use and closed-source derivatives are welcome. Original decorative artwork is CC0 to the extent of the rights held; [fonts, icons, third-party assets and brand marks](ASSET_LICENSES.md) have separate terms.

## Guides

- [User guide](docs/open-source/getting-started.md) · [中文指南](docs/open-source/getting-started.zh-CN.md)
- [AI / MCP guide](docs/open-source/agent-guide.md) · [AI prompt examples (中文)](docs/open-source/prompt-examples.zh-CN.md) · [AI reading index](llms.txt)

## Try it in five minutes

1. [Open the sample](https://decksprig.kens-toolbox.com/app?demo=1). It creates a new three-slide document in this browser. Close the import report after reading it.
2. Rename the document in the top bar. Select text and choose **Edit text**, or double-click it to edit; select an object to change its properties.
3. Choose **Present** to preview. Press Escape to return.
4. Open **Document menu → Export document → Deck file** to download an editable backup. Choose **PowerPoint** or **Web page** to share a presentation.

No account, provider subscription or API key is required for this workflow. Browser documents stay in this browser; export a backup before clearing site data or changing browsers. Desktop is the primary editing surface. See the [walkthrough and video](https://decksprig.kens-toolbox.com/demo.html).

## Run locally

Install **Node.js 22.14 or newer**, Git and a modern browser. No native conversion tools are needed for ordinary editing.

```sh
git clone https://github.com/Ken-pan/decksprig.git
cd decksprig
npm ci
npm run dev
```

Open **http://127.0.0.1:4310/**. Choose a template, start blank, or select **Try sample**. Keep the terminal running. If port 4310 is occupied, stop your earlier Decksprig instance first; do not clear its data directory.

To run a production build locally:

```sh
npm run build
npm start
```

Local documents, history and imported originals are stored in `.data/`; recovery drafts also use browser storage. Export Deck files regularly. Back up `.data/` with the app stopped before moving or upgrading a local installation. A browser demo and a local installation have separate document libraries.

## What you can do

- Edit text, images, shapes, tables and charts; arrange groups, layers and nested auto layout.
- Use templates, document styles, local fonts, artwork libraries, speaker notes and motion.
- Preview AI proposals, apply reviewed changes and undo them through the same document operations as manual editing.
- Import your sources and export editable Deck files, PowerPoint, PDF through the browser print dialog, or standalone HTML.

| Capability | Browser demo | Local Node edition |
| --- | --- | --- |
| Manual editing, templates, presentation, Deck/PPTX/HTML export | Yes | Yes |
| Document storage | This browser, IndexedDB | `.data/` and browser recovery drafts |
| PowerPoint and PDF import | Supported content; conversion warnings apply | Supported content; optional source rendering |
| Native Keynote conversion | Use a PPTX/PDF export from Keynote | macOS with Keynote; some rendering needs LibreOffice |
| AI | Optional HTTPS provider with browser access, session key | Optional provider or compatible local model |
| Figma / Google integrations | Optional token/plugin workflows; provider and browser restrictions | Optional configuration; Google Desktop OAuth supported |
| Hosting connection / MCP | Export HTML and use your host | Optional local workflows |

PPTX import/export supports selected objects; review complex typography, charts, effects and fonts in the destination app. PDF import supplies references and extracted text rather than a fully editable reconstruction. Source renders do not establish editable conversion fidelity. PPTX/Keynote archives are bounded to 100 MB input, 15,000 entries, 40 MB per expanded entry and 256 MB total; unsafe, encrypted and ZIP64 archives are rejected. See [format limits and troubleshooting](docs/open-source/getting-started.md#formats-and-troubleshooting).

## Optional connections and privacy

AI is optional and needs your own provider configuration. When requested, selected document context, prompts and relevant tool results go to that provider. Online fonts, remote images, prototypes and cloud imports contact their providers. Credentials belong in session memory or local environment configuration, never documents or Git. Read [connection setup](docs/open-source/connections.md), [data and network behavior](docs/open-source/data-and-network.md) and [privacy](PRIVACY.md).

The public demo has no document-upload service or AI-key endpoint. Its optional photo-search proxy is disabled. Hosting/CDN access logs can still contain IP addresses and request paths. The local Node server listens on loopback and is intended for one user.

## Develop, build and self-host

```sh
npm ci
npm run licenses:generate
npm run check
npm test
npm run build
npm run build:web
```

The browser website/editor is written to `output/website/dist`; optional resource functions to `output/web-editor/functions`. Use a host with the supplied headers and `/app` rewrite. [Self-hosting instructions](docs/open-source/self-hosting.md) include a static-only option and the Netlify configuration. Do not expose the local Node document server as a public shared service.

```sh
npm run package:source
```

Creates a fresh directory under `output/open-source/<timestamp>/` containing `decksprig-source.tar.gz`, a file manifest and `SHA256SUMS`. Local documents, credentials, private evidence and historical builds are excluded. The [v0.1.8 release](https://github.com/Ken-pan/decksprig/releases/tag/v0.1.8) contains a reviewed source archive, browser build, sample and demo video. `private:true` prevents accidental npm publication and does not restrict GitHub use.

## License, support and contributions

Read [asset licenses](ASSET_LICENSES.md), [complete third-party notices](THIRD_PARTY_NOTICES.md), [source provenance](docs/provenance.md), [security reporting](SECURITY.md) and [contributing](CONTRIBUTING.md). Report bugs with a fictional minimal reproduction. This early release has no commercial support or service-level commitment.

Decksprig retains legacy `deck-studio` schema identifiers, storage keys and environment variables for document compatibility. Do not rename them in existing documents.

[Duoquill](https://github.com/Ken-pan/duoquill) illustrations and [Clovlets](https://github.com/Ken-pan/clovlets) stickers are independent CC0 collections by the same creator. Decksprig retains a pinned artwork copy for local use.

## Name and website change

Decksprig was previously called Deckleaf. Version 0.1.1 keeps the same document format, `deck-studio-*` storage keys and resource IDs. Existing local `.data/` libraries continue to work. The old hosted editor remains available at [the previous address](https://deckleaf-kens-toolbox.netlify.app/app) for accessing documents saved there. Browser storage belongs to its exact origin: export Deck files at the old address, then import them at the new one. Nothing is automatically transferred between domains. Read [migration notes](docs/open-source/name-change.md).

## Separate distribution packages

```sh
npm run package:distribution
```

This builds a fresh local release under `output/distribution/<release-id>/`: `app/`, `website/` and `export-sources/`, plus three tar.gz archives, SHA-256 manifests and per-package/aggregate byte counts in `release.json`. Existing releases are never merged or removed. To choose a fresh location, pass `-- --output output/my-release`.

The app contains full editable PPTX/POTX font payloads, browser fonts and licenses, and original template media for offline export. Website assets and PPTX-builder source TTF files are kept in their separate packages; no export needs to download the source package. The source archive preserves the original font manifest, full TTF faces, generator and all hashed source inputs. Repository originals remain intact.

These app archives contain the existing Vite frontend/runtime assets. Run them with the repository Node service using `DECK_STUDIO_DIST=/absolute/path/to/app npm start`; Node dependencies and native Keynote conversion tools remain separate requirements. Documents containing remote-only media, online fonts or interactive embeds still depend on their providers unless those resources have already been embedded.

`npm run build` produces only the app resources. `npm run build:website` produces a standalone marketing site under `output/website-only/dist`; its `/app` link is a hosting integration point. `npm run package:export-sources` creates only the font source archive. The existing `build:web` command deliberately assembles the compatible combined browser-hosting layout; setting `DECK_STUDIO_WEB_OUTPUT=output/my-browser-build` stages that build separately without changing the default publication output.

