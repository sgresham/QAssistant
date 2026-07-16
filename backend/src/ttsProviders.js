import { TtsProvider, dbConnected } from './db.js';

export async function getTtsProviders(req, res) {
  try {
    if (!dbConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const userId = req.user.id;
    const providers = await TtsProvider.find({ userId }).sort({ createdAt: -1 });
    res.json(providers);
  } catch (error) {
    console.error('Error fetching TTS providers:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function getTtsProvider(req, res) {
  try {
    if (!dbConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const userId = req.user.id;
    const provider = await TtsProvider.findOne({ _id: req.params.id, userId });
    if (!provider) return res.status(404).json({ error: 'TTS Provider not found' });
    res.json(provider);
  } catch (error) {
    console.error('Error fetching TTS provider:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function createTtsProvider(req, res) {
  try {
    if (!dbConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const { name, apiKey, defaultVoice } = req.body;
    const userId = req.user.id;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const newProvider = new TtsProvider({
      name,
      apiKey: apiKey || '',
      defaultVoice: defaultVoice || '7p1Ofvcwsv7UBPoFNcpI',
      userId
    });

    await newProvider.save();
    res.status(201).json(newProvider);
  } catch (error) {
    console.error('Error creating TTS provider:', error);
    if (error.code === 11000) {
      return res.status(409).json({ error: 'TTS Provider with this name already exists' });
    }
    res.status(500).json({ error: error.message });
  }
}

export async function updateTtsProvider(req, res) {
  try {
    if (!dbConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const { name, apiKey, defaultVoice, enabled } = req.body;
    const userId = req.user.id;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (apiKey !== undefined) updateData.apiKey = apiKey;
    if (defaultVoice !== undefined) updateData.defaultVoice = defaultVoice;
    if (enabled !== undefined) updateData.enabled = enabled;
    updateData.updatedAt = new Date();

    if (Object.keys(updateData).length <= 1) {
      return res.status(400).json({ error: 'No valid update data provided' });
    }

    const provider = await TtsProvider.findOneAndUpdate(
      { _id: req.params.id, userId },
      updateData,
      { new: true, runValidators: true }
    );

    if (!provider) return res.status(404).json({ error: 'TTS Provider not found' });
    res.json(provider);
  } catch (error) {
    console.error('Error updating TTS provider:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function deleteTtsProvider(req, res) {
  try {
    if (!dbConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const userId = req.user.id;
    const result = await TtsProvider.findOneAndDelete({ _id: req.params.id, userId });
    if (!result) return res.status(404).json({ error: 'TTS Provider not found' });
    res.json({ message: 'TTS Provider deleted successfully' });
  } catch (error) {
    console.error('Error deleting TTS provider:', error);
    res.status(500).json({ error: error.message });
  }
}
