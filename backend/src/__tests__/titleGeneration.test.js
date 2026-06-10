import { describe, it, expect, beforeEach, vi } from 'vitest';
import axios from 'axios';

vi.mock('axios');

describe('generateTitle', () => {
  let generateTitle;
  const LLAMA_BASE_URL = 'http://test-llama:8888/v1';
  const MODELS = { THINKER: 'thinker-model', REFLEX: 'reflex-model' };

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.LLAMA_ENDPOINT = LLAMA_BASE_URL;
    process.env.THINKER_MODEL = 'thinker-model';
    process.env.REFLEX_MODEL = 'reflex-model';

    const mod = await import('../conversations.js');
    generateTitle = mod.generateTitle;
  });

  it('returns fallback title when messages array has 1 or fewer entries', async () => {
    const input = 'Hello world';
    const title = await generateTitle(input, []);
    expect(title).toBe('Hello world');
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('returns fallback title when LLM call fails', async () => {
    axios.post.mockRejectedValue(new Error('Network timeout'));

    const input = 'How do I configure nginx reverse proxy settings';
    const messages = [
      { role: 'user', content: input },
      { role: 'assistant', content: 'Here is how you configure nginx...' }
    ];

    const title = await generateTitle(input, messages);
    expect(title).toBe('How do I configure nginx reverse proxy settings');
    expect(axios.post).toHaveBeenCalledWith(
      `${LLAMA_BASE_URL}/chat/completions`,
      expect.objectContaining({
        model: MODELS.REFLEX,
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({ role: 'user' })
        ]),
        temperature: 0.3,
        max_tokens: 50
      }),
      { timeout: 30000 }
    );
  });

  it('returns LLM-generated title on success', async () => {
    axios.post.mockResolvedValue({
      data: {
        choices: [{ message: { content: 'Nginx Configuration Guide' } }]
      }
    });

    const input = 'How do I configure nginx reverse proxy settings';
    const messages = [
      { role: 'user', content: input },
      { role: 'assistant', content: 'Here is how you configure nginx...' }
    ];

    const title = await generateTitle(input, messages);
    expect(title).toBe('Nginx Configuration Guide');
  });

  it('truncates fallback title to 50 chars for long input', async () => {
    axios.post.mockRejectedValue(new Error('LLM unavailable'));

    const input = 'A'.repeat(100);
    const messages = [
      { role: 'user', content: input },
      { role: 'assistant', content: 'Response' }
    ];

    const title = await generateTitle(input, messages);
    expect(title).toBe('A'.repeat(50) + '...');
  });

  it('does not truncate fallback title when input is 50 chars or fewer', async () => {
    axios.post.mockRejectedValue(new Error('LLM unavailable'));

    const input = 'Exactly fifty characters long string!';
    const messages = [
      { role: 'user', content: input },
      { role: 'assistant', content: 'Response' }
    ];

    const title = await generateTitle(input, messages);
    expect(title).toBe('Exactly fifty characters long string!');
    expect(title.length).toBeLessThanOrEqual(50);
  });

  it('sends correct title prompt with first two messages', async () => {
    axios.post.mockResolvedValue({
      data: {
        choices: [{ message: { content: 'Test Title' } }]
      }
    });

    const messages = [
      { role: 'user', content: 'What is the capital of France?' },
      { role: 'assistant', content: 'The capital of France is Paris.' }
    ];

    await generateTitle('What is the capital of France?', messages);

    const callArgs = axios.post.mock.calls[0][1];
    expect(callArgs.messages).toEqual([
      { role: 'system', content: 'You are a helpful assistant. Generate a short title (max 50 chars). No quotes.' },
      {
        role: 'user',
        content: 'Generate title:\n\n[user]: What is the capital of France?\n[assistant]: The capital of France is Paris.'
      }
    ]);
  });
});
