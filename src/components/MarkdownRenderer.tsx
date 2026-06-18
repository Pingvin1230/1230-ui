import { useRef, useState, useEffect, type HTMLAttributes, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { Check, Copy, ChevronDown, ExternalLink } from 'lucide-react';
import { useThemeStore } from '../store/themeStore';
import darkThemeUrl from 'highlight.js/styles/github-dark.css?url';
import lightThemeUrl from 'highlight.js/styles/github.css?url';

let _rehypeHighlight: typeof import('rehype-highlight')['default'] | null = null;
let _highlightLoading = false;
const _highlightCallbacks: Array<() => void> = [];

let _darkLink: HTMLLinkElement | null = null;
let _lightLink: HTMLLinkElement | null = null;
let _currentIsDark = true;

function ensureLink(id: string, href: string): HTMLLinkElement {
  let link = document.getElementById(id) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'stylesheet';
    link.id = id;
    link.href = href;
    document.head.appendChild(link);
  }
  return link;
}

function applyTheme() {
  if (_darkLink) _darkLink.disabled = !_currentIsDark;
  if (_lightLink) _lightLink.disabled = _currentIsDark;
}

function setHighlightTheme(isDark: boolean) {
  _currentIsDark = isDark;
  applyTheme();
}

function loadHighlight(onReady: () => void) {
  if (_rehypeHighlight) { onReady(); return; }
  _highlightCallbacks.push(onReady);
  if (_highlightLoading) return;
  _highlightLoading = true;
  import('rehype-highlight').then((mod) => {
    _darkLink = ensureLink('hljs-theme-dark', darkThemeUrl);
    _lightLink = ensureLink('hljs-theme-light', lightThemeUrl);
    _rehypeHighlight = mod.default;
    applyTheme();
    _highlightCallbacks.forEach((cb) => cb());
    _highlightCallbacks.length = 0;
  });
}

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

// Extracts a human-readable language label from a highlight.js className
function getLangLabel(className?: string): string | null {
  if (!className) return null;
  const match = className.match(/language-(\w+)/);
  if (!match) return null;
  const lang = match[1].toLowerCase();
  const labels: Record<string, string> = {
    js: 'JavaScript', javascript: 'JavaScript',
    ts: 'TypeScript', typescript: 'TypeScript',
    jsx: 'JSX', tsx: 'TSX',
    py: 'Python', python: 'Python',
    sh: 'Shell', bash: 'Bash', zsh: 'Shell',
    json: 'JSON', yaml: 'YAML', yml: 'YAML',
    html: 'HTML', css: 'CSS', scss: 'SCSS',
    sql: 'SQL', md: 'Markdown', markdown: 'Markdown',
    go: 'Go', rust: 'Rust', java: 'Java',
    cpp: 'C++', c: 'C', cs: 'C#',
    php: 'PHP', ruby: 'Ruby', swift: 'Swift',
    kotlin: 'Kotlin', xml: 'XML', dockerfile: 'Dockerfile',
    toml: 'TOML', ini: 'INI', env: 'ENV',
  };
  return labels[lang] ?? lang.toUpperCase();
}

const MAX_CODE_HEIGHT = 320; // px — beyond this, collapse with "show more"

interface CodeBlockProps extends HTMLAttributes<HTMLPreElement> {
  children?: ReactNode;
  'data-language'?: string;
}

function CodeBlock({ children, 'data-language': dataLang, ...rest }: CodeBlockProps) {
  const { t } = useTranslation();
  const isDarkMode = useThemeStore((s) => s.isDarkMode);
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [isLong, setIsLong] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  // Detect if content exceeds max height after first render
  useEffect(() => {
    if (preRef.current && preRef.current.scrollHeight > MAX_CODE_HEIGHT + 40) {
      setIsLong(true);
    }
  }, [children]);

  const handleCopy = async () => {
    const text = preRef.current?.textContent ?? '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const langLabel = dataLang ? getLangLabel(`language-${dataLang}`) : null;

  const headerBg = isDarkMode ? 'bg-[#1e2736] border-white/10' : 'bg-[#eaeef2] border-black/10';
  const preBg = isDarkMode ? 'bg-[#0d1117]' : 'bg-[#f6f8fa]';
  const fadeFrom = isDarkMode ? 'from-[#0d1117]' : 'from-[#f6f8fa]';
  const toggleBg = isDarkMode
    ? 'text-gray-400 hover:text-white bg-[#0d1117] hover:bg-[#161b22] border-white/10'
    : 'text-gray-500 hover:text-gray-900 bg-[#f6f8fa] hover:bg-[#e1e4e8] border-black/10';
  const copyBtn = isDarkMode
    ? 'text-gray-400 hover:text-white hover:bg-white/10'
    : 'text-gray-500 hover:text-gray-900 hover:bg-black/10';
  const labelColor = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const copiedColor = isDarkMode ? 'text-green-400' : 'text-green-600';
  const copiedIcon = isDarkMode ? 'text-green-400' : 'text-green-600';

  const copiedLabel = t('markdown.copied');
  const copyCodeLabel = t('markdown.copyCode');

  return (
    <div className="group relative mb-4 rounded-lg overflow-hidden border border-border-default">
      {/* Header bar: language label + copy button */}
      <div className={`flex items-center justify-between px-4 py-2 border-b ${headerBg}`}>
        <span className={`text-xs font-mono select-none ${labelColor}`}>
          {langLabel ?? 'code'}
        </span>
        {/* Copy button — always visible on touch, hover-only on desktop */}
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? copiedLabel : copyCodeLabel}
          title={copied ? copiedLabel : copyCodeLabel}
          className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors md:opacity-0 md:group-hover:opacity-100 opacity-100 ${copyBtn}`}
        >
          {copied
            ? <><Check className={`w-3.5 h-3.5 ${copiedIcon}`} /><span className={copiedColor}>{copiedLabel}</span></>
            : <><Copy className="w-3.5 h-3.5" /><span>{t('markdown.copy')}</span></>
          }
        </button>
      </div>

      {/* Code content — collapsible when long */}
      <div
        className="relative"
        style={isLong && collapsed ? { maxHeight: MAX_CODE_HEIGHT, overflow: 'hidden' } : undefined}
      >
        <pre
          ref={preRef}
          className={`overflow-x-auto p-4 text-sm leading-relaxed ${preBg}`}
          {...rest}
        >
          {children}
        </pre>

        {/* Fade gradient at bottom when collapsed */}
        {isLong && collapsed && (
          <div className={`absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t to-transparent pointer-events-none ${fadeFrom}`} />
        )}
      </div>

      {/* Expand/collapse toggle */}
      {isLong && (
        <button
          type="button"
          onClick={() => setCollapsed(v => !v)}
          className={`w-full flex items-center justify-center gap-1.5 py-2 text-xs border-t transition-colors ${toggleBg}`}
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${collapsed ? '' : 'rotate-180'}`} />
          {collapsed ? t('markdown.showMore') : t('markdown.showLess')}
        </button>
      )}
    </div>
  );
}

/**
 * Converts bare URLs/domains written without a protocol into proper markdown
 * links so ReactMarkdown / remark-gfm can pick them up.
 *
 * Handles patterns like:
 *   drive2.ru/l/702101397327315764
 *   t.me/jaecoo_j7_club
 *   aliexpress.com/s/wiki-ssr/article/jaecoo-subwoofer
 *
 * Skips content inside backtick code spans and fenced code blocks,
 * and skips URLs that already have a protocol.
 */
function preprocessLinks(text: string): string {
  // Known TLDs — broad enough to cover real domains, narrow enough to avoid false positives
  const TLD = '(?:com|ru|org|net|io|me|ai|dev|app|co|uk|de|fr|eu|nl|au|ca|jp|cn|info|biz|tv|club|store|shop|online|site|tech|pro|by|ua|kz|am|ge|ee|lt|lv|az|uz|kg|tj|tm|md|wiki|gov|edu|mil|int|museum|travel|jobs|mobi|tel|coop|aero|post|xxx|name|cat)';
  // Regex: word chars / hyphens followed by .TLD, optionally with path/query
  // Negative lookbehind: not already preceded by http(s):// or [
  // Not inside backtick spans (handled by splitting on code blocks)
  const bareUrlRe = new RegExp(
    `(?<![/"'(\\[])\\b([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+${TLD}\\b(/[^\\s)\\]"'<>]*)?`,
    'g'
  );

  // Split on fenced code blocks and inline code to avoid mangling code
  const parts = text.split(/(```[\s\S]*?```|`[^`\n]+`)/g);
  return parts.map((part, i) => {
    // Odd indices are code blocks — leave untouched
    if (i % 2 === 1) return part;
    return part.replace(bareUrlRe, (match, _g1, _g2, offset, str) => {
      // Skip if already preceded by :// (already has a protocol)
      const before = str.slice(Math.max(0, offset - 8), offset);
      if (before.includes('://')) return match;
      return `https://${match}`;
    });
  }).join('');
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className = '',
}) => {
  const [highlightReady, setHighlightReady] = useState(!!_rehypeHighlight);
  const isDarkMode = useThemeStore((s) => s.isDarkMode);

  useEffect(() => {
    setHighlightTheme(isDarkMode);
  }, [isDarkMode]);

  useEffect(() => {
    if (_rehypeHighlight) return;
    loadHighlight(() => setHighlightReady(true));
  }, []);

  const rehypePlugins: import('unified').Pluggable[] = highlightReady && _rehypeHighlight
    ? [[_rehypeHighlight, { detect: true, ignoreMissing: true }]]
    : [];

  // Pre-process: upgrade bare domain URLs to https:// so remark-gfm autolinks them
  const processedContent = preprocessLinks(content);

  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={rehypePlugins}
        components={{
          h1: ({ ...props }) => (
            <h1 className="text-2xl font-bold mt-6 first:mt-0 mb-3 text-fg-primary border-b border-border-default pb-2" {...props} />
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
            <p className="mb-3 last:mb-0 leading-relaxed text-fg-secondary" {...props} />
          ),
          ul: ({ ...props }) => (
            <ul className="mb-3 list-disc ml-5 space-y-1 text-fg-secondary" {...props} />
          ),
          ol: ({ ...props }) => (
            <ol className="mb-3 list-decimal ml-5 space-y-1 text-fg-secondary" {...props} />
          ),
          li: ({ ...props }) => (
            <li className="text-fg-secondary leading-relaxed" {...props} />
          ),
          // Links — open in new tab, show external icon
          a: ({ href, children, ...props }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
              {...props}
            >
              {children}
              <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-60" />
            </a>
          ),
          // Inline code
          code: ({ className: cls, children, ...props }) => {
            const isBlock = cls && cls.startsWith('language-');
            if (isBlock) {
              return (
                <code className={`${cls} hljs`} {...props}>
                  {children}
                </code>
              );
            }
            const node = (props as { node?: { parent?: { tagName?: string } } }).node;
            if (node?.parent?.tagName === 'pre') {
              return <code className="hljs" {...props}>{children}</code>;
            }
            return (
              <code
                className="py-0.5 px-1.5 bg-bg-muted rounded text-sm font-mono text-fg-primary border border-border-default"
                {...props}
              >
                {children}
              </code>
            );
          },
          // Code block wrapper — pass language label down
          pre: ({ children, ...props }) => {
            // Extract language from the child <code> className
            const codeChild = children as React.ReactElement<{ className?: string }> | null;
            const codeCls = codeChild?.props?.className ?? '';
            const langMatch = codeCls.match(/language-(\w+)/);
            return (
              <CodeBlock data-language={langMatch?.[1]} {...props}>
                {children}
              </CodeBlock>
            );
          },
          blockquote: ({ ...props }) => (
            <blockquote
              className="mb-4 pl-4 border-l-4 border-accent/50 bg-accent-soft/30 rounded-r-md py-2 italic text-fg-secondary"
              {...props}
            />
          ),
          table: ({ ...props }) => (
            <div className="mb-4 overflow-x-auto rounded-lg border border-border-default">
              <table className="w-full border-collapse text-sm" {...props} />
            </div>
          ),
          thead: ({ ...props }) => (
            <thead className="bg-bg-secondary" {...props} />
          ),
          th: ({ ...props }) => (
            <th className="px-4 py-2.5 text-left font-semibold text-fg-primary border-b border-border-default" {...props} />
          ),
          td: ({ ...props }) => (
            <td className="px-4 py-2.5 text-fg-secondary border-b border-border-default last:border-b-0" {...props} />
          ),
          tr: ({ ...props }) => (
            <tr className="hover:bg-bg-secondary/50 transition-colors" {...props} />
          ),
          hr: ({ ...props }) => (
            <hr className="my-6 border-border-default" {...props} />
          ),
          strong: ({ ...props }) => (
            <strong className="font-semibold text-fg-primary" {...props} />
          ),
          em: ({ ...props }) => (
            <em className="italic text-fg-secondary" {...props} />
          ),
          // Images — responsive, rounded, with alt text fallback
          img: ({ src, alt, ...props }) => (
            <span className="block my-3">
              <img
                src={src}
                alt={alt ?? ''}
                loading="lazy"
                className="max-w-full rounded-lg border border-border-default shadow-sm"
                {...props}
              />
              {alt && (
                <span className="block mt-1 text-xs text-fg-muted text-center italic">{alt}</span>
              )}
            </span>
          ),
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
