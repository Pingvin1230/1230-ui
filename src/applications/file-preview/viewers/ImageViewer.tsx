import { useState } from 'react';
import { api } from '../../../lib/api';
import type { SessionFile } from '../../../lib/api';
import { UnsupportedViewer } from './UnsupportedViewer';

interface ViewerProps {
  file: SessionFile;
  sessionId: string;
}

export function ImageViewer({ file, sessionId }: ViewerProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  if (error) {
    return <UnsupportedViewer file={file} sessionId={sessionId} />;
  }

  return (
    <div className="flex items-center justify-center h-full p-4">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-secondary">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <img
        src={api.getFileContentUrl(sessionId, file.id)}
        alt={file.filename}
        className={`max-w-full max-h-full object-contain rounded-lg transition-opacity ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
    </div>
  );
}
