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
            <div key={conv._id} style={{ position: 'relative' }}>
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
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: '#e74c3c',
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                  padding: '0 5px',
                  display: 'none'
                }}
                onMouseOver={(e) => e.currentTarget.style.display = 'block'}
                onMouseOut={(e) => e.currentTarget.style.display = 'none'}
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
