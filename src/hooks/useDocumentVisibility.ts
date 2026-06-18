import { useEffect, useRef } from 'react';

/**
 * Calls `onVisible` every time the document (or browser tab/window) becomes
 * visible — either via the `visibilitychange` event (tab switch, minimise)
 * or the `focus` event (window restored from another desktop). The two
 * events are not redundant: `focus` fires when the user returns to a tab
 * that was previously backgrounded, while `visibilitychange` also covers
 * the case of switching back from a different window of the same tab.
 *
 * The callback is intentionally only invoked on the visible transition —
 * going hidden does nothing. This matches the SessionsPage focus-refresh
 * pattern (see obs_mq0xcrmc, 2026-06-05) and the useNotifications badge
 * clear pattern (src/hooks/useNotifications.ts:56-66).
 *
 * The callback identity is captured in a ref so the listener is attached
 * exactly once per mount, and the latest callback is always invoked. This
 * avoids re-binding on every render while still letting consumers inline
 * `useCallback` results without needing to list them in deps.
 */
export function useDocumentVisibility(onVisible: () => void): void {
  const callbackRef = useRef<() => void>(onVisible);

  useEffect(() => {
    // Mirror the current callback into the ref on every render. We use
    // an effect (not an inline assignment) so the linter doesn't flag
    // the ref write during render. The listener registered below always
    // reads the freshest ref value.
    callbackRef.current = onVisible;
  });

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return undefined;
    }
    const handler = () => {
      if (document.visibilityState === 'visible') {
        callbackRef.current();
      }
    };
    document.addEventListener('visibilitychange', handler);
    // 'focus' is a no-op when the window is already focused, but on macOS
    // Chrome it fires when the user brings the window forward via ⌘+Tab
    // (which on some platforms does NOT flip visibilityState). Belt and
    // braces — see SessionsPage for the same pairing.
    window.addEventListener('focus', handler);
    return () => {
      document.removeEventListener('visibilitychange', handler);
      window.removeEventListener('focus', handler);
    };
  }, []);
}
