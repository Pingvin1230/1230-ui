import { Loader2 } from 'lucide-react';
import { EXECUTOR_LABEL, type ExecutorSlug } from '../store/workspaceStore';
import { useHermesStatusStore } from '../store/hermesStatusStore';
import { useOpenCodeStatusStore } from '../store/openCodeStatusStore';

export function ExecutorStatusDot({ executor }: { executor: ExecutorSlug }) {
  const hermesStatus = useHermesStatusStore((s) => s.status);
  const hermesLoading = useHermesStatusStore((s) => s.isLoading);
  const ocStatus = useOpenCodeStatusStore((s) => s.status);
  const ocLoading = useOpenCodeStatusStore((s) => s.isLoading);
  const status = executor === 'hermes' ? hermesStatus : ocStatus;
  const loading = executor === 'hermes' ? hermesLoading : ocLoading;

  if (loading && status === 'unknown') {
    return (
      <span title="…" aria-hidden="true">
        <Loader2 className="w-3 h-3 text-fg-muted animate-spin" />
      </span>
    );
  }
  const color =
    status === 'connected'
      ? 'bg-green-500'
      : status === 'disconnected'
        ? 'bg-red-500'
        : 'bg-gray-400';
  const label =
    status === 'connected'
      ? 'Connected'
      : status === 'disconnected'
        ? 'Disconnected'
        : 'Unknown';
  return (
    <span
      className={`w-2 h-2 rounded-full ${color}`}
      title={`${EXECUTOR_LABEL[executor]}: ${label}`}
      aria-label={`${EXECUTOR_LABEL[executor]}: ${label}`}
    />
  );
}
