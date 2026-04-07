import { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

// Determine API URL dynamically based on environment variables
// Vite exposes env vars via import.meta.env. They must be prefixed with VITE_
const isHttps = import.meta.env.VITE_HTTPS_ENABLED === 'true';
const apiIp = import.meta.env.VITE_API_IP || 'localhost';
const apiPort = import.meta.env.VITE_API_PORT || '3001';
const API_URL = `${isHttps ? 'https' : 'http'}://${apiIp}:${apiPort}`;

function App() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [modelMode, setModelMode] = useState('auto');
  const [lastModel, setLastModel] = useState('');

  // Conversation State
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [chatHistory, setChatHistory] = useState([
    { role: 'system', content: 'You are a helpful AI assistant.' }
  ]);

  // Fetch conversations on load
  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/conversations`);
      setConversations(res.data);
    } catch (error) {
      console.error("Failed to fetch conversations", error);
    }
  };

  const startNewChat = async () => {
    try {
      const res = await axios.post(`${API_URL}/api/conversations`);
      setActiveConversationId(res.data._id);
      setChatHistory([{ role: 'system', content: 'You are a helpful AI assistant.' }]);
      setLastModel('');
      setInput('');
    } catch (error) {
      console.error("Failed to start new chat", error);
    }
  };

  const loadConversation = async (id) => {
    try {
      const res = await axios.get(`${API_URL}/api/conversations/${id}`);
      setActiveConversationId(id);
      setChatHistory(res.data.messages);
      setLastModel('');
    } catch (error) {
      console.error("Failed to load conversation", error);
    }
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = { role: 'user', content: input };

    // Optimistic update
    setChatHistory((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setLastModel('');

    try {
      const payload = {
        messages: [...chatHistory, userMessage],
        modelPreference: modelMode
      };

      // Include conversationId if we are in an active session
      if (activeConversationId) {
        payload.conversationId = activeConversationId;
      }

      const res = await axios.post(`${API_URL}/api/chat`, payload);

      const assistantMessage = { role: 'assistant', content: res.data.reply };
      setChatHistory((prev) => [...prev, assistantMessage]);
      setLastModel(res.data.modelUsed);

      // If a new conversation was created by the backend, update the active ID
      if (res.data.conversationId && !activeConversationId) {
        setActiveConversationId(res.data.conversationId);
        fetchConversations(); // Refresh list
      }
    } catch (error) {
      const errorMessage = { role: 'assistant', content: `Error: ${error.message}` };
      setChatHistory((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <button onClick={startNewChat} className="new-chat-btn">+ New Chat</button>
        <div className="chat-list">
          {conversations.map((conv) => (
            <div
              key={conv._id}
              className={`chat-item ${activeConversationId === conv._id ? 'active' : ''}`}
              onClick={() => loadConversation(conv._id)}
            >
              {conv.title}
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="main-chat">
        <h1>AI Assistant (Dual-Brain)</h1>

        <div className="controls">
          <label>Model Strategy: </label>
          <select value={modelMode} onChange={(e) => setModelMode(e.target.value)}>
            <option value="auto">Auto (Smart Routing)</option>
            <option value="thinker">Qwen3.5-27B (High Intel)</option>
            <option value="reflex">Qwen3.5-0.8B (Fast Reflex)</option>
          </select>
        </div>

        <div className="chat-box">
          {chatHistory.map((msg, index) => (
            <div key={index} className={msg.role === 'user' ? 'user-message' : 'bot-message'}>
              {msg.role === 'system' ? null : <strong>{msg.role === 'user' ? 'You' : 'Assistant'}: </strong>}
              {msg.content}
            </div>
          ))}
          {lastModel && <div className="meta-info">Used: {lastModel}</div>}
          {loading && <div className="loading">Thinking...</div>}
        </div>

        <div className="input-area">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          />
          <button onClick={sendMessage} disabled={loading}>Send</button>
        </div>
      </div>
    </div>
  );
}

export default App;
