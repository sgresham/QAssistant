import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MainChat from '../components/MainChat';

vi.mock('react-markdown', () => ({
  default: ({ children }) => <div data-testid="markdown">{children}</div>,
}));

vi.mock('remark-gfm', () => ({ default: vi.fn() }));

vi.mock('react-syntax-highlighter', () => ({
  Prism: ({ children }) => <code>{children}</code>,
}));

vi.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({
  oneDark: {},
}));

const defaultProps = {
  chatHistory: [
    { role: 'system', content: 'You are a helpful AI assistant.' },
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there! How can I help you?' },
  ],
  setChatHistory: vi.fn(),
  modelMode: 'auto',
  setModelMode: vi.fn(),
  activeConversationId: 'conv-1',
  onSendMessage: vi.fn(),
  loading: false,
  lastModel: 'gpt-4',
  aiProviders: [],
  activeProviderId: null,
  setActiveProviderId: vi.fn(),
  activeModel: '',
  setActiveModel: vi.fn(),
  ttsProviders: [
    { _id: 'tts-1', name: 'ElevenLabs', apiKey: 'sk-test', defaultVoice: 'voice-1', enabled: true },
  ],
  activeTtsProviderId: 'tts-1',
  autoPlayTts: false,
  onAutoPlayTtsChange: vi.fn(),
};

describe('MainChat TTS', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('renders speaker button on assistant messages', () => {
    render(<MainChat {...defaultProps} />);
    const buttons = screen.getAllByTitle('Read aloud');
    expect(buttons).toHaveLength(1);
  });

  it('does not render speaker button on user messages', () => {
    render(<MainChat {...defaultProps} />);
    const buttons = screen.getAllByTitle('Read aloud');
    expect(buttons).toHaveLength(1);
  });

  it('shows auto-play TTS toggle in controls', () => {
    render(<MainChat {...defaultProps} />);
    const autoPlayCheckbox = screen.getByText('Auto-play TTS');
    expect(autoPlayCheckbox).toBeInTheDocument();
  });

  it('toggles auto-play TTS when checkbox is clicked', () => {
    render(<MainChat {...defaultProps} />);
    const checkboxes = screen.getAllByRole('checkbox');
    const autoPlayCheckbox = checkboxes.find(cb => cb.closest('label')?.textContent?.includes('Auto-play'));
    expect(autoPlayCheckbox).toBeDefined();
    fireEvent.click(autoPlayCheckbox);
    expect(defaultProps.onAutoPlayTtsChange).toHaveBeenCalledWith(true);
  });

  it('calls speak endpoint when speaker button is clicked', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => ({ done: true, value: undefined }),
        }),
      },
    });

    render(<MainChat {...defaultProps} />);
    const speakerBtn = screen.getByTitle('Read aloud');
    fireEvent.click(speakerBtn);

    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/tts/speak',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
          body: expect.stringContaining('Hi there! How can I help you?'),
        })
      );
    });
  });

  it('dims speaker buttons on other messages while one is speaking', async () => {
    localStorage.setItem('token', 'test-token');
    global.fetch.mockResolvedValueOnce({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => ({ done: true, value: undefined }),
        }),
      },
    });

    const props = {
      ...defaultProps,
      chatHistory: [
        { role: 'system', content: 'system' },
        { role: 'assistant', content: 'First response' },
        { role: 'user', content: 'Follow up' },
        { role: 'assistant', content: 'Second response' },
      ],
    };

    render(<MainChat {...props} />);
    const buttons = screen.getAllByTitle('Read aloud');
    expect(buttons).toHaveLength(2);

    fireEvent.click(buttons[0]);
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  it('does not fetch TTS when there is no TTS provider', async () => {
    render(<MainChat {...defaultProps} ttsProviders={[]} activeTtsProviderId={null} />);
    const speakerBtn = screen.getByTitle('Read aloud');
    fireEvent.click(speakerBtn);

    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/tts/speak',
        expect.objectContaining({
          body: expect.stringContaining('"providerId":null'),
        })
      );
    });
  });
});
