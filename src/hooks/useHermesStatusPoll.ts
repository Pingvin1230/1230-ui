import { useEffect } from 'react';
import { api } from '../lib/api';
import { useHermesStatusStore } from '../store/hermesStatusStore';

const POLL_INTERVAL_MS = 60_000;
const STALE_AFTER_MS = 5 * 60_000;

async function refreshStatus(force = false): Promise<void> {
  const { lastChecked, isLoading, setData, setLoading } = useHermesStatusStore.getState();
  if (isLoading) return;
  if (!force && lastChecked && Date.now() - lastChecked < STALE_AFTER_MS) return;

  setLoading(true);
  try {
    const data = await api.getSystemStatus();
    setData({
      status: data.hermes.status === 'connected' ? 'connected' : 'disconnected',
      version: data.hermes.version ?? null,
      latestVersion: data.hermes.latestVersion ?? null,
      updateAvailable: data.hermes.updateAvailable ?? null,
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

export function useHermesStatusPoll(): void {
  const status = useHermesStatusStore((s) => s.status);

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
