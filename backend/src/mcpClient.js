import { NodeStreamableHTTPClientTransport } from '@modelcontextprotocol/node';
import { McpServer } from './db.js';

// Cache for active transports to avoid re-initializing for every request if possible
// In a stateless API, we might need to re-init per request or use a session store.
// For simplicity and robustness in this context, we will create transports per request
// but keep them alive for the duration of the chat turn.
const activeTransports = new Map();

/**
 * Fetches tools from a specific MCP server.
 * @param {Object} serverConfig - The MCP server configuration from DB.
 * @returns {Promise<Array>} - Array of tool definitions compatible with OpenAI function calling.
 */
export async function fetchMcpTools(serverConfig) {
  const { url, headers = {} } = serverConfig;
  
  if (!url) return [];

  let transport = activeTransports.get(url);
  
  if (!transport) {
    transport = new NodeStreamableHTTPClientTransport({
      url: new URL(url),
      requestInit: {
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        }
      }
    });
    activeTransports.set(url, transport);
  }

  try {
    // Connect to the server
    await transport.connect();
    
    // List tools
    const toolsResponse = await transport.request({
      method: 'tools/list',
      params: {}
    });

    const mcpTools = toolsResponse?.tools || [];
    
    // Convert MCP tool format to OpenAI function calling format
    const openaiTools = mcpTools.map(tool => ({
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
    // Clean up failed transport
    activeTransports.delete(url);
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

  let transport = activeTransports.get(url);
  
  if (!transport) {
    transport = new NodeStreamableHTTPClientTransport({
      url: new URL(url),
      requestInit: {
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        }
      }
    });
    activeTransports.set(url, transport);
  }

  try {
    // Ensure connection is active
    if (!transport.isConnected) {
      await transport.connect();
    }

    // Call the tool
    const result = await transport.request({
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: toolArgs
      }
    });

    // Format the result
    if (result.content && Array.isArray(result.content)) {
      return result.content.map(c => c.text || JSON.stringify(c)).join('\n');
    }
    
    return JSON.stringify(result);
  } catch (error) {
    console.error(`Error executing tool ${toolName} on MCP server ${url}:`, error.message);
    activeTransports.delete(url); // Clean up on error
    return `Error executing tool: ${error.message}`;
  }
}

/**
 * Cleans up active transports.
 * Should be called periodically or when shutting down.
 */
export async function cleanupTransports() {
  for (const [url, transport] of activeTransports) {
    try {
      await transport.close();
    } catch (e) {
      console.error(`Error closing transport for ${url}:`, e);
    }
  }
  activeTransports.clear();
}
