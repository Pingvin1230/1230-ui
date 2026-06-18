import { useCallback, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';

interface UseChatScrollOptions {
  clearBadge: () => void;
}

export interface UseChatScrollResult {
  isAtBottom: boolean;
  isAtBottomRef: RefObject<boolean>;
  unreadCount: number;
  setUnreadCount: Dispatch<SetStateAction<number>>;
  onAtBottomChange: (atBottom: boolean) => void;
}

// Owns the at-bottom tracking and the unread-counter reset for the chat
// scroller. The actual auto-scroll-on-stream growth is driven by MessageList
// (it holds the Virtuoso scroller); this hook only owns the shared state/refs
// that both MessageList (atBottomStateChange) and the scroll-to-bottom button
// read. The unread bump on new committed messages lives in useChatSession,
// which owns `messages`.
export function useChatScroll({ clearBadge }: UseChatScrollOptions): UseChatScrollResult {
  const isAtBottomRef = useRef(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const onAtBottomChange = useCallback(
    (atBottom: boolean) => {
      isAtBottomRef.current = atBottom;
      setIsAtBottom(atBottom);
      if (atBottom) {
        setUnreadCount(0);
        clearBadge();
      }
    },
    [clearBadge],
  );

  return { isAtBottom, isAtBottomRef, unreadCount, setUnreadCount, onAtBottomChange };
}
