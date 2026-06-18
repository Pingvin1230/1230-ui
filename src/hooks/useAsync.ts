import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

export interface UseAsyncResult<T> {
  data: T | null;
  loading: boolean;
  /** Raw thrown value (uncaught error from `asyncFn`). `null` when no error. */
  error: unknown;
  /** Re-run the async function (bumps an internal reload counter). */
  refetch: () => void;
}

/**
 * Encapsulates the duplicated fetch-on-mount pattern found across the pages:
 * `loading` / `error` state plus a `cancelled` flag that guards `setState`
 * after the component unmounts or the deps change.
 *
 * The provided `asyncFn` runs whenever `deps` change (exactly like the dep
 * array of `useEffect`). `refetch()` re-runs it on demand (e.g. retry button).
 *
 * `asyncFn` may return its data (exposed via `data`) or simply set its own
 * state as a side effect (return `void` and ignore `data`) — useful for pages
 * that hydrate multiple pieces of state from a single combined fetch.
 */
export function useAsync<T>(
  asyncFn: () => Promise<T>,
  deps: DependencyList,
): UseAsyncResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadTick, setReloadTick] = useState(0);

  // Keep the latest callback without re-running the effect on every render.
  // Updated in an effect (refs must not be mutated during render).
  const fnRef = useRef(asyncFn);
  useEffect(() => {
    fnRef.current = asyncFn;
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const result = await fnRef.current();
        if (!cancelled) setData(result);
      } catch (e) {
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `deps` is caller-controlled; spreading is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadTick]);

  const refetch = useCallback(() => setReloadTick((n) => n + 1), []);

  return { data, loading, error, refetch };
}
