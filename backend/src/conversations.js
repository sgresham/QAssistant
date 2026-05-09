import { Conversation, Folder, dbConnected } from './db.js';
import axios from 'axios';
import { Honcho } from "@honcho-ai/sdk";
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose'; // <--- ADDED IMPORT
import { TOOLS, executeTool } from './tools.js';

// 1. Set up __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 2. Load .env from the ROOT directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Configuration
const LLAMA_BASE_URL = process.env.LLAMA_ENDPOINT || 'http://10.10.10.30:8888/v1';
const LLM_TIMEOUT = parseInt(process.env.LLM_TIMEOUT, 10) || 600; // in seconds
const USER_TIMEZONE = 'Australia/Sydney'; // Or fetch from user profile
console.log(`DEBUG: LLM_TIMEOUT: ${LLM_TIMEOUT}`)

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

// --- Helper: Update System Prompt with Timestamp ---
function generateSystemPrompt(state, messages, timezone = 'Australia/Sydney') {
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
  return messages;
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

// 6. Chat Endpoint (Streaming with Tool Support)
export async function chat(req, res) {
  const { messages: incomingMessages, modelPreference = 'auto', conversationId } = req.body;
  const userId = req.user.id;

  // 1. Validate
  if (!incomingMessages || !Array.isArray(incomingMessages)) {
    return res.status(400).json({ error: 'Invalid messages' });
  }

  // 2. Start the Stream
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write(': keep-alive\n\n');

  const latestUserMessage = incomingMessages.slice().reverse().find(m => m.role === 'user');
  const currentInput = latestUserMessage ? latestUserMessage.content : '';

  let conversationDoc = null;
  let honchoSessionID = null;
  let messageHistory = []; // Initialized as array to prevent slice errors

  try {
    if (conversationId) {
      honchoSessionID = conversationId;
      conversationDoc = await Conversation.findOne({ _id: conversationId, userId }).populate('folderId', 'name systemPrompt');

      if (!conversationDoc) {
        res.write(`data: ${JSON.stringify({ error: 'Conversation not found' })}\n\n`);
        return res.end();
      }

      conversationDoc.messages.push(latestUserMessage);
      await conversationDoc.save();

      // FIXED: Removed 'let' to avoid shadowing
      messageHistory = [...conversationDoc.messages];
    } else {
      // New Conversation
      let systemContent = `You are a helpful AI assistant.`;
      let systemMessage = [{ role: 'system', content: systemContent }];
      const updatedMessageNew = generateSystemPrompt('old', systemMessage, USER_TIMEZONE);

      const newConv = new Conversation({
        title: currentInput.substring(0, 30) + (currentInput.length > 30 ? '...' : ''),
        userId,
        messages: updatedMessageNew
      });
      await newConv.save();
      conversationDoc = newConv;
      honchoSessionID = newConv._id;

      res.write(`data: ${JSON.stringify({ type: 'new_conversation', id: newConv._id })}\n\n`);

      // FIXED: Removed 'let' to avoid shadowing
      messageHistory = [...updatedMessageNew];
    }

    const session = await honcho.session(honchoSessionID);
    const assistantPeer = await honcho.peer("q");
    const userPeer = await honcho.peer(userId);

    // --- Honcho Context Injection ---
    const context = await session.context({ summary: true, tokens: 1500, peerTarget: userId });
    const openaiMessages = context.toOpenAI(assistantPeer);

    // 1. Extract primary system prompt
    const primarySystemPrompt = messageHistory.find(m => m.role === 'system') || { role: 'system', content: 'You are a helpful assistant.' };

    // 2. Prepare the History (exclude the system prompt for now)
    const sanitizedHistory = messageHistory.filter(m => m.role !== 'system');

    // 3. Prepare the Honcho Context as a string (stripping 'system' roles to avoid 500s)
    const contextText = openaiMessages
      .map(m => `[Memory]: ${m.content}`)
      .join("\n\n");

    // 4. ATTACH CONTEXT TO LATEST USER MESSAGE (Optimizes KV Cache)
    // We find the last user message and prepend the Honcho context to it.
    const lastUserIndex = sanitizedHistory.findLastIndex(m => m.role === 'user');

    if (lastUserIndex !== -1 && contextText) {
      const originalContent = sanitizedHistory[lastUserIndex].content;
      sanitizedHistory[lastUserIndex].content = `Relevant Context:\n${contextText}\n\n---\n\nUser Message: ${originalContent}`;
    }

    // 5. Final Reconstruction: [System] -> [Stable History with Context at the end]
    messageHistory = [
      primarySystemPrompt,
      ...sanitizedHistory
    ];

    // --- Routing Logic ---
    let selectedModel = MODELS.THINKER;
    if (modelPreference === 'reflex') selectedModel = MODELS.REFLEX;
    else if (modelPreference === 'thinker') selectedModel = MODELS.THINKER;
    else if (currentInput && currentInput.length < 20) selectedModel = MODELS.REFLEX;

    console.log(`[ROUTER] Using model: ${selectedModel}`);

    // --- Tool Use Loop ---
    let finalResponse = "";
    let maxToolCalls = 5;
    let currentMessagesForLlm = [...messageHistory];

    while (maxToolCalls > 0) {
      maxToolCalls--;

      try {
        const response = await axios.post(
          `${LLAMA_BASE_URL}/chat/completions`,
          {
            model: selectedModel,
            messages: currentMessagesForLlm,
            tools: TOOLS,
            stream: true,
            temperature: 0.7
          },
          {
            timeout: LLM_TIMEOUT * 1000,
            responseType: 'stream'
          }
        );

        const stream = response.data;
        const decoder = new TextDecoder();
        let accumulatedContent = "";
        let toolCalls = [];
        let isDone = false; // Flag for outer loop control

        for await (const chunk of stream) {
          if (isDone) break;
          const text = decoder.decode(chunk, { stream: true });
          const lines = text.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6).trim();
              if (dataStr === '[DONE]') {
                isDone = true;
                break;
              }
              try {
                const data = JSON.parse(dataStr);
                const delta = data.choices[0].delta;

                if (delta.tool_calls) {
                  delta.tool_calls.forEach(tc => {
                    if (!toolCalls[tc.index]) {
                      toolCalls[tc.index] = { id: tc.id, function: { name: tc.function.name, arguments: '' } };
                    } else {
                      toolCalls[tc.index].function.arguments += tc.function.arguments || '';
                    }
                  });
                } else if (delta.content) {
                  accumulatedContent += delta.content;
                  res.write(`data: ${JSON.stringify({ content: delta.content, model: selectedModel })}\n\n`);
                }
              } catch (e) { /* ignore chunk parse errors */ }
            }
          }
        }

        // --- Process Results ---
        // --- Inside the while loop, where you process results ---
        if (toolCalls.length > 0) {
          const formattedToolCalls = toolCalls.map(tc => {
            let rawArgs = (tc.function.arguments || '{}').trim();

            // Repair Qwen/Llama.cpp quirks (missing braces or extra quotes)
            if (rawArgs.startsWith('"') && rawArgs.endsWith('"') && rawArgs.length > 2) {
              rawArgs = rawArgs.substring(1, rawArgs.length - 1);
            }
            if (rawArgs.includes(':') && !rawArgs.startsWith('{')) rawArgs = '{' + rawArgs;
            if (rawArgs.startsWith('{') && !rawArgs.endsWith('}')) rawArgs = rawArgs + '}';

            try {
              JSON.parse(rawArgs);
            } catch (e) {
              console.error("STILL BAD JSON:", rawArgs);
              rawArgs = '{}';
            }

            return {
              id: tc.id || `call_${Date.now()}`,
              type: "function",
              function: { name: tc.function.name, arguments: rawArgs }
            };
          });

          // Push the assistant's intent to call tools. 
          // Note: use " " (space) if Mongoose 'required: true' is still failing on "".
          currentMessagesForLlm.push({
            role: "assistant",
            content: accumulatedContent.trim() || " ",
            tool_calls: formattedToolCalls
          });

          for (const tc of formattedToolCalls) {
            let toolResult;
            try {
              const args = JSON.parse(tc.function.arguments);
              toolResult = await executeTool(tc.function.name, args);
            } catch (err) {
              toolResult = `Error: ${err.message}`;
            }

            currentMessagesForLlm.push({
              role: "tool",
              tool_call_id: tc.id,
              content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)
            });
          }

          // IMPORTANT: Do NOT break here. The 'while' loop will restart and 
          // send the tool results back to the LLM for a final response.

        } else {
          // NO TOOLS CALLED: This is the final response.
          finalResponse = accumulatedContent;
          currentMessagesForLlm.push({
            role: "assistant",
            content: finalResponse || " "
          });
          break; // Exit the while loop
        }
        finalResponse = accumulatedContent;
        if (finalResponse) {
          currentMessagesForLlm.push({ role: "assistant", content: finalResponse });
        }
        break; // Exit tool loop



      } catch (error) {
        console.error("LLM Call Error:", error);
        throw error;
      }
    }

    // --- Save Final State ---
    if (conversationDoc) {
      conversationDoc.messages = currentMessagesForLlm;
      if (conversationDoc.messages.length <= 3) {
        conversationDoc.title = currentInput.substring(0, 30) + (currentInput.length > 30 ? '...' : '');
      }
      await conversationDoc.save();
    }

    // Update Honcho Session
    if (honchoSessionID) {
      await session.addMessages([
        userPeer.message(currentInput),
        assistantPeer.message(finalResponse)
      ]);
    }

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('CHAT ERROR:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: 'Stream interrupted: ' + error.message })}\n\n`);
      res.end();
    }
  }
}
