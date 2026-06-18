/**
 * lib/cloud/crypto.js
 *
 * AES-256-GCM encryption/decryption for cloud credentials.
 * HMAC-SHA256 for signing proxy URLs.
 * Both use the same CLOUD_CONNECT_KEY (32 random bytes, base64).
 */

import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const HMAC_INFO = 'cloud-proxy';

/**
 * Derive the AES key from the base64-encoded CLOUD_CONNECT_KEY.
 */
function getAesKey() {
  const key = process.env.CLOUD_CONNECT_KEY;
  if (!key) throw new Error('CLOUD_CONNECT_KEY is not set');
  const buf = Buffer.from(key, 'base64');
  if (buf.length !== 32) throw new Error('CLOUD_CONNECT_KEY must be 32 bytes (base64)');
  return buf;
}

/**
 * Derive the HMAC key via HKDF from the same CLOUD_CONNECT_KEY.
 */
function getHmacKey() {
  const aesKey = getAesKey();
  const hmacKey = crypto.hkdfSync('sha256', aesKey, '', HMAC_INFO, 32);
  return hmacKey;
}

/**
 * Encrypt plaintext string → { ct, iv, tag } (all base64).
 */
export function encrypt(plaintext) {
  const key = getAesKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ct: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

/**
 * Decrypt { ct, iv, tag } (all base64) → plaintext string.
 */
export function decrypt({ ct, iv, tag }) {
  const key = getAesKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Sign a token for a proxy URL: HMAC-SHA256 of "<connectionId>|<path>|<expiresAt>".
 * Returns base64url string truncated to 32 chars.
 */
export function signToken(connectionId, path, expiresAt) {
  const hmacKey = getHmacKey();
  const data = `${connectionId}|${path}|${expiresAt}`;
  const hmac = crypto.createHmac('sha256', hmacKey);
  hmac.update(data);
  const digest = hmac.digest('base64url');
  return digest.substring(0, 32);
}

/**
 * Verify a proxy URL token. Returns true if valid and not expired.
 */
export function verifyToken(token, connectionId, path, expiresAt) {
  if (Date.now() / 1000 > expiresAt) return false;
  const expected = signToken(connectionId, path, expiresAt);
  if (token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}
