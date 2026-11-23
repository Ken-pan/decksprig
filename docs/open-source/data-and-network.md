# Data and network behavior

The local edition stores documents and historical versions on the user's machine. Browser editions use IndexedDB. Recovery drafts and preferences use browser storage. This storage can be lost when users clear site data or move to a different browser or origin; export Deck JSON backups regularly.

Ordinary local document editing does not require an account. Optional actions have additional data flows:

| Action | Data leaving the local workspace |
| --- | --- |
| AI proposal | The prompt, selected document context, relevant tool results and optional recent request history go to the selected provider |
| Online font search/loading | Search/filter requests and font downloads go to the font service/CDN |
| Photo search/import | Queries, source identifiers and image requests go to the selected photo service; an online proxy may receive those requests |
| Figma or Google import/export | Access tokens and selected-file requests go to the relevant platform, through the local service or directly from the browser edition |
| Embedded prototypes and external images | Requests go to the embedded page or image host |
| Explicit website publishing | The prepared presentation and hosting credentials go to the selected hosting provider after confirmation |

Session keys and Google OAuth access tokens are kept in memory rather than written into documents. This does not mean the receiving provider has no retention. OpenAI requests use `store:false`, but provider abuse-monitoring policies may still apply. Compatible providers have their own terms and storage behavior.

A hosted demo also has infrastructure-level access logs and provider privacy policies. Before publication, its operator should document the actual host, recipients, retention and contact route. This description is a data-flow guide, not a completed worldwide privacy compliance assessment.

Do not put confidential, personal or unlicensed source material into an AI request or public presentation without the required authority. Imported material is not covered automatically by Deckleaf's proposed code license.

## Public release boundaries

The browser edition does not accept stock-photo developer keys or directly call stock-provider authenticated APIs. A local server maintainer can supply environment credentials. The public Openverse-only function rejects malformed queries, bounds concurrent work and is disabled by default and requires `DECKLEAF_PHOTO_SEARCH_ENABLED=true` to opt in. Its configured Netlify per-IP rule must be verified after deployment and is not a global spend cap. See PRIVACY.md for the user-facing policy.
