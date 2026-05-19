// --- Helper: Update System Prompt with Timestamp ---
export function generateSystemPrompt(state, messages, timezone = 'Australia/Sydney') {
  const now = new Date();

  const dateOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: timezone
  };

  const timeOptions = {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
    hour12: true
  };

  const dateStr = now.toLocaleDateString('en-AU', dateOptions);
  const timeStr = now.toLocaleTimeString('en-AU', timeOptions);

  const creationTimeStamp = `The start of the conversation commenced when date was ${dateStr} and the time was ${timeStr} (${timezone}).`;
  const timestampContent = `The current date is ${dateStr} and the time is ${timeStr} (${timezone}).`;

  const systemIndex = messages.findIndex(msg => msg.role === 'system');

  if (systemIndex === -1) {
    messages.unshift({ role: 'system', content: creationTimeStamp });
    return messages;
  }

  let existingContent = messages[systemIndex].content;

  // CLEANUP: Remove old timestamp lines
  const lines = existingContent.split('\n');
  const filteredLines = lines.filter(line => !line.trim().startsWith('The current date is'));
  existingContent = filteredLines.join('\n');

  if (state === 'new') {
    // Keep start time, ensure no current time is present yet if desired, 
    // but usually we just append current time in 'old' state.
  } else {
    // Update current time
    existingContent = existingContent.trim() + '\n\n' + timestampContent;
  }

  messages[systemIndex].content = existingContent;
  console.log(`Messages: ${JSON.stringify(messages)}`)
  return messages;
}
