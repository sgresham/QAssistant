import { describe, it, expect } from 'vitest';
import { buildLlmPayload } from '../generatePrompt.js';

describe('buildLlmPayload', () => {
  it('uses default system prompt when none provided', () => {
    const result = buildLlmPayload({
      systemContent: '',
      messageHistory: [],
    });
    expect(result.messages[0].role).toBe('system');
    expect(result.messages[0].content).toBe('You are a helpful AI assistant.');
  });

  it('uses provided system prompt', () => {
    const result = buildLlmPayload({
      systemContent: 'Custom system prompt',
      messageHistory: [],
    });
    expect(result.messages[0].content).toBe('Custom system prompt');
  });

  it('appends context messages to system prompt', () => {
    const result = buildLlmPayload({
      systemContent: 'Base prompt',
      messageHistory: [],
      contextMessages: [{ content: 'User likes coffee' }],
    });
    expect(result.messages[0].content).toContain('Base prompt');
    expect(result.messages[0].content).toContain('[Memory]: User likes coffee');
    expect(result.messages[0].content).toContain('RELEVANT USER CONTEXT/MEMORIES');
  });

  it('filters system messages from history', () => {
    const result = buildLlmPayload({
      systemContent: 'Base',
      messageHistory: [
        { role: 'system', content: 'old system' },
        { role: 'user', content: 'hello' },
      ],
    });
    const systemMessages = result.messages.filter(m => m.role === 'system');
    expect(systemMessages).toHaveLength(1);
    expect(systemMessages[0].content).toBe('Base');
  });

  it('includes user and assistant messages from history', () => {
    const result = buildLlmPayload({
      systemContent: 'Base',
      messageHistory: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' },
      ],
    });
    expect(result.messages).toHaveLength(3);
    expect(result.messages[1].role).toBe('user');
    expect(result.messages[2].role).toBe('assistant');
  });

  it('appends temporal context to last user message', () => {
    const result = buildLlmPayload({
      systemContent: 'Base',
      messageHistory: [
        { role: 'user', content: 'what time is it' },
        { role: 'assistant', content: 'let me check' },
        { role: 'user', content: 'check again' },
      ],
      timezone: 'UTC',
    });
    const lastUserMsg = result.messages[result.messages.length - 1];
    expect(lastUserMsg.content).toContain('check again');
    expect(lastUserMsg.content).toContain('[Temporal Context:');
    expect(lastUserMsg.content).toContain('UTC');
  });

  it('does not modify earlier user messages with temporal context', () => {
    const result = buildLlmPayload({
      systemContent: 'Base',
      messageHistory: [
        { role: 'user', content: 'first message' },
        { role: 'assistant', content: 'reply' },
        { role: 'user', content: 'second message' },
      ],
      timezone: 'UTC',
    });
    const firstUserMsg = result.messages[1];
    expect(firstUserMsg.content).toBe('first message');
    const lastUserMsg = result.messages[3];
    expect(lastUserMsg.content).toContain('Temporal Context');
  });

  it('handles empty message history', () => {
    const result = buildLlmPayload({
      systemContent: 'Base',
      messageHistory: [],
    });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('system');
  });

  it('converts Mongoose documents to plain objects', () => {
    const mockDoc = {
      role: 'user',
      content: 'test',
      toObject: () => ({ role: 'user', content: 'test' }),
    };
    const result = buildLlmPayload({
      systemContent: 'Base',
      messageHistory: [mockDoc],
    });
    expect(typeof result.messages[1].toObject).toBe('undefined');
    expect(result.messages[1].role).toBe('user');
  });

  it('preserves tool_calls and tool_call_id on messages', () => {
    const history = [
      { role: 'assistant', content: ' ', tool_calls: [{ id: 'abc', function: { name: 'test', arguments: '{}' } }] },
      { role: 'tool', content: 'result', tool_call_id: 'abc' },
    ];
    const result = buildLlmPayload({
      systemContent: 'Base',
      messageHistory: history,
    });
    expect(result.messages[1].tool_calls).toBeDefined();
    expect(result.messages[2].tool_call_id).toBe('abc');
  });

  it('falls back to space for empty content', () => {
    const result = buildLlmPayload({
      systemContent: 'Base',
      messageHistory: [{ role: 'assistant', content: null }],
    });
    expect(result.messages[1].content).toBe(' ');
  });

  describe('tools', () => {
    const makeTool = (name) => ({
      type: 'function',
      function: { name, description: '', parameters: {} },
    });

    it('returns undefined tools when none provided', () => {
      const result = buildLlmPayload({
        systemContent: 'Base',
        messageHistory: [],
        localTools: [],
        mcpTools: [],
      });
      expect(result.tools).toBeUndefined();
    });

    it('combines local and MCP tools', () => {
      const result = buildLlmPayload({
        systemContent: 'Base',
        messageHistory: [],
        localTools: [makeTool('local')],
        mcpTools: [makeTool('mcp')],
      });
      expect(result.tools).toHaveLength(2);
    });

    it('sorts tools alphabetically by name', () => {
      const result = buildLlmPayload({
        systemContent: 'Base',
        messageHistory: [],
        localTools: [makeTool('zebra'), makeTool('apple')],
        mcpTools: [makeTool('mango')],
      });
      const names = result.tools.map(t => t.function.name);
      expect(names).toEqual(['apple', 'mango', 'zebra']);
    });
  });
});
