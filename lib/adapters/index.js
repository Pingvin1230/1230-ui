/**
 * lib/adapters/index.js
 *
 * Adapter registry. The dispatcher in routes/chat.js does:
 *
 *   import { ADAPTERS } from '../lib/adapters/index.js';
 *   const adapter = ADAPTERS[adapterSlug];
 *   for await (const evt of adapter.chat(ctx)) writeSse(evt);
 *
 * Adding a third executor is a one-file change: create the adapter class,
 * import it here, and add it to ADAPTERS.
 *
 * @module adapters
 */

import { OpenCodeAdapter } from './opencode.js';
import { HermesAdapter } from './hermes.js';

export const ADAPTERS = {
  'hermes': new HermesAdapter(),
  'opencode-1230': new OpenCodeAdapter(),
};

export { ExecutorAdapter } from './base.js';
export { HermesAdapter } from './hermes.js';
export { OpenCodeAdapter } from './opencode.js';
