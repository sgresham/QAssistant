import React, { useState } from 'react';
import '../App.css'; 

function Sidebar({ 
  conversations, 
  folders,
  activeConversationId, 
  onNewChat, 
  onLoadConversation, 
  onDeleteConversation,
  onRenameConversation,
  isCollapsed, 
  onToggleCollapse,
  onAddFolder,
  isAddingFolder,
  newFolderName,
  onNewFolderNameChange,
  onCreateFolder,
  onCancelAddFolder,
  onDeleteFolder,
  onMoveConversation
}) {
  
  // Group conversations by folder
  const groupedConversations = folders.reduce((acc, folder) => {
    acc[folder._id] = conversations.filter(c => c.folderId && c.folderId._id === folder._id);
    return acc;
  }, {});

  const ungroupedConversations = conversations.filter(c => !c.folderId);

  const handleNewChatInFolder = (folderId) => {
    onNewChat(folderId);
  };

  const handleDragStart = (e, convId) => {
    e.dataTransfer.setData('text/plain', convId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, targetFolderId) => {
    e.preventDefault();
    const convId = e.dataTransfer.getData('text/plain');
    if (convId) {
      onMoveConversation(convId, targetFolderId);
    }
  };

  const handleRename = (convId, newTitle) => {
    onRenameConversation(convId, newTitle);
  };

  return (
    <div className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <button onClick={() => onNewChat(null)} className="new-chat-btn">
          {isCollapsed ? '+' : '+ New Chat'}
        </button>
        <button onClick={onToggleCollapse} className="toggle-sidebar-btn">
          {isCollapsed ? '>>' : '<<'}
        </button>
      </div>

      {!isCollapsed && (
        <>
          <div className="folder-controls">
            <button onClick={onAddFolder} className="add-folder-btn">+ Folder</button>
            {isAddingFolder && (
              <div className="add-folder-form">
                <input
                  type="text"
                  placeholder="Folder name"
                  value={newFolderName}
                  onChange={(e) => onNewFolderNameChange(e.target.value)}
                  autoFocus
                />
                <div className="folder-form-actions">
                  <button onClick={onCreateFolder}>Create</button>
                  <button onClick={onCancelAddFolder}>Cancel</button>
                </div>
              </div>
            )}
          </div>

          <div className="chat-list">
            {/* Ungrouped Section */}
            <div 
              className="folder-section"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, null)}
            >
              <div className="folder-header">
                <span className="folder-name">📂 Ungrouped</span>
                <button onClick={() => handleNewChatInFolder(null)} className="new-in-folder-btn">+ New</button>
              </div>
              <div className="conv-list">
                {ungroupedConversations.map((conv) => (
                  <ConversationItem
                    key={conv._id}
                    conv={conv}
                    isActive={activeConversationId === conv._id}
                    currentFolderId={null}
                    onLoadConversation={onLoadConversation}
                    onDeleteConversation={onDeleteConversation}
                    onRenameConversation={handleRename}
                    onDragStart={handleDragStart}
                  />
                ))}
                {ungroupedConversations.length === 0 && <div className="empty-msg">No conversations</div>}
              </div>
            </div>

            {/* Folder Sections */}
            {folders.map((folder) => (
              <div 
                key={folder._id} 
                className="folder-section"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, folder._id)}
              >
                <div className="folder-header">
                  <span className="folder-name">📂 {folder.name}</span>
                  <div className="folder-actions">
                    <button onClick={() => handleNewChatInFolder(folder._id)} className="new-in-folder-btn">+ New</button>
                    <button onClick={() => onDeleteFolder(folder._id)} className="delete-folder-btn">🗑</button>
                  </div>
                </div>
                <div className="conv-list">
                  {groupedConversations[folder._id]?.map((conv) => (
                    <ConversationItem
                      key={conv._id}
                      conv={conv}
                      isActive={activeConversationId === conv._id}
                      currentFolderId={folder._id}
                      onLoadConversation={onLoadConversation}
                      onDeleteConversation={onDeleteConversation}
                      onRenameConversation={handleRename}
                      onDragStart={handleDragStart}
                    />
                  ))}
                  {(!groupedConversations[folder._id] || groupedConversations[folder._id].length === 0) && (
                    <div className="empty-msg">No conversations</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ConversationItem({ 
  conv, 
  isActive, 
  currentFolderId, 
  onLoadConversation, 
  onDeleteConversation, 
  onRenameConversation,
  onDragStart
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(conv.title);

  const handleSave = () => {
    if (editTitle.trim()) {
      onRenameConversation(conv._id, editTitle.trim());
    } else {
      setEditTitle(conv.title);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditTitle(conv.title);
      setIsEditing(false);
    }
  };

  return (
    <div
      className={`chat-item ${isActive ? 'active' : ''}`}
      onClick={() => onLoadConversation(conv._id)}
      draggable
      onDragStart={(e) => onDragStart(e, conv._id)}
    >
      <div className="conv-info">
        {isEditing ? (
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className="title-input"
            autoFocus
          />
        ) : (
          <span 
            className="conv-title" 
            onClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
            }}
          >
            {conv.title}
          </span>
        )}
      </div>
      <div className="conv-actions">
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
    </div>
  );
}

export default Sidebar;
