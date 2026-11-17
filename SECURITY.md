# Security reporting and scope

The 0.1 series is an early release maintained on a best-effort basis. Use the latest release and a supported Node.js version. No response-time or production-security SLA is promised.

For a vulnerability in a public repository, use **Security → Report a vulnerability** when the maintainer has enabled private reporting. If that button is absent, do not post exploit details, credentials or personal files publicly: open an issue asking for a private reporting route. Ordinary bugs may use the issue templates with a fictional minimal reproduction.

The Node server is a single-user loopback application. It is not a multi-tenant internet service. Don't expose its document, AI or conversion routes through a public tunnel. Browser documents stay in browser storage; the public photo proxy has no document or AI-key endpoint. Native converters and imported documents can contain hostile content; keep Keynote, LibreOffice, your browser and Node up to date. Archive size limits reduce resource abuse, but are not a sandbox for native applications.

Report a supported release/version, affected action, minimal safe reproduction and expected impact. Don't send customer material, real tokens or private source files. Fixes should preserve provenance, reviewable AI transactions and undo behavior. The maintainer will coordinate a fix and disclosure where practical.
