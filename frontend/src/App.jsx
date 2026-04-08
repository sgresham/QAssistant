import { useState, useEffect } from 'react';
import axios from 'axios';
import Sidebar from './components/Sidebar';
import MainChat from './components/MainChat';
import './App.css';

// Determine API URL dynamically based on environment variables
const isHttps = import.meta.env.VITE_HTTPS_ENABLED === 'true';
const apiIp = import.meta.env.VITE_API_IP || 'localhost';
const apiPort = import.meta.env.VITE_API_PORT || '3001';
const API_URL = `${isHttps ? 'https' : 'http'}://${apiIp}:${apiPort}`;

function App() {
  const [loading, setLoading] = useState(false);
  const [modelMode, setModelMode] = useState('auto');
  const [lastModel, setLastModel] = useState('');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Conversation State
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [chatHistory, setChatHistory] = useState([
    { role: 'system', content: 'You are a helpful AI assistant.' }
  ]);

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

  const handleSendMessage = async (userMessage, currentModelMode, currentConvId, assistantMessageIndex, streamingRef) => {
    setLoading(true);
    setLastModel('');

    // Prepare payload
    const payload = {
      messages: [...chatHistory, userMessage],
      modelPreference: currentModelMode
    };

    if (currentConvId) {
      payload.conversationId = currentConvId;
    }

    try {
      // Add a placeholder for the assistant's response
      setChatHistory((prev) => [...prev, { role: 'assistant', content: '' }]);
      streamingRef.current = assistantMessageIndex;

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
                  newHistory[streamingRef.current] = {
                    ...newHistory[streamingRef.current],
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
        if (newHistory[streamingRef.current]?.role === 'assistant' && newHistory[streamingRef.current].content === '') {
          newHistory.pop();
        }
        return newHistory;
      });

      const errorMessage = { role: 'assistant', content: `Error: ${error.message}` };
      setChatHistory((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
      streamingRef.current = null;
    }
  };

  return (
    <div className="app-container">
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onNewChat={startNewChat}
        onLoadConversation={loadConversation}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />
      <MainChat
        chatHistory={chatHistory}
        setChatHistory={setChatHistory}
        modelMode={modelMode}
        setModelMode={setModelMode}
        activeConversationId={activeConversationId}
        onSendMessage={handleSendMessage}
        loading={loading}
        lastModel={lastModel}
      />
    </div>
  );
}

export default App;
