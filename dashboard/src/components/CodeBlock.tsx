import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import { oneLight } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import { useTheme } from '../hooks/useTheme';

interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
}

export default function CodeBlock({ code, language, title }: CodeBlockProps) {
  const { isDark } = useTheme();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may be unavailable in some contexts
    }
  };

  return (
    <div
      className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700"
      data-testid="code-block"
    >
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-xs text-gray-600 dark:text-gray-300">
        <span>{title ?? language ?? 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="hover:text-gray-900 dark:hover:text-white transition-colors"
          aria-label="Copy code to clipboard"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <SyntaxHighlighter
        language={language ?? 'text'}
        style={isDark ? oneDark : oneLight}
        customStyle={{ margin: 0, borderRadius: 0 }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
