/** generatePrompt.js **/

/**
 * Standardizes and compiles the full payload needed for the LLM request.
 * Normalizes, combines, and sorts tools deterministically to preserve prompt caching.
 */
export function buildLlmPayload({
  systemContent,
  messageHistory,
  contextMessages = [],
  localTools = [],
  mcpTools = [],
  timezone = 'Australia/Sydney'
}) {
  // 1. Locate or create base system prompt
  const finalSystemContent = systemContent || 'You are a helpful AI assistant.';
  
  // 2. Format Volatile Environmental Metadata
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: timezone });
  const timeStr = now.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: timezone, hour12: true });
  
  // 3. Inject Honcho Memory context and Temporal Context into the latest user turn
  let formattedHistory = [...messageHistory];
  const lastUserIndex = formattedHistory.findLastIndex(m => m.role === 'user');
  
  if (lastUserIndex !== -1 && contextMessages.length > 0) {
    const contextText = contextMessages.map(m => `[Memory]: ${m.content}`).join("\n\n");
    const originalContent = formattedHistory[lastUserIndex].content;
    
    formattedHistory[lastUserIndex].content = `Relevant Context:\n${contextText}\n\n` +
      `Current Temporal Context: ${dateStr}, ${timeStr} (${timezone})\n` +
      `---\n\nUser Message: ${originalContent}`;
  } else if (lastUserIndex !== -1) {
    const originalContent = formattedHistory[lastUserIndex].content;
    formattedHistory[lastUserIndex].content = `Current Time: ${dateStr}, ${timeStr} (${timezone})\n---\n\n${originalContent}`;
  }

  // 4. Combine and Sort all tools deterministically (Crucial for Prompt Caching)
  const combinedTools = [...localTools, ...mcpTools];
  const sortedTools = combinedTools.sort((a, b) => {
    const nameA = a.function?.name || '';
    const nameB = b.function?.name || '';
    return nameA.localeCompare(nameB);
  });

  // 5. Construct the final sequential message array
  const finalMessages = [
    { role: 'system', content: finalSystemContent },
    ...formattedHistory.filter(m => m.role !== 'system')
  ];

  return {
    messages: finalMessages,
    tools: sortedTools.length > 0 ? sortedTools : undefined
  };
}