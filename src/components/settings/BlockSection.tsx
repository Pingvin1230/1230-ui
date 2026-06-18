import { BlockUnavailable } from './BlockUnavailable';

interface BlockSectionProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
  unavailable?: string;
}

export function BlockSection({ title, description, children, unavailable }: BlockSectionProps) {
  return (
    <div className="bg-bg-primary border border-border-default rounded-lg p-4">
      <h3 className="text-sm font-medium text-fg-primary">{title}</h3>
      {description && <p className="text-xs text-fg-muted mt-0.5">{description}</p>}
      <div className={description ? 'mt-3' : 'mt-3'}>
        {unavailable ? <BlockUnavailable message={unavailable} /> : children}
      </div>
    </div>
  );
}
