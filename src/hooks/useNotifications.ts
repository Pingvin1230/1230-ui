import { useCallback, useEffect, useState } from 'react';

interface UseNotificationsOptions {
  enabled: boolean;
}

export function useNotifications({ enabled }: UseNotificationsOptions) {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return 'unsupported';
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, []);

  const notify = useCallback((title: string, body?: string) => {
    if (!enabled) return;
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;

    new Notification(title, {
      body,
      icon: '/favicon.ico',
      tag: '1230-ui',
    });
  }, [enabled]);

  const setBadge = useCallback((count: number) => {
    if ('setAppBadge' in navigator) {
      if (count > 0) {
        navigator.setAppBadge(count);
      } else {
        navigator.clearAppBadge?.();
      }
    }
  }, []);

  const clearBadge = useCallback(() => {
    if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge?.();
    }
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      const handleVisibility = () => {
        if (document.visibilityState === 'visible') {
          clearBadge();
        }
      };
      document.addEventListener('visibilitychange', handleVisibility);
      return () => document.removeEventListener('visibilitychange', handleVisibility);
    }
  }, [clearBadge]);

  return { permission, requestPermission, notify, setBadge, clearBadge };
}
