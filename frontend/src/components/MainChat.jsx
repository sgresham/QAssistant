import React, { useRef, useEffect, useState } from 'react';
import { FaVolumeUp, FaPause, FaPlay } from 'react-icons/fa';
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
  setActiveModel,
  ttsProviders,
  activeTtsProviderId,
  autoPlayTts,
  onAutoPlayTtsChange
}) {
  const [input, setInput] = useState('');
  const [speakingMsgIndex, setSpeakingMsgIndex] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const speakingRef = useRef(null);
  const audioRef = useRef(null);
  const abortRef = useRef(false);

  const textareaRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const prevLoadingRef = useRef(loading);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [chatHistory]);

  useEffect(() => {
    if (autoPlayTts && prevLoadingRef.current && !loading) {
      for (let i = chatHistory.length - 1; i >= 0; i--) {
        if (chatHistory[i].role === 'assistant' && chatHistory[i].content) {
          handleTtsClick(chatHistory[i].content, i);
          break;
        }
      }
    }
    prevLoadingRef.current = loading;
  }, [loading]);

  const stopTts = () => {
    abortRef.current = true;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    audioRef.current = null;
    speakingRef.current = null;
    setSpeakingMsgIndex(null);
    setIsPaused(false);
  };

  const resolveTtsProvider = () => {
    const enabled = ttsProviders.filter(p => p.enabled !== false);
    if (activeTtsProviderId) {
      const found = enabled.find(p => p._id === activeTtsProviderId);
      if (found) return found;
    }
    return enabled[0] || null;
  };

  const startTts = async (text, msgIndex) => {
    const token = localStorage.getItem('token');
    const provider = resolveTtsProvider();

    abortRef.current = false;
    speakingRef.current = msgIndex;
    setSpeakingMsgIndex(msgIndex);
    setIsPaused(false);

    try {
      const response = await fetch('/api/tts/speak', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          text,
          providerId: provider ? provider._id : null
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.error('TTS error:', err.error || response.status);
        stopTts();
        return;
      }

      const reader = response.body.getReader();
      const mediaSource = new MediaSource();
      const audio = new Audio();

      audioRef.current = audio;
      audio.src = URL.createObjectURL(mediaSource);

      mediaSource.addEventListener('sourceopen', async () => {
        const sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');

        while (!abortRef.current) {
          if (sourceBuffer.updating) {
            await new Promise(r => { sourceBuffer.onupdateend = r; });
          }
          const { done, value } = await reader.read();
          if (abortRef.current || done) {
            if (done && mediaSource.readyState === 'open') {
              mediaSource.endOfStream();
            }
            return;
          }
          sourceBuffer.appendBuffer(value);
        }
      });

      audio.onpause = () => setIsPaused(true);
      audio.onplay = () => setIsPaused(false);
      audio.onended = stopTts;
      audio.onerror = stopTts;

      await audio.play();
    } catch (error) {
      console.error('TTS playback error:', error);
      stopTts();
    }
  };

  const handleTtsClick = (text, index) => {
    if (speakingRef.current === index && audioRef.current) {
      if (audioRef.current.paused) {
        audioRef.current.play();
      } else {
        audioRef.current.pause();
      }
      return;
    }
    if (speakingRef.current !== null) {
      stopTts();
    }
    startTts(text, index);
  };

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage(input);
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      handleSend();
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

        <label style={{ marginLeft: 'auto' }}>
          <input
            type="checkbox"
            checked={autoPlayTts}
            onChange={(e) => onAutoPlayTtsChange(e.target.checked)}
            style={{ marginRight: '4px' }}
          />
          Auto-play TTS
        </label>
      </div>

      <div 
        className="chat-box"
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
            {msg.role === 'assistant' && msg.content && (
              <button
                className="tts-speaker-btn"
                onClick={() => handleTtsClick(msg.content, index)}
                title={
                  speakingMsgIndex === index
                    ? isPaused ? 'Resume' : 'Pause'
                    : 'Read aloud'
                }
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  marginTop: '8px',
                  opacity: speakingMsgIndex !== null && speakingMsgIndex !== index ? 0.4 : 0.7,
                  transition: 'opacity 0.2s'
                }}
              >
                {speakingMsgIndex === index
                  ? isPaused ? <FaPlay /> : <FaPause />
                  : <FaVolumeUp />
                }
              </button>
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
