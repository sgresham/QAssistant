import { McpServer, dbConnected } from './db.js';

// 1. List all MCP servers for the user
export async function getMcpServers(req, res) {
  try {
    if (!dbConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const userId = req.user.id;
    const servers = await McpServer.find({ userId }).sort({ createdAt: -1 });
    res.json(servers);
  } catch (error) {
    console.error('Error fetching MCP servers:', error);
    res.status(500).json({ error: error.message });
  }
}

// 2. Get a specific MCP server (filtered by user)
export async function getMcpServer(req, res) {
  try {
    if (!dbConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const userId = req.user.id;
    const server = await McpServer.findOne({ _id: req.params.id, userId });
    if (!server) return res.status(404).json({ error: 'MCP Server not found' });
    res.json(server);
  } catch (error) {
    console.error('Error fetching MCP server:', error);
    res.status(500).json({ error: error.message });
  }
}

// 3. Create a new MCP server (assigned to user)
export async function createMcpServer(req, res) {
  try {
    if (!dbConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const { name, url, headers } = req.body;
    const userId = req.user.id;

    if (!name || !url) {
      return res.status(400).json({ error: 'Name and URL are required' });
    }

    const newServer = new McpServer({
      name,
      url,
      headers: headers || {},
      userId
    });

    await newServer.save();
    res.status(201).json(newServer);
  } catch (error) {
    console.error('Error creating MCP server:', error);
    res.status(500).json({ error: error.message });
  }
}

// 4. Update an MCP server (only if owned by user)
export async function updateMcpServer(req, res) {
  try {
    if (!dbConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const { name, url, headers, enabled } = req.body;
    const userId = req.user.id;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (url !== undefined) updateData.url = url;
    if (headers !== undefined) updateData.headers = headers;
    if (enabled !== undefined) updateData.enabled = enabled;
    updateData.updatedAt = new Date();

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid update data provided' });
    }

    const server = await McpServer.findOneAndUpdate(
      { _id: req.params.id, userId },
      updateData,
      { new: true, runValidators: true }
    );

    if (!server) return res.status(404).json({ error: 'MCP Server not found' });
    res.json(server);
  } catch (error) {
    console.error('Error updating MCP server:', error);
    res.status(500).json({ error: error.message });
  }
}

// 5. Delete an MCP server (only if owned by user)
export async function deleteMcpServer(req, res) {
  try {
    if (!dbConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const userId = req.user.id;
    const result = await McpServer.findOneAndDelete({ _id: req.params.id, userId });
    if (!result) return res.status(404).json({ error: 'MCP Server not found' });
    res.json({ message: 'MCP Server deleted successfully' });
  } catch (error) {
    console.error('Error deleting MCP server:', error);
    res.status(500).json({ error: error.message });
  }
}
