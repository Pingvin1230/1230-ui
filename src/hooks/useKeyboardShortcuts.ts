import { useEffect, useRef, useCallback } from 'react';

interface Shortcut {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  preventDefault?: boolean;
  action: () => void;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  const shortcutsRef = useRef(shortcuts);

  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    for (const shortcut of shortcutsRef.current) {
      const ctrlOrMeta = shortcut.ctrlKey || shortcut.metaKey;
      const matchKey = e.key.toLowerCase() === shortcut.key.toLowerCase();
      const matchCtrl = ctrlOrMeta ? (e.ctrlKey || e.metaKey) : !(e.ctrlKey || e.metaKey);
      const matchShift = shortcut.shiftKey ? e.shiftKey : !e.shiftKey;

      if (matchKey && matchCtrl && matchShift) {
        if (shortcut.preventDefault !== false) {
          e.preventDefault();
        }
        shortcut.action();
        break;
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
