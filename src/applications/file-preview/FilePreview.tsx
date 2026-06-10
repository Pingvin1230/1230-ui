import type { SessionFile } from '../../lib/api';
import { ImageViewer } from './viewers/ImageViewer';
import { MarkdownViewer } from './viewers/MarkdownViewer';
import { CodeViewer } from './viewers/CodeViewer';
import { JSONViewer } from './viewers/JSONViewer';
import { TextViewer } from './viewers/TextViewer';
import { CSVViewer } from './viewers/CSVViewer';
import { HTMLViewer } from './viewers/HTMLViewer';
import { PDFViewer } from './viewers/PDFViewer';
import { UnsupportedViewer } from './viewers/UnsupportedViewer';

interface FilePreviewProps {
  file: SessionFile;
  sessionId: string;
}

const CODE_EXTENSIONS = new Set([
  'py', 'js', 'ts', 'jsx', 'tsx', 'sh', 'sql', 'xml', 'yml', 'yaml', 'css',
]);

function getViewerType(file: SessionFile): string {
  const { mimeType, filename } = file;
  if (!mimeType) return 'unsupported';

  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'text/markdown') return 'markdown';
  if (mimeType === 'application/json') return 'json';
  if (mimeType === 'text/csv' || mimeType === 'application/csv') return 'csv';
  if (mimeType === 'text/html') return 'html';
  if (mimeType === 'application/pdf') return 'pdf';

  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (CODE_EXTENSIONS.has(ext)) return 'code';

  if (mimeType.startsWith('text/') || ext === 'txt' || ext === 'log') {
    return 'text';
  }

  return 'unsupported';
}

export function FilePreview({ file, sessionId }: FilePreviewProps) {
  const viewerType = getViewerType(file);

  switch (viewerType) {
    case 'image':
      return <ImageViewer file={file} sessionId={sessionId} />;
    case 'markdown':
      return <MarkdownViewer file={file} sessionId={sessionId} />;
    case 'json':
      return <JSONViewer file={file} sessionId={sessionId} />;
    case 'csv':
      return <CSVViewer file={file} sessionId={sessionId} />;
    case 'html':
      return <HTMLViewer file={file} sessionId={sessionId} />;
    case 'pdf':
      return <PDFViewer file={file} sessionId={sessionId} />;
    case 'code':
      return <CodeViewer file={file} sessionId={sessionId} />;
    case 'text':
      return <TextViewer file={file} sessionId={sessionId} />;
    default:
      return <UnsupportedViewer file={file} sessionId={sessionId} />;
  }
}
