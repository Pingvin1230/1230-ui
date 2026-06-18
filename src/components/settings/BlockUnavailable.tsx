interface BlockUnavailableProps {
  message: string;
}

export function BlockUnavailable({ message }: BlockUnavailableProps) {
  return <p className="text-sm text-fg-muted py-2">{message}</p>;
}
