import { api } from '../../../lib/api';
import type { SessionFile } from '../../../lib/api';

interface ViewerProps {
  file: SessionFile;
  sessionId: string;
}

export function HTMLViewer({ file, sessionId }: ViewerProps) {
  return (
    <iframe
      src={api.getFileContentUrl(sessionId, file.id)}
      sandbox="allow-scripts"
      className="w-full h-full border-0"
      title={file.filename}
    />
  );
}
