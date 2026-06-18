import { useEffect } from 'react';
import { api } from '../lib/api';
import { useOpenCodeStatusStore } from '../store/openCodeStatusStore';

const POLL_INTERVAL_MS = 60_000;
const STALE_AFTER_MS = 5 * 60_000;

async function refreshStatus(force = false): Promise<void> {
  const { lastChecked, isLoading, setData, setLoading } = useOpenCodeStatusStore.getState();
  if (isLoading) return;
  if (!force && lastChecked && Date.now() - lastChecked < STALE_AFTER_MS) return;

  setLoading(true);
  try {
    const data = await api.getAvailableExecutors();
    const isConnected = data.executors.includes('opencode-1230');
    setData({
      status: isConnected ? 'connected' : 'disconnected',
      lastChecked: Date.now(),
    });
  } catch {
    setData({
      status: 'disconnected',
      lastChecked: Date.now(),
    });
  } finally {
    setLoading(false);
  }
}

export function useOpenCodeStatusPoll(): void {
  const status = useOpenCodeStatusStore((s) => s.status);

  useEffect(() => {
    void refreshStatus(true);
    const id = window.setInterval(() => {
      void refreshStatus(false);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (status === 'unknown') {
      void refreshStatus(true);
    }
  }, [status]);
}
