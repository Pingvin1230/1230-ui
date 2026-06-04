import { useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Check, Copy } from 'lucide-react';

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
        className="rounded-lg overflow-x-auto bg-gray-50 dark:bg-gray-900 p-4 pr-12"
        {...rest}
      >
        {children}
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? 'Code copied' : 'Copy code'}
        className="absolute top-2 right-2 p-1.5 rounded bg-white/90 dark:bg-gray-800/90 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:bg-white dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
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
  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          h1: ({ ...props }) => (
            <h1 className="text-2xl font-bold mt-6 first:mt-0 mb-3 text-gray-900 dark:text-gray-100" {...props} />
          ),
          h2: ({ ...props }) => (
            <h2 className="text-xl font-semibold mt-5 first:mt-0 mb-2 text-gray-900 dark:text-gray-100" {...props} />
          ),
          h3: ({ ...props }) => (
            <h3 className="text-lg font-medium mt-4 first:mt-0 mb-2 text-gray-900 dark:text-gray-100" {...props} />
          ),
          h4: ({ ...props }) => (
            <h4 className="text-base font-medium mt-3 first:mt-0 mb-2 text-gray-900 dark:text-gray-100" {...props} />
          ),
          p: ({ ...props }) => (
            <p className="mb-3 leading-relaxed text-gray-700 dark:text-gray-300" {...props} />
          ),
          ul: ({ ...props }) => (
            <ul className="mb-3 list-disc ml-4 pl-5 space-y-1 text-gray-700 dark:text-gray-300" {...props} />
          ),
          ol: ({ ...props }) => (
            <ol className="mb-3 list-decimal ml-4 pl-5 space-y-1 text-gray-700 dark:text-gray-300" {...props} />
          ),
          li: ({ ...props }) => (
            <li className="text-gray-700 dark:text-gray-300" {...props} />
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
                  className="py-0.5 px-1 bg-gray-100 dark:bg-gray-800 rounded text-sm font-mono text-gray-900 dark:text-gray-100"
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
              className="mb-4 pl-4 border-l-4 border-gray-300 dark:border-gray-600 italic text-gray-600 dark:text-gray-400"
              {...props}
            />
          ),
          table: ({ ...props }) => (
            <div className="markdown-table-wrapper mb-4 overflow-x-auto">
              <table className="markdown-table w-full border-collapse" {...props} />
            </div>
          ),
          thead: ({ ...props }) => (
            <thead className="bg-gray-100 dark:bg-gray-800" {...props} />
          ),
          th: ({ ...props }) => (
            <th className="px-3 py-2 text-left font-semibold text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600" {...props} />
          ),
          td: ({ ...props }) => (
            <td className="px-3 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600" {...props} />
          ),
          hr: ({ ...props }) => (
            <hr className="my-6 border-gray-300 dark:border-gray-600" {...props} />
          ),
          strong: ({ ...props }) => (
            <strong className="font-semibold text-gray-900 dark:text-gray-100" {...props} />
          ),
          em: ({ ...props }) => (
            <em className="italic text-gray-700 dark:text-gray-300" {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
