import { AiProvider, dbConnected } from './db.js';

export async function getAiProviders(req, res) {
  try {
    if (!dbConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const userId = req.user.id;
    const providers = await AiProvider.find({ userId }).sort({ createdAt: -1 });
    res.json(providers);
  } catch (error) {
    console.error('Error fetching AI providers:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function getAiProvider(req, res) {
  try {
    if (!dbConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const userId = req.user.id;
    const provider = await AiProvider.findOne({ _id: req.params.id, userId });
    if (!provider) return res.status(404).json({ error: 'AI Provider not found' });
    res.json(provider);
  } catch (error) {
    console.error('Error fetching AI provider:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function createAiProvider(req, res) {
  try {
    if (!dbConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const { name, baseUrl, apiKey, models } = req.body;
    const userId = req.user.id;

    if (!name || !baseUrl) {
      return res.status(400).json({ error: 'Name and Base URL are required' });
    }

    const newProvider = new AiProvider({
      name,
      baseUrl,
      apiKey: apiKey || '',
      models: models || [],
      userId
    });

    await newProvider.save();
    res.status(201).json(newProvider);
  } catch (error) {
    console.error('Error creating AI provider:', error);
    if (error.code === 11000) {
      return res.status(409).json({ error: 'AI Provider with this name already exists' });
    }
    res.status(500).json({ error: error.message });
  }
}

export async function updateAiProvider(req, res) {
  try {
    if (!dbConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const { name, baseUrl, apiKey, models, enabled } = req.body;
    const userId = req.user.id;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (baseUrl !== undefined) updateData.baseUrl = baseUrl;
    if (apiKey !== undefined) updateData.apiKey = apiKey;
    if (models !== undefined) updateData.models = models;
    if (enabled !== undefined) updateData.enabled = enabled;
    updateData.updatedAt = new Date();

    if (Object.keys(updateData).length <= 1) {
      return res.status(400).json({ error: 'No valid update data provided' });
    }

    const provider = await AiProvider.findOneAndUpdate(
      { _id: req.params.id, userId },
      updateData,
      { new: true, runValidators: true }
    );

    if (!provider) return res.status(404).json({ error: 'AI Provider not found' });
    res.json(provider);
  } catch (error) {
    console.error('Error updating AI provider:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function deleteAiProvider(req, res) {
  try {
    if (!dbConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const userId = req.user.id;
    const result = await AiProvider.findOneAndDelete({ _id: req.params.id, userId });
    if (!result) return res.status(404).json({ error: 'AI Provider not found' });
    res.json({ message: 'AI Provider deleted successfully' });
  } catch (error) {
    console.error('Error deleting AI provider:', error);
    res.status(500).json({ error: error.message });
  }
}
