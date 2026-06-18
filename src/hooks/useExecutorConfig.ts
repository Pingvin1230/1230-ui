import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

export type ExecutorSlug = 'hermes-agent' | 'opencode-1230';

export type HermesConfigState = {
  slug: 'hermes-agent';
  pythonPath: string;
  apiUrl: string;
  apiKey: string;
  hasApiKey: boolean;
};

export type OpenCodeConfigState = {
  slug: 'opencode-1230';
  url: string;
  username: string;
  password: string;
  hasPassword: boolean;
};

export type ExecutorConfigState = HermesConfigState | OpenCodeConfigState;

type TestResult = 'connected' | 'unreachable' | null;
type SaveStatus = 'idle' | 'saved' | 'error';

const HERMES_DEFAULTS: HermesConfigState = {
  slug: 'hermes-agent',
  pythonPath: '',
  apiUrl: '',
  apiKey: '',
  hasApiKey: false,
};

const OPENCODE_DEFAULTS: OpenCodeConfigState = {
  slug: 'opencode-1230',
  url: '',
  username: '',
  password: '',
  hasPassword: false,
};

export function useExecutorConfig<S extends ExecutorSlug>(slug: S) {
  const [config, setConfig] = useState<
    S extends 'hermes-agent' ? HermesConfigState : OpenCodeConfigState
  >(() => (slug === 'hermes-agent' ? HERMES_DEFAULTS : OPENCODE_DEFAULTS) as never);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [testResult, setTestResult] = useState<TestResult>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getExecutorConfig(slug)
      .then((cfg) => {
        if (cancelled) return;
        if (cfg.slug === 'hermes-agent') {
          setConfig({
            slug: 'hermes-agent',
            pythonPath: cfg.pythonPath,
            apiUrl: cfg.apiUrl,
            apiKey: '',
            hasApiKey: cfg.hasApiKey,
          } as never);
        } else {
          setConfig({
            slug: 'opencode-1230',
            url: cfg.url,
            username: cfg.username,
            password: '',
            hasPassword: cfg.hasPassword,
          } as never);
        }
      })
      .catch(() => {
        // ignore — fields stay empty
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const updateField = useCallback(
    (field: 'pythonPath' | 'apiUrl' | 'apiKey' | 'url' | 'username' | 'password', value: string) => {
      setConfig((prev) => ({ ...prev, [field]: value }) as never);
    },
    []
  );

  const test = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      if (slug === 'opencode-1230') {
        const data = await api.getAvailableExecutors();
        setTestResult(data.executors.includes('opencode-1230') ? 'connected' : 'unreachable');
      } else {
        const data = await api.healthCheck();
        setTestResult(data.hermesApi === 'ok' ? 'connected' : 'unreachable');
      }
    } catch {
      setTestResult('unreachable');
    } finally {
      setTesting(false);
    }
  }, [slug]);

  const save = useCallback(async () => {
    setSaving(true);
    setSaveStatus('idle');
    try {
      if (config.slug === 'hermes-agent') {
        await api.saveExecutorConfig('hermes-agent', {
          pythonPath: config.pythonPath,
          apiUrl: config.apiUrl,
          apiKey: config.apiKey,
        });
        setConfig((prev) =>
          prev.slug === 'hermes-agent'
            ? { ...prev, hasApiKey: prev.hasApiKey || prev.apiKey.length > 0, apiKey: '' }
            : prev
        );
      } else {
        await api.saveExecutorConfig('opencode-1230', {
          url: config.url,
          username: config.username,
          password: config.password,
        });
        setConfig((prev) =>
          prev.slug === 'opencode-1230'
            ? { ...prev, hasPassword: prev.hasPassword || prev.password.length > 0, password: '' }
            : prev
        );
      }
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 4000);
    } finally {
      setSaving(false);
    }
  }, [config]);

  const formComplete =
    config.slug === 'hermes-agent'
      ? config.pythonPath.trim().length > 0 && config.apiUrl.trim().length > 0
      : config.url.trim().length > 0;

  return {
    config,
    updateField,
    test,
    save,
    testing,
    saving,
    testResult,
    saveStatus,
    formComplete,
  };
}
