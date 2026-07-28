import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { Readable } from 'stream';
import { TtsProvider, dbConnected } from './db.js';

const DEFAULT_VOICE = '7p1Ofvcwsv7UBPoFNcpI';

function getFallbackConfig() {
  return {
    apiKey: process.env.ELEVENLABS_API_KEY || '',
    defaultVoice: process.env.ELEVENLABS_DEFAULT_VOICE || DEFAULT_VOICE
  };
}

async function resolveTtsConfig(providerId, userId) {
  if (providerId) {
    const provider = await TtsProvider.findOne({ _id: providerId, userId, enabled: true });
    if (provider) {
      return {
        apiKey: provider.apiKey,
        defaultVoice: provider.defaultVoice || DEFAULT_VOICE
      };
    }
  }

  const firstEnabled = await TtsProvider.findOne({ userId, enabled: true }).sort({ createdAt: 1 });
  if (firstEnabled) {
    return {
      apiKey: firstEnabled.apiKey,
      defaultVoice: firstEnabled.defaultVoice || DEFAULT_VOICE
    };
  }

  return getFallbackConfig();
}

export async function speak(req, res) {
  try {
    const { text, voice, providerId } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const userId = req.user.id;
    const config = await resolveTtsConfig(providerId, userId);

    if (!config.apiKey) {
      return res.status(400).json({ error: 'No TTS provider configured. Add an ElevenLabs API key in Settings.' });
    }

    const voiceId = voice || config.defaultVoice || DEFAULT_VOICE;

    const client = new ElevenLabsClient({ apiKey: config.apiKey });

    const audioStream = await client.textToSpeech.stream(voiceId, {
      text: text,
      modelId: 'eleven_v3',
      outputFormat: 'mp3_44100_128'
    });

    res.setHeader('Content-Type', 'audio/mpeg');
    const nodeStream = Readable.fromWeb(audioStream);
    nodeStream.pipe(res);
  } catch (error) {
    console.error('TTS error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'TTS request failed' });
    }
  }
}
