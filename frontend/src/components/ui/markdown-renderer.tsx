import ReactMarkdown, { Components } from 'react-markdown';
import { memo, useMemo } from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  const components: Components = useMemo(
    () => ({
      code: ({ children, ...props }) => (
        <code
          {...props}
          className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm font-mono"
        >
          {children}
        </code>
      ),
      strong: ({ children, ...props }) => (
        <strong {...props} className="font-bold">
          {children}
        </strong>
      ),
      em: ({ children, ...props }) => (
        <em {...props} className="italic">
          {children}
        </em>
      ),
      p: ({ children, ...props }) => (
        <p {...props} className="leading-[1.15] my-1">
          {children}
        </p>
      ),
      h1: ({ children, ...props }) => (
        <h1 {...props} className="text-lg font-bold leading-tight">
          {children}
        </h1>
      ),
      h2: ({ children, ...props }) => (
        <h2 {...props} className="text-base font-bold leading-tight">
          {children}
        </h2>
      ),
      h3: ({ children, ...props }) => (
        <h3 {...props} className="text-sm font-bold leading-tight">
          {children}
        </h3>
      ),
      ul: ({ children, ...props }) => (
        <ul {...props} className="list-disc ml-3 space-y-0.5 my-1" style={{ lineHeight: '0.5' }}>
          {children}
        </ul>
      ),
      ol: ({ children, ...props }) => (
        <ol {...props} className="list-decimal ml-3 space-y-0.5 my-1" style={{ lineHeight: '0.5' }}>
          {children}
        </ol>
      ),
      li: ({ children, ...props }) => (
        <li {...props} className="leading-[1.15] my-0">
          {children}
        </li>
      ),
    }),
    []
  );
  return (
    <div className={className}>
      <ReactMarkdown components={components}>{content}</ReactMarkdown>
    </div>
  );
}

export default memo(MarkdownRenderer);
