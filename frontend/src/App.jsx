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