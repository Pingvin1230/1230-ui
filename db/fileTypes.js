/**
 * db/fileTypes.js
 *
 * Shared file-type constants used by routes/files.js (upload) and
 * routes/chat.js (agent file detection).  A single source of truth so
 * adding a new extension only requires one edit.
 */

export const MIME_MAP = {
  '.txt':  'text/plain',         '.md':   'text/markdown',
  '.py':   'text/x-python',      '.js':   'text/javascript',
  '.ts':   'text/typescript',    '.jsx':  'text/javascript',
  '.tsx':  'text/typescript',    '.json': 'application/json',
  '.csv':  'text/csv',           '.html': 'text/html',
  '.css':  'text/css',           '.sh':   'text/x-shellscript',
  '.sql':  'text/x-sql',         '.xml':  'text/xml',
  '.yml':  'text/yaml',          '.yaml': 'text/yaml',
  '.log':  'text/plain',         '.pdf':  'application/pdf',
  '.png':  'image/png',          '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',         '.gif':  'image/gif',
  '.webp': 'image/webp',
};

/**
 * Returns the MIME type for a given file path based on its extension.
 * Falls back to 'application/octet-stream' for unknown types.
 * @param {string} p
 * @returns {string}
 */
export function getMimeTypeForPath(p) {
  if (!p) return 'application/octet-stream';
  const idx = p.lastIndexOf('.');
  if (idx === -1) return 'application/octet-stream';
  return MIME_MAP[p.slice(idx).toLowerCase()] || 'application/octet-stream';
}

/**
 * Set of allowed file extensions (lowercase).
 * Used both for upload validation and agent file detection.
 */
export const ALLOWED_EXTENSIONS = new Set(Object.keys(MIME_MAP));

/**
 * Returns true if the path has a known, allowed extension.
 * Dot-files like ".gitignore" are excluded.
 * @param {string} p
 * @returns {boolean}
 */
export function hasAllowedExtension(p) {
  const idx = p.lastIndexOf('.');
  if (idx === -1) return false;
  const basename = p.slice(p.lastIndexOf('/') + 1);
  if (basename.startsWith('.')) return false;
  return ALLOWED_EXTENSIONS.has(p.slice(idx).toLowerCase());
}
