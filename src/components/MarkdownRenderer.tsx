import { useRef, useState, useEffect, type HTMLAttributes, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';

// UX-13: Load rehype-highlight + the 37-language "common" lowlight bundle
// lazily so they are excluded from the initial ChatPage chunk. The CSS theme
// is also loaded dynamically here (once) instead of via a static import in
// ChatPage.tsx, which keeps it out of the main bundle entirely.
//
// We use a module-level flag so the dynamic import runs only once across all
// MarkdownRenderer instances in the same page lifetime.
let _rehypeHighlight: typeof import('rehype-highlight')['default'] | null = null;
let _highlightLoading = false;
const _highlightCallbacks: Array<() => void> = [];

function loadHighlight(onReady: () => void) {
  if (_rehypeHighlight) { onReady(); return; }
  _highlightCallbacks.push(onReady);
  if (_highlightLoading) return;
  _highlightLoading = true;
  Promise.all([
    import('rehype-highlight'),
    import('highlight.js/styles/github-dark.css'),
  ]).then(([mod]) => {
    _rehypeHighlight = mod.default;
    _highlightCallbacks.forEach((cb) => cb());
    _highlightCallbacks.length = 0;
  });
}

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

function CodeBlock({ children, ...rest }: HTMLAttributes<HTMLPreElement> & { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  const handleCopy = async () => {
    const text = preRef.current?.textContent ?? '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 200);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  return (
    <div className="group relative mb-4">
      <pre
        ref={preRef}
        className="rounded-lg overflow-x-auto bg-bg-secondary p-4 pr-12"
        {...rest}
      >
        {children}
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? 'Code copied' : 'Copy code'}
        className="absolute top-2 right-2 p-1.5 rounded bg-white/90 dark:bg-gray-800/90 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:bg-bg-secondary text-fg-secondary border-border-default"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className = '',
}) => {
  // UX-13: Re-render once highlight module is loaded.
  const [highlightReady, setHighlightReady] = useState(!!_rehypeHighlight);

  useEffect(() => {
    if (_rehypeHighlight) return;
    loadHighlight(() => setHighlightReady(true));
  }, []);

  const rehypePlugins: import('unified').Pluggable[] = highlightReady && _rehypeHighlight
    ? [[_rehypeHighlight, { detect: true, ignoreMissing: true }]]
    : [];

  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={rehypePlugins}
        components={{
          h1: ({ ...props }) => (
            <h1 className="text-2xl font-bold mt-6 first:mt-0 mb-3 text-fg-primary" {...props} />
          ),
          h2: ({ ...props }) => (
            <h2 className="text-xl font-semibold mt-5 first:mt-0 mb-2 text-fg-primary" {...props} />
          ),
          h3: ({ ...props }) => (
            <h3 className="text-lg font-medium mt-4 first:mt-0 mb-2 text-fg-primary" {...props} />
          ),
          h4: ({ ...props }) => (
            <h4 className="text-base font-medium mt-3 first:mt-0 mb-2 text-fg-primary" {...props} />
          ),
          p: ({ ...props }) => (
            <p className="mb-3 leading-relaxed text-fg-secondary" {...props} />
          ),
          ul: ({ ...props }) => (
            <ul className="mb-3 list-disc ml-4 pl-5 space-y-1 text-fg-secondary" {...props} />
          ),
          ol: ({ ...props }) => (
            <ol className="mb-3 list-decimal ml-4 pl-5 space-y-1 text-fg-secondary" {...props} />
          ),
          li: ({ ...props }) => (
            <li className="text-fg-secondary" {...props} />
          ),
          a: ({ ...props }) => (
            <a className="text-blue-600 dark:text-blue-400 hover:underline" {...props} />
          ),
          code: ({ className, children, ...props }) => {
            const isCodeBlock = className && className.startsWith('language-');

            if (isCodeBlock) {
              return (
                <code className={`${className} hljs`} {...props}>
                  {children}
                </code>
              );
            } else {
              const node = (props as { node?: { parent?: { tagName?: string } } }).node;
              const parentIsPre = node?.parent?.tagName === 'pre';
              if (parentIsPre) {
                return (
                  <code className="hljs" {...props}>
                    {children}
                  </code>
                );
              }
              return (
                <code
                  className="py-0.5 px-1 bg-bg-secondary rounded text-sm font-mono text-fg-primary"
                  {...props}
                >
                  {children}
                </code>
              );
            }
          },
          pre: ({ children, ...props }) => <CodeBlock {...props}>{children}</CodeBlock>,
          blockquote: ({ ...props }) => (
            <blockquote
              className="mb-4 pl-4 border-l-4 border-border-strong italic text-fg-secondary"
              {...props}
            />
          ),
          table: ({ ...props }) => (
            <div className="markdown-table-wrapper mb-4 overflow-x-auto">
              <table className="markdown-table w-full border-collapse" {...props} />
            </div>
          ),
          thead: ({ ...props }) => (
            <thead className="bg-bg-secondary" {...props} />
          ),
          th: ({ ...props }) => (
            <th className="px-3 py-2 text-left font-semibold text-fg-primary border border-border-strong" {...props} />
          ),
          td: ({ ...props }) => (
            <td className="px-3 py-2 text-fg-secondary border border-border-strong" {...props} />
          ),
          hr: ({ ...props }) => (
            <hr className="my-6 border-border-strong" {...props} />
          ),
          strong: ({ ...props }) => (
            <strong className="font-semibold text-fg-primary" {...props} />
          ),
          em: ({ ...props }) => (
            <em className="italic text-fg-secondary" {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
