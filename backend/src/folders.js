import { Folder, Conversation, dbConnected } from './db.js';

// 1. List all folders (filtered by user)
export async function getFolders(req, res) {
  try {
    if (!dbConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const userId = req.user.id;
    const folders = await Folder.find({ userId }).sort({ name: 1 });
    res.json(folders);
  } catch (error) {
    console.error('Error fetching folders:', error);
    res.status(500).json({ error: error.message });
  }
}

// 2. Create a new folder (assigned to user)
export async function createFolder(req, res) {
  try {
    if (!dbConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const { name } = req.body;
    const userId = req.user.id;

    if (!name) return res.status(400).json({ error: 'Folder name is required' });

    const newFolder = new Folder({ name, userId });
    await newFolder.save();
    res.json(newFolder);
  } catch (error) {
    console.error('Error creating folder:', error);
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Folder with this name already exists' });
    }
    res.status(500).json({ error: error.message });
  }
}

// 3. Delete a folder (only if owned by user)
export async function deleteFolder(req, res) {
  try {
    if (!dbConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const userId = req.user.id;
    const result = await Folder.findOneAndDelete({ _id: req.params.id, userId });
    
    if (!result) return res.status(404).json({ error: 'Folder not found' });

    // Optional: Move conversations in this folder to null (ungrouped)
    await Conversation.updateMany({ folderId: req.params.id, userId }, { folderId: null });

    res.json({ message: 'Folder deleted successfully' });
  } catch (error) {
    console.error('Error deleting folder:', error);
    res.status(500).json({ error: error.message });
  }
}
