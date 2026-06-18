import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

interface UseChatNavigationGuardOptions {
  isActiveRef: RefObject<boolean>;
  inputHasText: boolean;
  clearInput: () => void;
  navigate: (to: string) => void;
}

export interface UseChatNavigationGuardResult {
  leaveGuardPending: boolean;
  handleLeaveConfirm: () => void;
  handleLeaveCancel: () => void;
}

// UX-4: Navigation guard. BrowserRouter has no useBlocker (data-router only),
// so the guard is implemented manually with three listeners:
//   beforeunload → native dialog on tab close / hard navigation
//   popstate      → back/forward intercept
//   click capture → intercept <Link>/<a> clicks before React Router
// Task #23: also block while there are unsent attached files (inputHasText).
export function useChatNavigationGuard({
  isActiveRef,
  inputHasText,
  clearInput,
  navigate,
}: UseChatNavigationGuardOptions): UseChatNavigationGuardResult {
  const [leaveGuardPending, setLeaveGuardPending] = useState(false);
  const pendingUrlRef = useRef<string | null>(null);
  const inputHasTextRef = useRef(inputHasText);
  useEffect(() => {
    inputHasTextRef.current = inputHasText;
  }, [inputHasText]);

  // 1. Browser-native guard for tab close / external navigation
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isActiveRef.current) return;
      if (inputHasTextRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isActiveRef]);

  // 2. Back/forward button guard
  useEffect(() => {
    const handler = (e: PopStateEvent) => {
      if (!isActiveRef.current) return;
      if (!inputHasTextRef.current) return;
      // Push the current state back so the URL doesn't change
      window.history.pushState(e.state, '', window.location.href);
      pendingUrlRef.current = null; // popstate doesn't expose the target URL
      setLeaveGuardPending(true);
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [isActiveRef]);

  // 3. Click intercept for in-app <Link> / <a> tags (capture phase)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!isActiveRef.current) return;
      if (!inputHasTextRef.current) return;
      const target = (e.target as Element).closest('a[href]');
      if (!target) return;
      const href = (target as HTMLAnchorElement).getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto')) return;
      // Same page — no guard needed
      if (href === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      pendingUrlRef.current = href;
      setLeaveGuardPending(true);
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [isActiveRef]);

  const handleLeaveConfirm = useCallback(() => {
    setLeaveGuardPending(false);
    clearInput();
    if (pendingUrlRef.current) {
      navigate(pendingUrlRef.current);
      pendingUrlRef.current = null;
    }
  }, [clearInput, navigate]);

  const handleLeaveCancel = useCallback(() => {
    setLeaveGuardPending(false);
    pendingUrlRef.current = null;
  }, []);

  return { leaveGuardPending, handleLeaveConfirm, handleLeaveCancel };
}
