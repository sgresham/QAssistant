import { describe, it, expect } from 'vitest';
import { TOOLS, executeTool } from '../tools.js';

describe('TOOLS definitions', () => {
  it('exports an array of tool definitions', () => {
    expect(Array.isArray(TOOLS)).toBe(true);
    expect(TOOLS.length).toBeGreaterThan(0);
  });

  it('get_infrastructure_health tool has correct structure', () => {
    const tool = TOOLS.find(t => t.function.name === 'get_infrastructure_health');
    expect(tool).toBeDefined();
    expect(tool.type).toBe('function');
    expect(tool.function.name).toBe('get_infrastructure_health');
    expect(tool.function.description).toBeDefined();
    expect(tool.function.parameters.type).toBe('object');
    expect(tool.function.parameters.required).toContain('component');
  });

  it('tool parameters define correct enum values', () => {
    const tool = TOOLS.find(t => t.function.name === 'get_infrastructure_health');
    const componentProp = tool.function.parameters.properties.component;
    expect(componentProp.enum).toEqual(['backend', 'database', 'all']);
  });
});

describe('executeTool', () => {
  it('returns error for unknown tool', async () => {
    const result = await executeTool('unknown_tool', {});
    expect(result).toBe("Error: Unknown tool 'unknown_tool'");
  });

  it('returns backend status when component is "backend"', async () => {
    const result = await executeTool('get_infrastructure_health', { component: 'backend' });
    const parsed = JSON.parse(result);
    expect(parsed.backend.status).toBe('online');
    expect(parsed.database).toBeUndefined();
  });

  it('returns database status when component is "database"', async () => {
    const result = await executeTool('get_infrastructure_health', { component: 'database' });
    const parsed = JSON.parse(result);
    expect(parsed.database.status).toBe('healthy');
    expect(parsed.backend).toBeUndefined();
  });

  it('returns all components when component is "all"', async () => {
    const result = await executeTool('get_infrastructure_health', { component: 'all' });
    const parsed = JSON.parse(result);
    expect(parsed.backend.status).toBe('online');
    expect(parsed.database.status).toBe('healthy');
  });

  it('defaults to "all" when component not provided', async () => {
    const result = await executeTool('get_infrastructure_health', {});
    const parsed = JSON.parse(result);
    expect(parsed.backend).toBeDefined();
    expect(parsed.database).toBeDefined();
  });

  it('reports disconnected database when mongoose not connected', async () => {
    const mongoose = await import('mongoose');
    const state = mongoose.connection.readyState;
    Object.defineProperty(mongoose.connection, 'readyState', { value: 0, writable: true, configurable: true });
    try {
      const result = await executeTool('get_infrastructure_health', { component: 'database' });
      const parsed = JSON.parse(result);
      expect(parsed.database.status).toBe('disconnected');
    } finally {
      Object.defineProperty(mongoose.connection, 'readyState', { value: state, writable: true, configurable: true });
    }
  });
});
