import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Loader2, Copy, Check, ChevronDown } from 'lucide-react';
import { api } from '../../../lib/api';
import type { SessionFile } from '../../../lib/api';

interface ViewerProps {
  file: SessionFile;
  sessionId: string;
}

const LANG_MAP: Record<string, string> = {
  py: 'python',
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  sh: 'bash',
  sql: 'sql',
  xml: 'xml',
  yml: 'yaml',
  yaml: 'yaml',
  css: 'css',
};

const MAX_CODE_HEIGHT = 320;

export function CodeViewer({ file, sessionId }: ViewerProps) {
  const { t } = useTranslation();
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [isLong, setIsLong] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  const ext = file.filename.split('.').pop()?.toLowerCase() ?? '';
  const lang = LANG_MAP[ext] || 'plaintext';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.getFileContent(sessionId, file.id)
      .then((text) => {
        if (!cancelled) setContent(text);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [sessionId, file.id]);

  useEffect(() => {
    if (preRef.current && preRef.current.scrollHeight > MAX_CODE_HEIGHT + 40) {
      setIsLong(true);
    }
  }, [content]);

  const handleCopy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-32">
        <AlertCircle className="w-6 h-6 text-red-500 mb-2" />
        <p className="text-xs text-fg-muted">{t('filePreview.error')}</p>
      </div>
    );
  }

  return (
    <div className="group relative rounded-lg overflow-hidden border border-border-default">
      <div className="flex items-center justify-between px-4 py-2 bg-[#1e2736] border-b border-white/10">
        <span className="text-xs font-mono text-gray-400 select-none">{lang}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-white/10 transition-colors md:opacity-0 md:group-hover:opacity-100 opacity-100"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-green-400" />
              <span className="text-green-400">{t('chat.fileCopied') || 'Copied'}</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>{t('chat.copyMessage') || 'Copy'}</span>
            </>
          )}
        </button>
      </div>
      <div
        className="relative"
        style={isLong && collapsed ? { maxHeight: MAX_CODE_HEIGHT, overflow: 'hidden' } : undefined}
      >
        <pre
          ref={preRef}
          className="overflow-x-auto bg-[#0d1117] p-4 text-sm leading-relaxed"
        >
          <code className={`language-${lang} hljs`}>{content}</code>
        </pre>
        {isLong && collapsed && (
          <div className="absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-[#0d1117] to-transparent pointer-events-none" />
        )}
      </div>
      {isLong && (
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-gray-400 hover:text-white bg-[#0d1117] hover:bg-[#161b22] border-t border-white/10 transition-colors"
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${collapsed ? '' : 'rotate-180'}`} />
          {collapsed ? 'Показать полностью' : 'Свернуть'}
        </button>
      )}
    </div>
  );
}
