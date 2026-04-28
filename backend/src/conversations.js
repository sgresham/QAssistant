import { Conversation, Folder, dbConnected } from './db.js';
import axios from 'axios';
import { Honcho } from "@honcho-ai/sdk";
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 1. Set up __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 2. Load .env from the ROOT directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Configuration
const LLAMA_BASE_URL = process.env.LLAMA_ENDPOINT || 'http://10.10.10.30:8888/v1';
const LLM_TIMEOUT = parseInt(process.env.LLM_TIMEOUT, 10) || 600; // in seconds
const USER_TIMEZONE = 'Australia/Sydney'; // Or fetch from user profile

// Define Model IDs
const MODELS = {
  THINKER: process.env.THINKER_MODEL,
  REFLEX: process.env.REFLEX_MODEL
};

// --- Honcho Setup ---
const honcho = new Honcho({
  apiKey: process.env.HONCHO_API_KEY,
  baseURL: process.env.HONCHO_API_URL,
  workspaceId: "Qtest",
});

let honchoSessionID = null;

/**
 * Updates the system message in the messages array with the current date/time.
 * If no system message exists, it creates one.
 * 
 * @param {Array} messages - The original messages array
 * @param {string} timezone - IANA timezone string (e.g., 'Australia/Sydney')
 * @returns {Array} The modified messages array with the fresh timestamp
 */
function generateSystemPrompt(state, messages, timezone = 'Australia/Sydney') {
  const now = new Date();

  // 1. Define the new timestamp string
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

  // Find the system message index
  const systemIndex = messages.findIndex(msg => msg.role === 'system');

  if (systemIndex === -1) {
    // If no system message exists yet, create one
    messages.unshift({ role: 'system', content: creationTimeStamp });
    return messages;
  }

  let existingContent = messages[systemIndex].content;

  // 2. CLEANUP: Remove old timestamp lines to prevent duplication
  // We look for lines starting with "The start of..." or "The current date is..."
  // and remove them. This ensures we only have the *latest* version.
  const lines = existingContent.split('\n');
  const filteredLines = lines.filter(line => {
    // Ignore lines that are timestamp definitions
    return !line.trim().startsWith('The current date is');
  });

  existingContent = filteredLines.join('\n');

  // 3. UPDATE: Add the new content based on state
  if (state === 'new') {
    // If it's a new conversation, we might want to keep the "start" line 
    // and ensure no "current" line exists, or vice versa depending on your logic.
    // Usually, "new" means we just set the start time.
    // We ensure the start time is present and the current time is NOT present (unless you want both).
    // Let's assume "new" sets the start time, and subsequent calls update the current time.

    // Re-add the start time if it was filtered out (it should be, but let's be safe)
    // if (!existingContent.includes('The start of the conversation')) {
    //   existingContent = existingContent.trim() + '\n\n' + creationTimeStamp;
    // }
  } else {
    // If not new, we update the "current date" line.
    // We remove any old "current date" line (handled by filter above) and add the new one.
    existingContent = existingContent.trim() + '\n\n' + timestampContent;
  }

  // 4. Assign the cleaned and updated content back
  messages[systemIndex].content = existingContent;

  return messages;
}

// --- Helper: Call Llama.cpp with Streaming ---
async function* streamLlama(model, messages, temperature = 0.7) {
  try {
    const response = await axios.post(
      `${LLAMA_BASE_URL}/chat/completions`,
      {
        model: model,
        messages: messages,
        temperature: temperature,
        stream: true // Enable streaming
      },
      {
        timeout: LLM_TIMEOUT * 1000,
        responseType: 'stream' // Important for axios to handle stream
      }
    );

    // Parse the stream chunks (llama.cpp sends "data: {...}" lines)
    const stream = response.data;
    const decoder = new TextDecoder();

    for await (const chunk of stream) {
      const text = decoder.decode(chunk, { stream: true });
      const lines = text.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6);
          if (dataStr === '[DONE]') {
            return; // End of stream
          }
          try {
            const data = JSON.parse(dataStr);
            if (data.choices && data.choices[0].delta?.content) {
              yield data.choices[0].delta.content;
            }
          } catch (e) {
            // Ignore malformed lines
          }
        }
      }
    }
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      throw new Error(`LLM request timed out after ${LLM_TIMEOUT} seconds.`);
    }
    throw new Error(`LLM failed: ${error.message}`);
  }
}

// 1. List all conversations (with folder info, filtered by user)
export async function getConversations(req, res) {
  try {
    if (!dbConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const userId = req.user.id;
    const conversations = await Conversation.find({ userId })
      .populate('folderId', 'name systemPrompt')
      .sort({ createdAt: -1 });
    res.json(conversations);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: error.message });
  }
}

// 2. Get a specific conversation (filtered by user)
export async function getConversation(req, res) {
  try {
    if (!dbConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const userId = req.user.id;
    const conversation = await Conversation.findOne({ _id: req.params.id, userId }).populate('folderId', 'name systemPrompt');
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    res.json(conversation);
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ error: error.message });
  }
}

// 3. Create a new conversation (assigned to user)
export async function createConversation(req, res) {
  try {
    if (!dbConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const { title = 'New Conversation', folderId = null } = req?.body || {};
    const userId = req.user.id;

    let systemContent = `You are a helpful AI assistant.`;

    // If a folder is specified, check for a custom system prompt
    if (folderId) {
      const folder = await Folder.findOne({ _id: folderId, userId: userId });
      if (folder && folder.systemPrompt) {
        systemContent = folder.systemPrompt;
      }
    }

    let systemMessage = [{ role: 'system', content: systemContent }];
    const messages = generateSystemPrompt('new', systemMessage, USER_TIMEZONE);

    const newConversation = new Conversation({
      title,
      folderId,
      userId,
      messages
    });
    await newConversation.save();
    res.json(newConversation);
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ error: error.message });
  }
}

// 4. Update conversation (e.g., move to folder or rename, only if owned by user)
export async function updateConversation(req, res) {
  try {
    if (!dbConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const { folderId, title } = req.body;
    const userId = req.user.id;

    const updateData = {};
    if (folderId !== undefined) updateData.folderId = folderId || null;
    if (title !== undefined) updateData.title = title;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid update data provided' });
    }

    const conversation = await Conversation.findOneAndUpdate(
      { _id: req.params.id, userId },
      updateData,
      { new: true }
    ).populate('folderId', 'name systemPrompt');

    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    res.json(conversation);
  } catch (error) {
    console.error('Error updating conversation:', error);
    res.status(500).json({ error: error.message });
  }
}

// 5. Delete a conversation (only if owned by user)
export async function deleteConversation(req, res) {
  try {
    if (!dbConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const userId = req.user.id;
    const result = await Conversation.findOneAndDelete({ _id: req.params.id, userId });
    if (!result) return res.status(404).json({ error: 'Conversation not found' });
    res.json({ message: 'Conversation deleted successfully' });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ error: error.message });
  }
}

// 6. Chat Endpoint (Streaming)
export async function chat(req, res) {
  const { messages, modelPreference = 'auto', conversationId } = req.body;
  const userId = req.user.id;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request: "messages" array is required.' });
  }

  const updatedMessage = generateSystemPrompt('old', messages, USER_TIMEZONE);
  // Extract latest user message
  const latestUserMessage = messages.slice().reverse().find(m => m.role === 'user');
  const currentInput = latestUserMessage ? latestUserMessage.content : '';

  // Routing Logic
  let selectedModel = MODELS.THINKER;
  if (modelPreference === 'reflex') selectedModel = MODELS.REFLEX;
  else if (modelPreference === 'thinker') selectedModel = MODELS.THINKER;
  else if (currentInput && currentInput.length < 20) selectedModel = MODELS.REFLEX;

  console.log(`[ROUTER] Using model: ${selectedModel}`);

  // Set headers for streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Prepare to save to DB after stream finishes
  let fullResponse = '';
  let conversationDoc = null;

  try {
    // If updating existing, load it now (ensure ownership)
    if (conversationId) {
      console.log(`Conversation ID: ${conversationId}`)
      honchoSessionID = conversationId;
      conversationDoc = await Conversation.findOne({ _id: conversationId, userId });
      if (!conversationDoc) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      // Add user message immediately
      conversationDoc.messages.push(latestUserMessage);
      await conversationDoc.save();
    }
    else {
      // Create new conversation if no ID provided
      let systemContent = `You are a helpful AI assistant.`;
      // Note: If creating a new conversation via chat endpoint without explicit folderId in body,
      // we default to the base prompt. If you want to support folder context here, 
      // you'd need to pass folderId in the request body.

      let systemMessage = [{ role: 'system', content: systemContent }];
      const updatedMessage = generateSystemPrompt('old', systemMessage, USER_TIMEZONE);

      const newConv = new Conversation({
        title: currentInput.substring(0, 30) + (currentInput.length > 30 ? '...' : ''),
        userId,
        messages: updatedMessage
      });
      await newConv.save();
      honchoSessionID = newConv._id;

      // Send the new ID as a final message
      res.write(`data: ${JSON.stringify({ type: 'new_conversation', id: newConv._id })}\n\n`);
    }

    // Add to Honcho
    const assistant = await honcho.peer("q");
    const user = await honcho.peer(userId);

    await honcho.peers();

    const session = await honcho.session(honchoSessionID, {
      config: {
        reasoning: { enabled: true },
        peer_card: { create: true, use: true },
        summary: {
          enabled: true,
          messages_per_short_summary: 15,
          messages_per_long_summary: 45
        }
      }
    });

    // HONCHO TIME
    await session.addPeers(user, assistant);
    await session.setPeerConfiguration(user, { observeOthers: true, observeMe: true });
    await session.setPeerConfiguration("q", { observeOthers: true, observeMe: false });
    const context = await session.context({ summary: true, tokens: 1500, peerTarget: userId });
    const openaiMessages = context.toOpenAI(assistant);
    // console.log(`Context from Honcho:  ${JSON.stringify(await session.context({summary: true, tokens: 1500, peerTarget: userId}))}`)
    // console.log(`Search from Honcho: ${JSON.stringify(await session.search("birthdays and action items"))}`)

    // unshift() accepts multiple arguments, so use spread to unpack the array
    updatedMessage.unshift(...openaiMessages);
    console.log(`updatedMessage: ${JSON.stringify(updatedMessage)}`)
    // Stream the response
    for await (const chunk of streamLlama(selectedModel, updatedMessage)) {
      fullResponse += chunk;
      // Send chunk to client in SSE format
      res.write(`data: ${JSON.stringify({ content: chunk, model: selectedModel })}\n\n`);
    }

    // Stream finished, save the full assistant message to DB

    conversationDoc.messages.push({ role: 'assistant', content: fullResponse });
    // Update title if it's the first user message
    if (conversationDoc.messages.length === 3) {
      conversationDoc.title = currentInput.substring(0, 30) + (currentInput.length > 30 ? '...' : '');
    }
    await conversationDoc.save();

    await session.addMessages([
      user.message(latestUserMessage.content),
      assistant.message(fullResponse),
    ]);
    // const status = await honcho.queueStatus();
    // console.log(`Honcho status: ${JSON.stringify(status)}`)
    console.log('Honcho Complete');


    // Signal end of stream
    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('Error in chat endpoint:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
}
