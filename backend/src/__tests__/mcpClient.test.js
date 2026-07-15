import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@modelcontextprotocol/client', () => {
  const sharedMockClient = {
    connect: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({ tools: [] }),
    callTool: vi.fn().mockResolvedValue({ content: [{ text: 'tool result' }] }),
    close: vi.fn().mockResolvedValue(undefined),
  };

  return {
    StreamableHTTPClientTransport: vi.fn().mockImplementation(() => ({})),
    Client: vi.fn().mockImplementation(() => sharedMockClient),
  };
});

describe('MCP Client', () => {
  let fetchMcpTools, executeMcpTool, cleanupClients;
  let mockClient;
  const serverConfig = {
    url: 'http://localhost:8080/mcp',
    headers: { Authorization: 'Bearer test' },
  };

  beforeEach(async () => {
    const { Client } = await import('@modelcontextprotocol/client');
    mockClient = Client();

    mockClient.connect.mockReset();
    mockClient.connect.mockResolvedValue(undefined);
    mockClient.listTools.mockReset();
    mockClient.listTools.mockResolvedValue({ tools: [] });
    mockClient.callTool.mockReset();
    mockClient.callTool.mockResolvedValue({ content: [{ text: 'tool result' }] });
    mockClient.close.mockReset();
    mockClient.close.mockResolvedValue(undefined);

    const mod = await import('../mcpClient.js');
    fetchMcpTools = mod.fetchMcpTools;
    executeMcpTool = mod.executeMcpTool;
    cleanupClients = mod.cleanupClients;

    await cleanupClients();
  });

  describe('fetchMcpTools', () => {
    it('returns an empty array when no URL provided', async () => {
      const tools = await fetchMcpTools({ headers: {} });
      expect(tools).toEqual([]);
    });

    it('fetches and converts MCP tools to OpenAI format', async () => {
      mockClient.listTools.mockResolvedValue({
        tools: [
          { name: 'get_weather', description: 'Get weather', inputSchema: { type: 'object', properties: { city: { type: 'string' } } } },
          { name: 'no_desc_tool', inputSchema: { type: 'object', properties: {} } },
        ],
      });

      const tools = await fetchMcpTools(serverConfig);
      expect(tools).toHaveLength(2);
      expect(tools[0]).toEqual({
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get weather',
          parameters: { type: 'object', properties: { city: { type: 'string' } } },
        },
      });
      expect(tools[1].function.name).toBe('no_desc_tool');
      expect(tools[1].function.description).toContain('MCP server');
    });

    it('returns empty array on connection error', async () => {
      mockClient.connect.mockRejectedValue(new Error('Connection refused'));

      const tools = await fetchMcpTools(serverConfig);
      expect(tools).toEqual([]);
    });

    it('returns empty array on listTools error', async () => {
      mockClient.listTools.mockRejectedValue(new Error('Server error'));

      const tools = await fetchMcpTools(serverConfig);
      expect(tools).toEqual([]);
    });
  });

  describe('executeMcpTool', () => {
    it('returns error when no URL provided', async () => {
      const result = await executeMcpTool({ url: '' }, 'test_tool', {});
      expect(result).toBe('Error: No URL provided for MCP server.');
    });

    it('executes an MCP tool and returns formatted result', async () => {
      mockClient.callTool.mockResolvedValue({
        content: [{ text: 'Weather is sunny' }],
      });

      const result = await executeMcpTool(serverConfig, 'get_weather', { city: 'Sydney' });
      expect(result).toBe('Weather is sunny');
    });

    it('handles non-text content in tool result', async () => {
      mockClient.callTool.mockResolvedValue({
        content: [{ something: 'value' }],
      });

      const result = await executeMcpTool(serverConfig, 'get_weather', {});
      expect(result).toContain('something');
    });

    it('returns error on connection failure', async () => {
      mockClient.connect.mockRejectedValue(new Error('Connection timeout'));

      const result = await executeMcpTool(serverConfig, 'get_weather', {});
      expect(result).toContain('Error connecting to MCP server');
    });

    it('returns error on tool call failure', async () => {
      mockClient.callTool.mockRejectedValue(new Error('Tool execution failed'));

      const result = await executeMcpTool(serverConfig, 'failing_tool', {});
      expect(result).toContain('Error executing tool');
    });
  });

  describe('cleanupClients', () => {
    it('cleans up all active clients without error', async () => {
      await expect(cleanupClients()).resolves.toBeUndefined();
    });
  });
});
