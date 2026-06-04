export function formatTimeAgo(timestampSeconds: number): string {
  const now = Date.now();
  const diffMs = now - timestampSeconds * 1000;
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(timestampSeconds * 1000).toLocaleDateString();
}

export function formatFullDateTime(timestampSeconds: number): string {
  return new Date(timestampSeconds * 1000).toLocaleString();
}
