import { useEffect, useRef, useState, type RefObject } from 'react';

interface UseSwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onLongPress?: () => void;
  threshold?: number;
  maxTranslate?: number;
  longPressMs?: number;
  disabled?: boolean;
}

export interface UseSwipeReturn<T extends HTMLElement> {
  ref: RefObject<T | null>;
  translateX: number;
  swiping: boolean;
  reset: () => void;
}

export function useSwipe<T extends HTMLElement = HTMLDivElement>({
  onSwipeLeft,
  onSwipeRight,
  onLongPress,
  threshold = 80,
  maxTranslate = 160,
  longPressMs = 500,
  disabled = false,
}: UseSwipeOptions = {}): UseSwipeReturn<T> {
  const ref = useRef<T | null>(null);
  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const horizontalRef = useRef<boolean | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);
  const [translateX, setTranslateX] = useState(0);
  const [swiping, setSwiping] = useState(false);

  const cbLeftRef = useRef(onSwipeLeft);
  const cbRightRef = useRef(onSwipeRight);
  const cbLongPressRef = useRef(onLongPress);
  const disabledRef = useRef(disabled);
  const thresholdRef = useRef(threshold);
  const maxRef = useRef(maxTranslate);
  const longPressMsRef = useRef(longPressMs);

  useEffect(() => { cbLeftRef.current = onSwipeLeft; }, [onSwipeLeft]);
  useEffect(() => { cbRightRef.current = onSwipeRight; }, [onSwipeRight]);
  useEffect(() => { cbLongPressRef.current = onLongPress; }, [onLongPress]);
  useEffect(() => { disabledRef.current = disabled; }, [disabled]);
  useEffect(() => { thresholdRef.current = threshold; }, [threshold]);
  useEffect(() => { maxRef.current = maxTranslate; }, [maxTranslate]);
  useEffect(() => { longPressMsRef.current = longPressMs; }, [longPressMs]);

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const reset = () => {
    clearLongPress();
    startXRef.current = null;
    startYRef.current = null;
    horizontalRef.current = null;
    longPressFiredRef.current = false;
    setTranslateX(0);
    setSwiping(false);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (disabledRef.current) return;
      if (e.touches.length !== 1) return;
      const target = e.target as HTMLElement | null;
      if (target && target.closest('[data-swipe-ignore]')) return;
      const t = e.touches[0];
      startXRef.current = t.clientX;
      startYRef.current = t.clientY;
      horizontalRef.current = null;
      longPressFiredRef.current = false;
      clearLongPress();
      if (cbLongPressRef.current) {
        longPressTimerRef.current = window.setTimeout(() => {
          if (startXRef.current === null) return;
          if (horizontalRef.current) return;
          longPressFiredRef.current = true;
          cbLongPressRef.current?.();
        }, longPressMsRef.current);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startXRef.current === null || startYRef.current === null) return;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - startXRef.current;
      const dy = t.clientY - startYRef.current;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) clearLongPress();
      if (horizontalRef.current === null) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        horizontalRef.current = Math.abs(dx) > Math.abs(dy);
      }
      if (!horizontalRef.current) return;
      const clamped = Math.max(-maxRef.current, Math.min(0, dx));
      setTranslateX(clamped);
      setSwiping(true);
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (startXRef.current === null) {
        clearLongPress();
        return;
      }
      if (longPressFiredRef.current) {
        reset();
        return;
      }
      const t = e.changedTouches[0];
      const dx = t.clientX - startXRef.current;
      if (horizontalRef.current && Math.abs(dx) >= thresholdRef.current) {
        if (dx < 0) cbLeftRef.current?.();
        else cbRightRef.current?.();
      }
      reset();
    };

    const onTouchCancel = () => {
      reset();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchCancel);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchCancel);
      clearLongPress();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- listeners are attached once on mount; reset/clearLongPress are stable refs to current state, not needed as deps
  }, []);

  return { ref, translateX, swiping, reset };
}

