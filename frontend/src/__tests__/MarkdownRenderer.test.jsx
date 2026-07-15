import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-syntax-highlighter', () => ({
  Prism: vi.fn(() => null),
}));
vi.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({
  vscDarkPlus: {},
}));

import MarkdownRenderer from '../components/MarkdownRenderer';

describe('MarkdownRenderer', () => {
  it('returns null when content is empty', () => {
    const { container } = render(<MarkdownRenderer content="" />);
    expect(container.innerHTML).toBe('');
  });

  it('returns null when content is null', () => {
    const { container } = render(<MarkdownRenderer content={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders basic text content', () => {
    render(<MarkdownRenderer content="Hello world" />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders bold text', () => {
    render(<MarkdownRenderer content="This is **bold** text" />);
    expect(screen.getByText('bold')).toBeInTheDocument();
  });

  it('renders links with target="_blank"', () => {
    render(<MarkdownRenderer content="[Click](https://example.com)" />);
    const link = screen.getByText('Click');
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute('href', 'https://example.com');
    expect(link.closest('a')).toHaveAttribute('target', '_blank');
  });

  it('renders inline code', () => {
    render(<MarkdownRenderer content="Use `code` inline" />);
    expect(screen.getByText('code')).toBeInTheDocument();
  });

  it('renders blockquotes', () => {
    render(<MarkdownRenderer content="> quoted text" />);
    expect(screen.getByText('quoted text')).toBeInTheDocument();
  });
});
