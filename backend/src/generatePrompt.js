/** generatePrompt.js **/

/**
 * Standardizes and compiles the full payload needed for the LLM request.
 * Combines system prompts to comply with strict Jinja chat templates and maximize caching.
 */
export function buildLlmPayload({
  systemContent,
  messageHistory,
  contextMessages = [],
  localTools = [],
  mcpTools = [],
  timezone = 'Australia/Sydney'
}) {
  // 1. Locate base system prompt
  const baseSystem = systemContent || 'You are a helpful AI assistant.';
  
  // 2. Format Volatile Environmental Metadata
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: timezone });
  const timeStr = now.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: timezone, hour12: true });
  
  // 3. Combine Base System Prompt and Honcho Context into ONE single system text block
  let finalSystemContent = baseSystem;
  if (contextMessages.length > 0) {
    const contextText = contextMessages.map(m => `[Memory]: ${m.content}`).join("\n\n");
    finalSystemContent += `\n\n### RELEVANT USER CONTEXT/MEMORIES\nUse the following historical context to inform your responses:\n${contextText}`;
  }

  // 4. Clone, clean, and map history safely converting from Mongoose to Plain Objects
  let processedHistory = messageHistory
    .filter(m => m.role !== 'system') // Strip any accidental old systems out
    .map(m => {
      const plainMessage = typeof m.toObject === 'function' ? m.toObject() : m;
      return {
        role: plainMessage.role,
        content: plainMessage.content || " ", // Fallback space prevents tokenization drops
        ...(plainMessage.tool_calls && { tool_calls: plainMessage.tool_calls }),
        ...(plainMessage.tool_call_id && { tool_call_id: plainMessage.tool_call_id })
      };
    });

  // 5. Append Temporal Context ONLY to the absolute final user turn at the very end
  const lastUserIndex = processedHistory.findLastIndex(m => m.role === 'user');
  if (lastUserIndex !== -1) {
    const originalContent = processedHistory[lastUserIndex].content;
    processedHistory[lastUserIndex].content = `${originalContent}\n\n` + 
      `[Temporal Context: ${dateStr}, ${timeStr} (${timezone})]`;
  }

  // 6. Combine and Sort all tools deterministically
  const combinedTools = [...localTools, ...mcpTools];
  const sortedTools = combinedTools.sort((a, b) => {
    const nameA = a.function?.name || '';
    const nameB = b.function?.name || '';
    return nameA.localeCompare(nameB);
  });

  // 7. Construct final sequential message array
  // ALWAYS exactly one system message at the front.
  const finalMessages = [
    { role: 'system', content: finalSystemContent },
    ...processedHistory
  ];

  return {
    messages: finalMessages,
    tools: sortedTools.length > 0 ? sortedTools : undefined
  };
}