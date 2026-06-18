import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

export const LIKE_STORAGE_KEY = 'hermes-1230-last-like';
export const LIKE_COOLDOWN_SEC = 3600;

export type LikeState = 'idle' | 'sending' | 'sent' | 'cooldown';

/** Human-friendly cooldown countdown (e.g. `59m 30s`, `1h 5m`). */
export function formatCooldown(sec: number): string {
  if (sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
}

function readLastLikeMs(): number {
  try {
    const raw = localStorage.getItem(LIKE_STORAGE_KEY);
    const last = raw ? Number(raw) : 0;
    return Number.isFinite(last) ? last : 0;
  } catch {
    return 0;
  }
}

function isWithinCooldown(): boolean {
  const last = readLastLikeMs();
  if (!last) return false;
  return last + LIKE_COOLDOWN_SEC * 1000 > Date.now();
}

function initialRemaining(): number {
  const last = readLastLikeMs();
  if (!last) return 0;
  const remainingMs = last + LIKE_COOLDOWN_SEC * 1000 - Date.now();
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

export interface UseLikeResult {
  likeState: LikeState;
  cooldownRemaining: number;
  likeError: string | null;
  handleLike: () => Promise<void>;
}

export interface UseLikeOptions {
  /**
   * When true, runs a per-second countdown that flips `cooldown` back to
   * `idle` once the cooldown elapses. Enable only on pages that actually
   * render the countdown (e.g. SettingsPage) — avoid on always-mounted
   * components like the Navbar to prevent needless re-renders.
   */
  countdown?: boolean;
}

/**
 * Shared "send a like" logic: cooldown gating, localStorage persistence, the
 * `api.sendLike()` call, and (optionally) a live countdown. Unifies the two
 * previously-duplicated copies in `Navbar` and `SettingsPage`.
 *
 * @param fallbackErrorMessage Shown via `likeError` when the request fails
 *   for a non-cooldown reason.
 */
export function useLike(fallbackErrorMessage: string, options?: UseLikeOptions): UseLikeResult {
  const countdown = options?.countdown ?? false;

  const [likeState, setLikeState] = useState<LikeState>(() =>
    isWithinCooldown() ? 'cooldown' : 'idle',
  );
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(() => initialRemaining());
  const [likeError, setLikeError] = useState<string | null>(null);

  useEffect(() => {
    if (!countdown || likeState !== 'cooldown') return;
    const timer = window.setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          setLikeState('idle');
          setLikeError(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [countdown, likeState]);

  const handleLike = useCallback(async () => {
    // Match Navbar's primary usage: only act from `idle`.
    if (likeState !== 'idle') return;
    setLikeState('sending');
    setLikeError(null);
    try {
      const result = await api.sendLike();
      try {
        localStorage.setItem(LIKE_STORAGE_KEY, String(result.sent_at));
      } catch {
        // ignore storage failures
      }
      setLikeState('sent');
    } catch (err) {
      const e = err as { type?: string; retry_after?: number; message?: string };
      if (e.type === 'cooldown') {
        const retryAfter = typeof e.retry_after === 'number' ? e.retry_after : 0;
        const sentAt = Date.now() - (LIKE_COOLDOWN_SEC - retryAfter) * 1000;
        try {
          localStorage.setItem(LIKE_STORAGE_KEY, String(sentAt));
        } catch {
          // ignore storage failures
        }
        setCooldownRemaining(retryAfter);
        setLikeState('cooldown');
        return;
      }
      setLikeState('idle');
      setLikeError(e.message || fallbackErrorMessage);
    }
  }, [likeState, fallbackErrorMessage]);

  return { likeState, cooldownRemaining, likeError, handleLike };
}
