import * as z from 'zod/mini';
import en from 'zod/v4/locales/en.js';
// Use the same patched Zod4 core without loading fluent/JSON conversion methods
// into the initial editor bundle. Preserve the existing English errors.
z.config(en());
export {z};
