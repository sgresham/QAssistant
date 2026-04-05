import { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [input, setInput] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [modelMode, setModelMode] = useState('auto'); // 'auto', 'thinker', 'reflex'
  const [lastModel, setLastModel] = useState('');

  const sendMessage = async () => {
    if (!input) return;
    setLoading(true);
    setResponse('');
    try {
      const res = await axios.post('http://localhost:3001/api/chat', { 
        message: input,
        modelPreference: modelMode
      });
      
      setResponse(res.data.reply);
      setLastModel(res.data.modelUsed);
    } catch (error) {
      setResponse(`Error: ${error.message}`);
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
        {response && <div className="bot-message">{response}</div>}
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