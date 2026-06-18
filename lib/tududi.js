/**
 * lib/tududi.js
 *
 * Pure helpers for the Tududi proxy: connectivity probe and URL building.
 * Kept here (not in routes/tududi.js) so they can be unit-tested in isolation
 * with a mocked global.fetch.
 */

/**
 * Probe a Tududi instance by hitting /api/profile with the bearer token.
 *
 * Returns { ok, status, error }:
 *   - ok      — true if the upstream returned 2xx
 *   - status  — HTTP status code (0 if the request never completed)
 *   - error   - string message on failure (timeout / network / no token)
 *
 * Never throws — all failures are reported via `ok: false`.
 */
export async function probeTududi(apiUrl, apiToken, timeoutMs = 5000) {
  if (!apiToken) {
    return { ok: false, status: 0, error: 'TUDUDI_API_TOKEN is not set' };
  }
  if (!apiUrl) {
    return { ok: false, status: 0, error: 'TUDUDI_API_URL is not set' };
  }

  const base = apiUrl.replace(/\/$/, '');
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(`${base}/api/profile`, {
      headers: { authorization: `Bearer ${apiToken}` },
      signal: ac.signal,
    });
    return { ok: r.ok, status: r.status };
  } catch (err) {
    const message =
      err && err.name === 'AbortError'
        ? `timeout after ${timeoutMs}ms`
        : (err && err.message) || 'network error';
    return { ok: false, status: 0, error: message };
  } finally {
    clearTimeout(timer);
  }
}
