import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Sidebar from './components/Sidebar';
import MainChat from './components/MainChat';
import Login from './components/Login';
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
  
  // Auth State
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));

  // Conversation State
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [chatHistory, setChatHistory] = useState([
    { role: 'system', content: 'You are a helpful AI assistant.' }
  ]);

  // Folder State
  const [folders, setFolders] = useState([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [isAddingFolder, setIsAddingFolder] = useState(false);

  // Ref for streaming index
  const streamingRef = useRef(null);

  // Initialize Auth State
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser && token) {
      setUser(JSON.parse(storedUser));
    }
  }, [token]);

  // Configure Axios Interceptor for Auth
  useEffect(() => {
    const interceptor = axios.interceptors.request.use(
      (config) => {
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.request.eject(interceptor);
    };
  }, [token]);

  // Fetch Data when Authenticated
  useEffect(() => {
    if (user) {
      fetchConversations();
      fetchFolders();
    }
  }, [user]);

  const fetchConversations = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/conversations`);
      setConversations(res.data);
    } catch (error) {
      console.error("Failed to fetch conversations", error);
      if (error.response?.status === 401) {
        handleLogout();
      }
    }
  };

  const fetchFolders = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/folders`);
      setFolders(res.data);
    } catch (error) {
      console.error("Failed to fetch folders", error);
      if (error.response?.status === 401) {
        handleLogout();
      }
    }
  };

  const handleLogin = (userData, authToken) => {
    setUser(userData);
    setToken(authToken);
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setActiveConversationId(null);
    setChatHistory([{ role: 'system', content: 'You are a helpful AI assistant.' }]);
    setConversations([]);
    setFolders([]);
  };

  const startNewChat = async (folderId = null) => {
    try {
      const res = await axios.post(`${API_URL}/api/conversations`, { folderId });
      setActiveConversationId(res.data._id);
      setChatHistory([{ role: 'system', content: 'You are a helpful AI assistant.' }]);
      setLastModel('');
      await fetchConversations();
    } catch (error) {
      console.error("Failed to start new chat", error);
      if (error.response?.status === 401) handleLogout();
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
      if (error.response?.status === 401) handleLogout();
    }
  };

  const deleteConversation = async (id) => {
    if (!window.confirm("Are you sure you want to delete this conversation?")) {
      return;
    }

    try {
      await axios.delete(`${API_URL}/api/conversations/${id}`);
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setChatHistory([{ role: 'system', content: 'You are a helpful AI assistant.' }]);
      }
      await fetchConversations();
    } catch (error) {
      console.error("Failed to delete conversation", error);
      if (error.response?.status === 401) handleLogout();
    }
  };

  const renameConversation = async (id, newTitle) => {
    try {
      await axios.put(`${API_URL}/api/conversations/${id}`, { title: newTitle });
      await fetchConversations();
    } catch (error) {
      console.error("Failed to rename conversation", error);
      if (error.response?.status === 401) handleLogout();
    }
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await axios.post(`${API_URL}/api/folders`, { name: newFolderName });
      setNewFolderName('');
      setIsAddingFolder(false);
      await fetchFolders();
    } catch (error) {
      console.error("Failed to create folder", error);
      if (error.response?.status === 401) handleLogout();
    }
  };

  const deleteFolder = async (id) => {
    if (!window.confirm("Are you sure you want to delete this folder? Conversations inside will be ungrouped.")) {
      return;
    }
    try {
      await axios.delete(`${API_URL}/api/folders/${id}`);
      await fetchFolders();
    } catch (error) {
      console.error("Failed to delete folder", error);
      if (error.response?.status === 401) handleLogout();
    }
  };

  const moveConversation = async (convId, targetFolderId) => {
    try {
      await axios.put(`${API_URL}/api/conversations/${convId}`, { folderId: targetFolderId });
      await fetchConversations();
    } catch (error) {
      console.error("Failed to move conversation", error);
      if (error.response?.status === 401) handleLogout();
    }
  };

  const handleSendMessage = async (message) => {
    if (!message.trim() || !activeConversationId) return;

    const userMessage = { role: 'user', content: message };
    setChatHistory((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const messagesToSend = [...chatHistory, userMessage];
      
      const response = await axios.post(`${API_URL}/api/chat`, {
        conversationId: activeConversationId,
        messages: messagesToSend,
        modelMode: modelMode,
        lastModel: lastModel
      }, {
        responseType: 'stream'
      });

      let fullResponse = '';
      const reader = response.data.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const json = JSON.parse(line.slice(6));
              if (json.content) {
                fullResponse += json.content;
                console.log(`Full Response: ${fullResponse}`)
                setChatHistory((prev) => {
                  const newHistory = [...prev];
                  if (newHistory[newHistory.length - 1].role === 'assistant') {
                    newHistory[newHistory.length - 1].content = fullResponse;
                  } else {
                    newHistory.push({ role: 'assistant', content: fullResponse });
                  }
                  return newHistory;
                });
                if (json.model) {
                  setLastModel(json.model);
                }
              }
            } catch (e) {
              console.error("Error parsing stream chunk", e);
            }
          }
        }
      }

      // Update conversation title if it's the first user message
      const firstUserMsgIndex = messagesToSend.findIndex(m => m.role === 'user');
      if (firstUserMsgIndex === 0) {
        const title = message.slice(0, 30) + (message.length > 30 ? '...' : '');
        await axios.put(`${API_URL}/api/conversations/${activeConversationId}`, { title });
        await fetchConversations();
      }

    } catch (error) {
      console.error("Error sending message", error);
      if (error.response?.status === 401) {
        handleLogout();
      } else {
        setChatHistory((prev) => [...prev, { role: 'assistant', content: "Error: Could not connect to the AI service." }]);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="app-container">
      <Sidebar
        conversations={conversations}
        folders={folders}
        activeConversationId={activeConversationId}
        onNewChat={startNewChat}
        onLoadConversation={loadConversation}
        onDeleteConversation={deleteConversation}
        onRenameConversation={renameConversation}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        onMoveConversation={moveConversation}
        onAddFolder={() => setIsAddingFolder(true)}
        isAddingFolder={isAddingFolder}
        newFolderName={newFolderName}
        onNewFolderNameChange={setNewFolderName}
        onCreateFolder={createFolder}
        onCancelFolder={() => setIsAddingFolder(false)}
        onDeleteFolder={deleteFolder}
        user={user}
        onLogout={handleLogout}
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
        onLogout={handleLogout}
        user={user}
      />
    </div>
  );
}

export default App;
