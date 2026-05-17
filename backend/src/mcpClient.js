import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { McpServer } from './db.js';

// Cache for active clients to avoid re-initializing for every request if possible
// In a stateless API, we might need to re-init per request or use a session store.
// For simplicity and robustness in this context, we will create clients per request
// but keep them alive for the duration of the chat turn.
const activeClients = new Map();

/**
 * Fetches tools from a specific MCP server.
 * @param {Object} serverConfig - The MCP server configuration from DB.
 * @returns {Promise<Array>} - Array of tool definitions compatible with OpenAI function calling.
 */
export async function fetchMcpTools(serverConfig) {
  const { url, headers = {} } = serverConfig;
  
  if (!url) return [];

  let client = activeClients.get(url);
  
  if (!client) {
    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: {
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        }
      }
    });

    client = new Client({ name: 'qassistant-client', version: '1.0.0' });
    
    try {
      await client.connect(transport);
      activeClients.set(url, client);
    } catch (error) {
      console.error(`Error connecting to MCP server ${url}:`, error.message);
      return [];
    }
  }

  try {
    // List tools
    const { tools } = await client.listTools();
    
    // Convert MCP tool format to OpenAI function calling format
    const openaiTools = tools.map(tool => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description || `Tool provided by MCP server at ${url}`,
        parameters: tool.inputSchema || {
          type: "object",
          properties: {}
        }
      }
    }));

    return openaiTools;
  } catch (error) {
    console.error(`Error fetching tools from MCP server ${url}:`, error.message);
    // Clean up failed client
    activeClients.delete(url);
    return [];
  }
}

/**
 * Executes a tool on a specific MCP server.
 * @param {Object} serverConfig - The MCP server configuration from DB.
 * @param {string} toolName - The name of the tool to execute.
 * @param {Object} toolArgs - The arguments for the tool.
 * @returns {Promise<string>} - The result of the tool execution.
 */
export async function executeMcpTool(serverConfig, toolName, toolArgs) {
  const { url, headers = {} } = serverConfig;
  
  if (!url) return `Error: No URL provided for MCP server.`;

  let client = activeClients.get(url);
  
  if (!client) {
    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: {
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        }
      }
    });

    client = new Client({ name: 'qassistant-client', version: '1.0.0' });
    
    try {
      await client.connect(transport);
      activeClients.set(url, client);
    } catch (error) {
      console.error(`Error connecting to MCP server ${url} for tool execution:`, error.message);
      return `Error connecting to MCP server: ${error.message}`;
    }
  }

  try {
    // Call the tool
    const result = await client.callTool({
      name: toolName,
      arguments: toolArgs
    });

    // Format the result
    if (result.content && Array.isArray(result.content)) {
      return result.content.map(c => c.text || JSON.stringify(c)).join('\n');
    }
    
    return JSON.stringify(result);
  } catch (error) {
    console.error(`Error executing tool ${toolName} on MCP server ${url}:`, error.message);
    activeClients.delete(url); // Clean up on error
    return `Error executing tool: ${error.message}`;
  }
}

/**
 * Cleans up active clients.
 * Should be called periodically or when shutting down.
 */
export async function cleanupClients() {
  for (const [url, client] of activeClients) {
    try {
      await client.close();
    } catch (e) {
      console.error(`Error closing client for ${url}:`, e);
    }
  }
  activeClients.clear();
}
