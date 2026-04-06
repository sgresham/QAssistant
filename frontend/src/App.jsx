import { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [modelMode, setModelMode] = useState('auto'); // 'auto', 'thinker', 'reflex'
  const [lastModel, setLastModel] = useState('');
  
  // Initialize chat history with a casual system prompt
  const [chatHistory, setChatHistory] = useState([
    { role: 'system', content: 'Hey there! I\'m your AI assistant. What\'s up?' }
  ]);

  const sendMessage = async () => {
    if (!input.trim()) return;
    
    const userMessage = { role: 'user', content: input };
    
    // Optimistically update UI with user message
    setChatHistory((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setLastModel('');

    try {
      const res = await axios.post('http://localhost:3001/api/chat', { 
        messages: [...chatHistory, userMessage],
        modelPreference: modelMode
      });
      
      const assistantMessage = { role: 'assistant', content: res.data.reply };
      setChatHistory((prev) => [...prev, assistantMessage]);
      setLastModel(res.data.modelUsed);
    } catch (error) {
      const errorMessage = { role: 'assistant', content: `Error: ${error.message}` };
      setChatHistory((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <h1>AI Assistant (Dual-Brain)</h1>
      
      {/* Model Selector */}
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
  );
}

export default App;
