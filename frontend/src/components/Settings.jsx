import React, { useState, useEffect } from 'react';
import axios from 'axios';

function Settings({ token }) {
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

  useEffect(() => {
    fetchMcpServers();
  }, []);

  const fetchMcpServers = async () => {
    try {
      const res = await axios.get('/api/mcp-servers', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMcpServers(res.data);
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
        await axios.put(`/api/mcp-servers/${editingServer._id}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        await axios.post('/api/mcp-servers', payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }

      handleCloseModal();
      fetchMcpServers();
    } catch (err) {
      console.error('Failed to save MCP server:', err);
      setError(err.response?.data?.error || 'Failed to save MCP server.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this MCP server?')) return;

    try {
      await axios.delete(`/api/mcp-servers/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchMcpServers();
    } catch (err) {
      console.error('Failed to delete MCP server:', err);
      setError('Failed to delete MCP server.');
    }
  };

  return (
    <div className="settings-container">
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
            <div key={server._id} className="mcp-server-card">
              <div className="mcp-server-info">
                <h3>{server.name}</h3>
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
