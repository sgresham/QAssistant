import React, { useRef, useEffect } from 'react';
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
  lastModel,
  aiProviders,
  activeProviderId,
  setActiveProviderId,
  activeModel,
  setActiveModel
}) {
  const [input, setInput] = React.useState('');
  const streamingMessageIndex = useRef(null);

  const textareaRef = useRef(null);
  // 1. Create a ref for the chat container
  const scrollContainerRef = useRef(null);

  // Auto-expand the textarea as the user types
  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  // 2. Auto-scroll effect
  useEffect(() => {
    if (scrollContainerRef.current) {
      // Scroll to the bottom immediately
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [chatHistory]);

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
        <label>Provider: </label>
        <select value={activeProviderId || ''} onChange={(e) => {
          const pid = e.target.value;
          setActiveProviderId(pid);
          const provider = aiProviders.find(p => p._id === pid);
          if (provider && provider.models.length > 0) {
            setActiveModel(provider.models[0]);
          } else {
            setActiveModel('');
          }
        }}>
          {aiProviders.filter(p => p.enabled !== false).length === 0 && (
            <option value="">Default (Env)</option>
          )}
          {aiProviders.filter(p => p.enabled !== false).map(p => (
            <option key={p._id} value={p._id}>{p.name}</option>
          ))}
        </select>
        {(() => {
          const provider = aiProviders.find(p => p._id === activeProviderId);
          if (provider && provider.models.length > 0) {
            return (
              <>
                <label>Model: </label>
                <select value={activeModel} onChange={(e) => setActiveModel(e.target.value)}>
                  {provider.models.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </>
            );
          }
          return null;
        })()}
      </div>

      <div 
        className="chat-box"
        // 3. Attach the ref to the container
        ref={scrollContainerRef}
      >
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
          ref={textareaRef} 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question..."
          disabled={loading}
          style={{
            resize: 'none', 
            minHeight: '40px',
            maxHeight: '150px', 
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