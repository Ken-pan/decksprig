export const DOCUMENT_FRAME_TYPE = 'application/vnd.deck-studio.document-frames-1';
export const DOCUMENT_FRAME_ACCEPT = DOCUMENT_FRAME_TYPE + ', application/vnd.deck-studio+json, application/json';
export const DOCUMENT_FRAME_HEADER_LIMIT = 16 * 1024 * 1024;
export const DOCUMENT_FRAME_MAX_ASSET = 35_000_000;
export const documentFramePrefixes = /* @__PURE__ */ Object.freeze([
  '',
  'data:image/png;base64,',
  'data:image/jpeg;base64,',
  'data:image/webp;base64,',
  'data:image/gif;base64,',
  'data:image/svg+xml;base64,',
]);
