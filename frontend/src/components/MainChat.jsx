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

  const textareaRef = useRef(null);

  // Auto-expand the textarea as the user types
  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const handleSend = async () => {
    if (!input.trim()) return;

    // Pass only the message string to the handler in App.jsx
    // App.jsx will handle adding the message to chatHistory
    onSendMessage(input);
    setInput('');
  };

  // Helper for handling Enter key in textarea (Ctrl+Enter to send, Enter to newline)
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      // If you want Enter to send by default, remove the shift/ctrl check above
      // But standard UX for chat inputs is Ctrl+Enter to send.
      // If you strictly want Enter to send and Shift+Enter for newline:
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleSend();
      }
    }
  };

  return (
    <div className="main-chat">
      <h1>AI Assistant (Dual-Brain)</h1>

      <div className="controls">
        <label>Model Strategy: </label>
        <select value={modelMode} onChange={(e) => setModelMode(e.target.value)}>
          <option value="auto">Auto (Smart Routing)</option>
          <option value="thinker">(High Intel)</option>
          <option value="reflex">(Fast Reflex)</option>
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
        <textarea
          ref={textareaRef} // Add this
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question..."
          disabled={loading}
          style={{
            resize: 'none', // Disable manual resize if using auto-expand
            minHeight: '40px',
            maxHeight: '150px', // Cap the height
            padding: '8px',
            width: '100%',
            boxSizing: 'border-box',
            fontFamily: 'inherit'
          }}
        />
        <button onClick={handleSend} disabled={loading}>Send</button>
      </div>
    </div>
  );
}

export default MainChat;