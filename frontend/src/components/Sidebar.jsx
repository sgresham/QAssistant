import React from 'react';
import '../App.css'; 

function Sidebar({ conversations, activeConversationId, onNewChat, onLoadConversation, isCollapsed, onToggleCollapse }) {
  return (
    <div className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <button onClick={onNewChat} className="new-chat-btn">
          {isCollapsed ? '+' : '+ New Chat'}
        </button>
        <button onClick={onToggleCollapse} className="toggle-sidebar-btn">
          {isCollapsed ? '>>' : '<<'}
        </button>
      </div>
      {!isCollapsed && (
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
      )}
    </div>
  );
}

export default Sidebar;
