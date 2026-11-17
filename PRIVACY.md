# Data and privacy

Deckleaf is a personal open-source project maintained by Ken Pan. This describes the source release dated 14 October 2026; a public host must separately identify its operator, contact route and logging practices.

Local editing requires no account. The Node edition stores documents, history and imported originals in `.data` on your computer. The browser edition stores documents and history in IndexedDB; settings, recovery drafts and preferences also use browser storage. Export a Deck JSON backup before clearing site data. Use the document library to delete documents; deleting a working document does not erase separately retained imported originals or your exported backups. Remove the corresponding local copies yourself when you no longer need them.

| Optional action | What leaves the device |
| --- | --- |
| AI connection, model listing or proposal generation | Credentials to your selected provider; selected document context, prompts and relevant tool results. Proposal requests are optional. Provider retention depends on that provider and account settings; `store:false` is not a promise of zero logging |
| Open photo search or image import | Search terms, requested resource IDs and normal connection information to the configured photo proxy and source/CDN |
| Server-configured Unsplash/Pexels search | Search terms to that provider. Developer credentials remain on the local server; the browser edition has no developer-key input |
| Online fonts | Font search/download requests to the font source; ordinary editing uses bundled/local fonts |
| Figma or Google source import/export | The selected source identifiers, tokens and requested files to the respective service; cloud changes require an explicit export/publish action |
| Prototype, remote image or presentation sharing | Requests to the referenced host; remote embeds may use their own cookies and collect viewer information |

There is no project analytics SDK or automatic document upload in this source release. Hosting/CDN access logs can still include IP addresses and request paths. A self-hosting operator controls their retention and deletion, and must document these before offering a public service. The repository cannot delete a third-party provider's logs or independently verify its retention.

AI credentials stay in session memory or server environment configuration, not in documents or Git. Some OAuth/API workflows use local user configuration outside the repository. Don't publish those files. Before sharing a Deck file, review source URLs, speaker notes, hidden slides, image metadata, embedded fonts and reference renders: they can contain personal or confidential material.

For source-project questions use this repository's issue tracker without personal documents or credentials. For a privacy request about a hosted copy, contact that copy's operator. This project has no commercial support or retention SLA.
