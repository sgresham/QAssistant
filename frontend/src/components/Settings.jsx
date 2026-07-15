import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../api';

function Settings({ token, theme, setTheme, sidebarPosition, setSidebarPosition, aiProviders, onAiProvidersChange }) {
  const [mcpServers, setMcpServers] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingServer, setEditingServer] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    headers: '{}'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // AI Provider State
  const [isProviderModalOpen, setIsProviderModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState(null);
  const [providerFormData, setProviderFormData] = useState({
    name: '',
    baseUrl: '',
    apiKey: '',
    models: ''
  });
  const [providerLoading, setProviderLoading] = useState(false);
  const [providerError, setProviderError] = useState('');

  useEffect(() => {
    fetchMcpServers();
  }, []);

  const fetchMcpServers = async () => {
    try {
      const data = await apiGet('/api/mcp-servers');
      setMcpServers(data);
    } catch (err) {
      console.error('Failed to fetch MCP servers:', err);
      setError('Failed to load MCP servers.');
    }
  };

  const handleOpenModal = (server = null) => {
    if (server) {
      setEditingServer(server);
      setFormData({
        name: server.name,
        url: server.url,
        headers: JSON.stringify(server.headers || {}, null, 2)
      });
    } else {
      setEditingServer(null);
      setFormData({
        name: '',
        url: '',
        headers: '{}'
      });
    }
    setIsModalOpen(true);
    setError('');
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingServer(null);
    setError('');
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      let headersObj = {};
      try {
        headersObj = JSON.parse(formData.headers);
      } catch (e) {
        setError('Invalid JSON in headers field.');
        setLoading(false);
        return;
      }

      const payload = {
        name: formData.name,
        url: formData.url,
        headers: headersObj
      };

      if (editingServer) {
        await apiPut(`/api/mcp-servers/${editingServer._id}`, payload);
      } else {
        await apiPost('/api/mcp-servers', payload);
      }

      handleCloseModal();
      fetchMcpServers();
    } catch (err) {
      console.error('Failed to save MCP server:', err);
      setError(err.message || 'Failed to save MCP server.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (server) => {
    try {
      await apiPut(`/api/mcp-servers/${server._id}`, { enabled: !server.enabled });
      fetchMcpServers();
    } catch (err) {
      console.error('Failed to toggle MCP server:', err);
      setError('Failed to toggle MCP server.');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this MCP server?')) return;

    try {
      await apiDelete(`/api/mcp-servers/${id}`);
      fetchMcpServers();
    } catch (err) {
      console.error('Failed to delete MCP server:', err);
      setError('Failed to delete MCP server.');
    }
  };

  // AI Provider Handlers
  const handleOpenProviderModal = (provider = null) => {
    if (provider) {
      setEditingProvider(provider);
      setProviderFormData({
        name: provider.name,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey || '',
        models: (provider.models || []).join(', ')
      });
    } else {
      setEditingProvider(null);
      setProviderFormData({
        name: '',
        baseUrl: '',
        apiKey: '',
        models: ''
      });
    }
    setIsProviderModalOpen(true);
    setProviderError('');
  };

  const handleCloseProviderModal = () => {
    setIsProviderModalOpen(false);
    setEditingProvider(null);
    setProviderError('');
  };

  const handleProviderChange = (e) => {
    const { name, value } = e.target;
    setProviderFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleProviderSubmit = async (e) => {
    e.preventDefault();
    setProviderLoading(true);
    setProviderError('');

    try {
      const modelsArray = providerFormData.models
        .split(',')
        .map(m => m.trim())
        .filter(m => m.length > 0);

      const payload = {
        name: providerFormData.name,
        baseUrl: providerFormData.baseUrl,
        apiKey: providerFormData.apiKey,
        models: modelsArray
      };

      if (editingProvider) {
        await apiPut(`/api/ai-providers/${editingProvider._id}`, payload);
      } else {
        await apiPost('/api/ai-providers', payload);
      }

      handleCloseProviderModal();
      if (onAiProvidersChange) onAiProvidersChange();
    } catch (err) {
      console.error('Failed to save AI provider:', err);
      setProviderError(err.message || 'Failed to save AI provider.');
    } finally {
      setProviderLoading(false);
    }
  };

  const handleToggleProvider = async (provider) => {
    try {
      await apiPut(`/api/ai-providers/${provider._id}`, { enabled: !provider.enabled });
      if (onAiProvidersChange) onAiProvidersChange();
    } catch (err) {
      console.error('Failed to toggle AI provider:', err);
      setError('Failed to toggle AI provider.');
    }
  };

  const handleDeleteProvider = async (id) => {
    if (!window.confirm('Are you sure you want to delete this AI provider?')) return;
    try {
      await apiDelete(`/api/ai-providers/${id}`);
      if (onAiProvidersChange) onAiProvidersChange();
    } catch (err) {
      console.error('Failed to delete AI provider:', err);
      setProviderError('Failed to delete AI provider.');
    }
  };

  return (
    <div className="settings-container">
      <div className="settings-group">
        <h3>Theme</h3>
        <div className="pill-group">
          {['light', 'subtle-dark', 'high-contrast'].map(t => (
            <button
              key={t}
              className={`pill-btn ${theme === t ? 'active' : ''}`}
              onClick={() => { setTheme(t); localStorage.setItem('theme', t); }}
            >
              {t === 'light' ? 'Light' : t === 'subtle-dark' ? 'Subtle Dark' : 'High-Contrast'}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-group">
        <h3>Sidebar Position</h3>
        <div className="pill-group">
          {['left', 'right'].map(pos => (
            <button
              key={pos}
              className={`pill-btn ${sidebarPosition === pos ? 'active' : ''}`}
              onClick={() => { setSidebarPosition(pos); localStorage.setItem('sidebarPosition', pos); }}
            >
              {pos.charAt(0).toUpperCase() + pos.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <hr className="settings-divider" />

      <div className="settings-header">
        <h2>MCP Servers</h2>
        <button className="btn-primary" onClick={() => handleOpenModal()}>
          Add New Server
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="mcp-servers-list">
        {mcpServers.length === 0 ? (
          <p className="empty-state">No MCP servers configured. Add one to get started.</p>
        ) : (
          mcpServers.map(server => (
            <div key={server._id} className={`mcp-server-card ${server.enabled === false ? 'mcp-disabled' : ''}`}>
              <div className="mcp-server-info">
                <div className="mcp-server-header">
                  <h3>{server.name}</h3>
                  <label className="toggle-switch" title={server.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}>
                    <input
                      type="checkbox"
                      checked={server.enabled !== false}
                      onChange={() => handleToggle(server)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <p className="mcp-url">{server.url}</p>
                {Object.keys(server.headers || {}).length > 0 && (
                  <p className="mcp-headers">
                    Headers: {JSON.stringify(server.headers)}
                  </p>
                )}
              </div>
              <div className="mcp-server-actions">
                <button className="btn-secondary" onClick={() => handleOpenModal(server)}>
                  Edit
                </button>
                <button className="btn-danger" onClick={() => handleDelete(server._id)}>
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <hr className="settings-divider" />

      <div className="settings-header">
        <h2>AI Providers</h2>
        <button className="btn-primary" onClick={() => handleOpenProviderModal()}>
          Add New Provider
        </button>
      </div>

      {providerError && <div className="error-message">{providerError}</div>}

      <div className="mcp-servers-list">
        {aiProviders.length === 0 ? (
          <p className="empty-state">No AI providers configured. Add one to get started, or the system will use the default LLAMA_ENDPOINT from environment.</p>
        ) : (
          aiProviders.map(provider => (
            <div key={provider._id} className={`mcp-server-card ${provider.enabled === false ? 'mcp-disabled' : ''}`}>
              <div className="mcp-server-info">
                <div className="mcp-server-header">
                  <h3>{provider.name}</h3>
                  <label className="toggle-switch" title={provider.enabled ? 'Enabled' : 'Disabled'}>
                    <input
                      type="checkbox"
                      checked={provider.enabled !== false}
                      onChange={() => handleToggleProvider(provider)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <p className="mcp-url">{provider.baseUrl}</p>
                {provider.models && provider.models.length > 0 && (
                  <p className="mcp-headers">Models: {provider.models.join(', ')}</p>
                )}
                {provider.apiKey && (
                  <p className="mcp-headers">API Key: {'*'.repeat(Math.min(20, provider.apiKey.length))}</p>
                )}
              </div>
              <div className="mcp-server-actions">
                <button className="btn-secondary" onClick={() => handleOpenProviderModal(provider)}>
                  Edit
                </button>
                <button className="btn-danger" onClick={() => handleDeleteProvider(provider._id)}>
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {isProviderModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>{editingProvider ? 'Edit AI Provider' : 'Add New AI Provider'}</h3>
            <form onSubmit={handleProviderSubmit}>
              <div className="form-group">
                <label htmlFor="provider-name">Name</label>
                <input
                  type="text"
                  id="provider-name"
                  name="name"
                  value={providerFormData.name}
                  onChange={handleProviderChange}
                  required
                  placeholder="e.g., DeepSeek, OpenAI, Local"
                />
              </div>
              <div className="form-group">
                <label htmlFor="provider-baseUrl">Base URL</label>
                <input
                  type="text"
                  id="provider-baseUrl"
                  name="baseUrl"
                  value={providerFormData.baseUrl}
                  onChange={handleProviderChange}
                  required
                  placeholder="e.g., https://api.deepseek.com/v1"
                />
              </div>
              <div className="form-group">
                <label htmlFor="provider-apiKey">API Key</label>
                <input
                  type="password"
                  id="provider-apiKey"
                  name="apiKey"
                  value={providerFormData.apiKey}
                  onChange={handleProviderChange}
                  placeholder="sk-..."
                />
              </div>
              <div className="form-group">
                <label htmlFor="provider-models">Models (comma-separated)</label>
                <input
                  type="text"
                  id="provider-models"
                  name="models"
                  value={providerFormData.models}
                  onChange={handleProviderChange}
                  placeholder="e.g., deepseek-chat, deepseek-reasoner"
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={handleCloseProviderModal}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={providerLoading}>
                  {providerLoading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>{editingServer ? 'Edit MCP Server' : 'Add New MCP Server'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="name">Name</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  placeholder="e.g., My Custom Tool Server"
                />
              </div>
              <div className="form-group">
                <label htmlFor="url">URL</label>
                <input
                  type="text"
                  id="url"
                  name="url"
                  value={formData.url}
                  onChange={handleChange}
                  required
                  placeholder="e.g., http://localhost:3002/mcp"
                />
              </div>
              <div className="form-group">
                <label htmlFor="headers">Headers (JSON)</label>
                <textarea
                  id="headers"
                  name="headers"
                  value={formData.headers}
                  onChange={handleChange}
                  rows={4}
                  placeholder='{"Authorization": "Bearer token"}'
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={handleCloseModal}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings;
