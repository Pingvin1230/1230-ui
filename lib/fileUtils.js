/**
 * lib/fileUtils.js
 *
 * Shared filename helpers used by routes/files.js and routes/globalFiles.js.
 */

/**
 * Fixes double-encoded UTF-8 filenames (mojibake).
 * Some browsers/upload paths send UTF-8 bytes that get re-encoded as UTF-8.
 * E.g. "Снимок" → "Ð¡Ð½Ð¸Ð¼Ð¾Ðº" in the DB.
 *
 * @param {string} [name]
 * @returns {string|undefined}
 */
export function fixFilenameEncoding(name) {
  if (!name) return name;
  try {
    // If the string contains characters in the Ð/Ñ range (U+00C0–U+00FF),
    // it's likely double-encoded UTF-8.
    if (/[\u00C0-\u00FF]/.test(name)) {
      return Buffer.from(name, 'latin1').toString('utf8');
    }
  } catch {
    // ignore — return original
  }
  return name;
}
