import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './App.css';

// Determine API URL dynamically based on environment variables
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

  // Ref to track the current streaming message index
  const streamingMessageIndex = useRef(null);

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
    
    // Optimistic update: Add user message
    setChatHistory((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setLastModel('');

    // Prepare payload
    const payload = {
      messages: [...chatHistory, userMessage],
      modelPreference: modelMode
    };

    if (activeConversationId) {
      payload.conversationId = activeConversationId;
    }

    try {
      // Add a placeholder for the assistant's response
      const assistantMessageIndex = chatHistory.length; 
      setChatHistory((prev) => [...prev, { role: 'assistant', content: '' }]);
      streamingMessageIndex.current = assistantMessageIndex;

      // Use fetch for streaming support
      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let newConvId = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') continue;
            
            try {
              const data = JSON.parse(dataStr);
              
              if (data.type === 'new_conversation') {
                newConvId = data.id;
              } else if (data.content) {
                fullText += data.content;
                setLastModel(data.model || lastModel);
                
                // Update the specific message in the history
                setChatHistory((prev) => {
                  const newHistory = [...prev];
                  newHistory[streamingMessageIndex.current] = {
                    ...newHistory[streamingMessageIndex.current],
                    content: fullText
                  };
                  return newHistory;
                });
              } else if (data.error) {
                throw new Error(data.error);
              }
            } catch (e) {
              // Ignore parse errors for non-data lines
            }
          }
        }
      }

      // Handle new conversation ID if created
      if (newConvId && !activeConversationId) {
        setActiveConversationId(newConvId);
        fetchConversations();
      }

    } catch (error) {
      console.error("Streaming error:", error);
      // Remove the empty assistant message if error occurred
      setChatHistory((prev) => {
        const newHistory = [...prev];
        if (newHistory[streamingMessageIndex.current]?.role === 'assistant' && newHistory[streamingMessageIndex.current].content === '') {
          newHistory.pop();
        }
        return newHistory;
      });
      
      const errorMessage = { role: 'assistant', content: `Error: ${error.message}` };
      setChatHistory((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
      streamingMessageIndex.current = null;
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
          {lastModel && !loading && <div className="meta-info">Used: {lastModel}</div>}
          {loading && <div className="loading">Thinking...</div>}
        </div>

        <div className="input-area">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            disabled={loading}
          />
          <button onClick={sendMessage} disabled={loading}>Send</button>
        </div>
      </div>
    </div>
  );
}

export default App;
