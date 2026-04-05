import { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [input, setInput] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!input) return;
    setLoading(true);
    setResponse('');
    try {
      const res = await axios.post('http://localhost:3001/api/chat', { message: input });
      setResponse(res.data.reply);
    } catch (error) {
      setResponse('Error connecting to backend.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <h1>AI Assistant (Local Llama)</h1>
      <div className="chat-box">
        {response && <div className="bot-message">{response}</div>}
        {loading && <div className="loading">Thinking...</div>}
      </div>
      <div className="input-area">
        <input 
          type="text" 
          value={input} 
          onChange={(e) => setInput(e.target.value)} 
          placeholder="Ask about your schedule or email..."
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
        />
        <button onClick={sendMessage} disabled={loading}>Send</button>
      </div>
      <p className="footer">Connected to Local LLM via Node 24</p>
    </div>
  );
}

export default App;