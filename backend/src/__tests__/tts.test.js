import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PassThrough } from 'stream';

function createFakeStream() {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(Buffer.from('fake-mp3'));
      controller.close();
    },
  });
}

const mockConvert = vi.fn().mockImplementation(() => createFakeStream());
const mockElevenLabsClient = vi.fn().mockImplementation(() => ({
  textToSpeech: { convert: mockConvert },
}));

vi.mock('@elevenlabs/elevenlabs-js', () => ({
  ElevenLabsClient: mockElevenLabsClient,
}));

let originalEnv;

beforeEach(() => {
  originalEnv = { ...process.env };
});

afterEach(() => {
  process.env = originalEnv;
  mockConvert.mockReset();
  mockConvert.mockImplementation(() => createFakeStream());
});

function mockRes() {
  const passThrough = new PassThrough();
  const res = Object.assign(passThrough, {
    statusCode: 200,
    body: null,
    headers: {},
    status: function (code) {
      this.statusCode = code;
      return this;
    },
    json: function (data) {
      this.body = data;
      return this;
    },
    setHeader: function (key, value) {
      this.headers[key] = value;
    },
  });
  return res;
}

describe('TTS speak endpoint', () => {
  describe('speak', () => {
    it('returns 400 when text is missing', async () => {
      const { speak } = await import('../tts.js');
      const req = { body: {}, user: { id: '000000000000000000000000' } };
      const res = mockRes();
      await speak(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Text is required');
    });

    it('returns 400 when text is empty', async () => {
      const { speak } = await import('../tts.js');
      const req = { body: { text: '   ' }, user: { id: '000000000000000000000000' } };
      const res = mockRes();
      await speak(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Text is required');
    });

    it('returns 400 when no API key is available', async () => {
      delete process.env.ELEVENLABS_API_KEY;
      delete process.env.ELEVENLABS_DEFAULT_VOICE;
      const { speak } = await import('../tts.js');
      const req = { body: { text: 'Hello' }, user: { id: '000000000000000000000000' } };
      const res = mockRes();
      await speak(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('No TTS provider configured');
    });

    it('uses env fallback when no DB provider is set', async () => {
      process.env.ELEVENLABS_API_KEY = 'env-api-key';
      const { speak } = await import('../tts.js');
      const req = { body: { text: 'Hello' }, user: { id: '000000000000000000000000' } };
      const res = mockRes();
      await speak(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.headers['Content-Type']).toBe('audio/mpeg');
    });

    it('uses env fallback and calls ElevenLabs API with voice from request', async () => {
      process.env.ELEVENLABS_API_KEY = 'env-api-key';
      mockConvert.mockClear();
      const { speak } = await import('../tts.js');
      const req = { body: { text: 'Hello', voice: 'custom-voice' }, user: { id: '000000000000000000000000' } };
      const res = mockRes();
      await speak(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.headers['Content-Type']).toBe('audio/mpeg');
    });

    it('handles ElevenLabs API errors gracefully', async () => {
      process.env.ELEVENLABS_API_KEY = 'env-api-key';
      const apiError = new Error('API rate limit exceeded');
      mockConvert.mockRejectedValueOnce(apiError);

      const { speak } = await import('../tts.js');
      const req = { body: { text: 'Hello' }, user: { id: '000000000000000000000000' } };
      const res = mockRes();
      await speak(req, res);
      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('API rate limit exceeded');
    });
  });
});
