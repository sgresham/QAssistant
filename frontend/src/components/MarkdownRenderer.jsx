import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

function MarkdownRenderer({ content }) {
  if (!content) return null;

  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            
            if (!inline && match) {
              // Ensure children are treated as a string and newlines are preserved
              const codeString = String(children).replace(/\n$/, '');
              
              return (
                <SyntaxHighlighter
                  children={codeString}
                  style={vscDarkPlus}
                  language={match[1]}
                  PreTag="div"
                  showLineNumbers={false}
                  wrapLines={true}
                  {...props}
                />
              );
            }

            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          p({ children }) {
            return <p style={{ marginBottom: '1rem' }}>{children}</p>;
          },
          ul({ children }) {
            return <ul style={{ marginBottom: '1rem', paddingLeft: '1.5rem' }}>{children}</ul>;
          },
          ol({ children }) {
            return <ol style={{ marginBottom: '1rem', paddingLeft: '1.5rem' }}>{children}</ol>;
          },
          blockquote({ children }) {
            return (
              <blockquote style={{ borderLeft: '4px solid #ccc', paddingLeft: '1rem', margin: '1rem 0', color: '#666' }}>
                {children}
              </blockquote>
            );
          },
          h1({ children }) {
            return <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginTop: '1rem', marginBottom: '0.5rem' }}>{children}</h1>;
          },
          h2({ children }) {
            return <h2 style={{ fontSize: '1.3rem', fontWeight: 'bold', marginTop: '1rem', marginBottom: '0.5rem' }}>{children}</h2>;
          },
          h3({ children }) {
            return <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginTop: '1rem', marginBottom: '0.5rem' }}>{children}</h3>;
          },
          a({ href, children }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#3498db', textDecoration: 'underline' }}>
                {children}
              </a>
            );
          },
          table({ children }) {
            return (
              <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>{children}</table>
              </div>
            );
          },
          th({ children }) {
            return <th style={{ border: '1px solid #ddd', padding: '8px', backgroundColor: '#f4f4f4' }}>{children}</th>;
          },
          td({ children }) {
            return <td style={{ border: '1px solid #ddd', padding: '8px' }}>{children}</td>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default MarkdownRenderer;
