import React, { useRef } from 'react';
import '../App.css';
import MarkdownRenderer from './MarkdownRenderer';

function MainChat({
  chatHistory,
  setChatHistory,
  modelMode,
  setModelMode,
  activeConversationId,
  onSendMessage,
  loading,
  lastModel
}) {
  const [input, setInput] = React.useState('');
  const streamingMessageIndex = useRef(null);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = { role: 'user', content: input };

    // Optimistic update: Add user message
    setChatHistory((prev) => [...prev, userMessage]);
    setInput('');
    
    // Pass only the message string to the handler in App.jsx
    onSendMessage(input);
  };

  return (
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
            {msg.role === 'system' ? null : (
              <strong style={{ display: 'block', marginBottom: '0.5rem' }}>
                {msg.role === 'user' ? 'You' : 'Assistant'}
              </strong>
            )}
            {msg.role === 'system' ? null : (
              <MarkdownRenderer content={msg.content} />
            )}
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
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          disabled={loading}
        />
        <button onClick={handleSend} disabled={loading}>Send</button>
      </div>
    </div>
  );
}

export default MainChat;
