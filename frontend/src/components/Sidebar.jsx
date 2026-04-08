import React from 'react';
import '../App.css'; 

function Sidebar({ conversations, activeConversationId, onNewChat, onLoadConversation, onDeleteConversation, isCollapsed, onToggleCollapse }) {
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
            <div key={conv._id} className="chat-item-wrapper">
              <div
                className={`chat-item ${activeConversationId === conv._id ? 'active' : ''}`}
                onClick={() => onLoadConversation(conv._id)}
              >
                {conv.title}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteConversation(conv._id);
                }}
                className="delete-chat-btn"
                title="Delete Conversation"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Sidebar;
