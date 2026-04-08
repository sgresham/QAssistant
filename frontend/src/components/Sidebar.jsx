import React from 'react';
import '../App.css'; 

function Sidebar({ conversations, activeConversationId, onNewChat, onLoadConversation }) {
  return (
    <div className="sidebar">
      <button onClick={onNewChat} className="new-chat-btn">+ New Chat</button>
      <div className="chat-list">
        {conversations.map((conv) => (
          <div
            key={conv._id}
            className={`chat-item ${activeConversationId === conv._id ? 'active' : ''}`}
            onClick={() => onLoadConversation(conv._id)}
          >
            {conv.title}
          </div>
        ))}
      </div>
    </div>
  );
}

export default Sidebar;