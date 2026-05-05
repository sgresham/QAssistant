import { Conversation, Folder, dbConnected } from './db.js';
import axios from 'axios';
import { Honcho } from "@honcho-ai/sdk";
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose'; // <--- ADDED IMPORT

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

// --- Tool Definitions ---
const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_infrastructure_health",
      description: "Checks the health status of critical infrastructure components (Backend, Database).",
      parameters: {
        type: "object",
        properties: {
          component: {
            type: "string",
            enum: ["backend", "database", "all"],
            description: "Which component to check. Default is 'all'."
          }
        },
        required: ["component"]
      }
    }
  }
];

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

// --- Helper: Execute Tool Logic ---
async function executeTool(toolName, toolArgs) {
  if (toolName === "get_infrastructure_health") {
    const component = toolArgs.component || "all";
    const results = {};

    try {
      // 1. Check Backend
      results.backend = {
        status: "online",
        message: "Express server is responding."
      };

      // 2. Check Database
      if (mongoose.connection.readyState !== 1) {
        results.database = {
          status: "disconnected",
          message: "MongoDB connection is not active."
        };
      } else {
        try {
          await mongoose.connection.db.admin().ping();
          results.database = {
            status: "healthy",
            message: "MongoDB is connected and responding to pings."
          };
        } catch (err) {
          results.database = {
            status: "error",
            message: `MongoDB ping failed: ${err.message}`
          };
        }
      }

      let finalOutput = (component === "all") ? results : { [component]: results[component] };
      return JSON.stringify(finalOutput, null, 2);

    } catch (error) {
      return `Error checking infrastructure: ${error.message}`;
    }
  } else {
    return `Error: Unknown tool '${toolName}'`;
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

    // --- Honcho Context Injection ---
    const assistant = await honcho.peer("q");
    const user = await honcho.peer(userId);
    const session = await honcho.session(honchoSessionID);
    await session.addPeers(user, assistant);
    await session.setPeerConfiguration(user, { observeOthers: true, observeMe: true });
    await session.setPeerConfiguration("q", { observeOthers: true, observeMe: false });

    const context = await session.context({ summary: true, tokens: 1500, peerTarget: userId });
    const openaiMessages = context.toOpenAI(assistant);

    // FIXED: Safer injection logic
    const systemPrompt = messageHistory[0];
    const restOfHistory = messageHistory.slice(1);
    messageHistory = [systemPrompt, ...openaiMessages, ...restOfHistory];

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
        if (toolCalls.length > 0) {
          // FIXED: Push assistant message with BOTH content (if any) and tool calls
          currentMessagesForLlm.push({
            role: "assistant",
            content: accumulatedContent || null,
            tool_calls: toolCalls.map(tc => ({
              id: tc.id,
              type: "function",
              function: { name: tc.function.name, arguments: tc.function.arguments }
            }))
          });

          for (const tc of toolCalls) {
            let toolResult;
            try {
              // 1. Clean the string: Remove any potential whitespace or weird artifacts 
              // that might have been picked up during the stream
              const cleanArgs = tc.function.arguments.trim();

              // 2. Parse it locally first to ensure it's valid
              const args = JSON.parse(cleanArgs || '{}');

              // 3. Execute
              toolResult = await executeTool(tc.function.name, args);
            } catch (err) {
              console.error(`Malformed JSON from LLM: "${tc.function.arguments}"`);
              toolResult = `Error: The tool arguments were not valid JSON. Please try again.`;
            }

            currentMessagesForLlm.push({
              role: "tool",
              tool_call_id: tc.id,
              content: toolResult
            });
          }
          // Continue while loop to let LLM process tool results
        } else {
          // No tools, final content received
          finalResponse = accumulatedContent;
          if (finalResponse) {
            currentMessagesForLlm.push({ role: "assistant", content: finalResponse });
          }
          break; // Exit tool loop
        }

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
      const session = await honcho.session(honchoSessionID);
      const assistantPeer = await honcho.peer("q");
      const userPeer = await honcho.peer(userId);
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