import { Conversation, Folder, dbConnected, McpServer } from './db.js';
import axios from 'axios';
import { Honcho } from "@honcho-ai/sdk";
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { TOOLS, executeTool } from './tools.js';
import { fetchMcpTools, executeMcpTool } from './mcpClient.js';
import { buildLlmPayload } from './generatePrompt.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const LLAMA_BASE_URL = process.env.LLAMA_ENDPOINT || 'http://10.10.10.30:8888/v1';
const LLM_TIMEOUT = parseInt(process.env.LLM_TIMEOUT, 10) || 600;
const USER_TIMEZONE = 'Australia/Sydney';

const MODELS = {
  THINKER: process.env.THINKER_MODEL,
  REFLEX: process.env.REFLEX_MODEL
};

const honcho = new Honcho({
  apiKey: process.env.HONCHO_API_KEY,
  baseURL: process.env.HONCHO_API_URL,
  workspaceId: "Qtest",
});

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
    if (!dbConnected) return res.status(503).json({ error: 'Database not connected' });

    const { title = 'New Conversation', folderId = null } = req?.body || {};
    const userId = req.user.id;
    let systemContent = `You are a helpful AI assistant.`;

    if (folderId) {
      const folder = await Folder.findOne({ _id: folderId, userId });
      if (folder && folder.systemPrompt) systemContent = folder.systemPrompt;
    }

    const newConversation = new Conversation({
      title,
      folderId,
      userId,
      messages: [{ role: 'system', content: systemContent }]
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

  if (!incomingMessages || !Array.isArray(incomingMessages)) {
    return res.status(400).json({ error: 'Invalid messages' });
  }

  // SSE Stream Initialization
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
  let baseSystemContent = "You are a helpful AI assistant.";

  try {
    // 1. DB Fetching & Hydration
    if (conversationId) {
      honchoSessionID = conversationId;
      conversationDoc = await Conversation.findOne({ _id: conversationId, userId }).populate('folderId', 'name systemPrompt');
      if (!conversationDoc) {
        res.write(`data: ${JSON.stringify({ error: 'Conversation not found' })}\n\n`);
        return res.end();
      }
      if (conversationDoc.folderId?.systemPrompt) {
        baseSystemContent = conversationDoc.folderId.systemPrompt;
      }
      conversationDoc.messages.push(latestUserMessage);
      await conversationDoc.save();
    } else {
      const newConv = new Conversation({
        title: currentInput.substring(0, 30) + (currentInput.length > 30 ? '...' : ''),
        userId,
        messages: [{ role: 'user', content: currentInput }]
      });
      await newConv.save();
      conversationDoc = newConv;
      honchoSessionID = newConv._id;
      res.write(`data: ${JSON.stringify({ type: 'new_conversation', id: newConv._id })}\n\n`);
    }

    // 2. Fetch Contextual Memories from Honcho
    const session = await honcho.session(honchoSessionID);
    const assistantPeer = await honcho.peer("q");
    const userPeer = await honcho.peer(userId);
    const context = await session.context({ summary: true, tokens: 1500, peerTarget: userId });
    const openaiMessages = context.toOpenAI(assistantPeer);

    // 3. Fetch Raw Toolsets from I/O layers (Keep asynchronous fetching here)
    let mcpTools = [];
    let mcpServers = [];
    try {
      mcpServers = await McpServer.find({ userId });
      for (const server of mcpServers) {
        const tools = await fetchMcpTools(server);
        mcpTools = [...mcpTools, ...tools];
      }
    } catch (error) {
      console.error('Error fetching MCP tools:', error);
    }

    // 4. Hand everything to generatePrompt to build a clean, sorted, cache-friendly object
    const { messages: preparedMessages, tools: preparedTools } = buildLlmPayload({
      systemContent: baseSystemContent,
      messageHistory: conversationDoc.messages,
      contextMessages: openaiMessages,
      localTools: TOOLS, // From your local imports
      mcpTools: mcpTools, // From your database async loop
      timezone: USER_TIMEZONE
    });

    // 5. Model Routing
    let selectedModel = MODELS.REFLEX;
    // if (modelPreference === 'reflex') selectedModel = MODELS.REFLEX;
    // else if (modelPreference === 'thinker') selectedModel = MODELS.THINKER;
    // else if (currentInput && currentInput.length < 20) selectedModel = MODELS.REFLEX;

    // 6. Tool-Execution Execution Loop
    let finalResponse = "";
    let maxToolCalls = 5;
    let currentMessagesForLlm = [...preparedMessages];

    while (maxToolCalls > 0) {
      maxToolCalls--;
      try {
        const response = await axios.post(
          `${LLAMA_BASE_URL}/chat/completions`,
          {
            model: selectedModel,
            messages: currentMessagesForLlm,
            tools: preparedTools,
            stream: true,
            temperature: 0.7
          },
          { timeout: LLM_TIMEOUT * 1000, responseType: 'stream' }
        );

        const stream = response.data;
        const decoder = new TextDecoder();
        let accumulatedContent = "";
        let toolCalls = [];
        let isDone = false;

        for await (const chunk of stream) {
          if (isDone) break;
          const text = decoder.decode(chunk, { stream: true });
          const lines = text.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6).trim();
              if (dataStr === '[DONE]') { isDone = true; break; }
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
              } catch (e) { }
            }
          }
        }

        if (toolCalls.length > 0) {
          res.write(`data: ${JSON.stringify({ type: 'tool_running', message: 'Processing...' })}\n\n`);
          const formattedToolCalls = toolCalls.map(tc => {
            let rawArgs = (tc.function.arguments || '{}').trim();
            if (rawArgs.startsWith('"') && rawArgs.endsWith('"')) rawArgs = rawArgs.substring(1, rawArgs.length - 1);
            try { JSON.parse(rawArgs); } catch (e) { rawArgs = '{}'; }
            return { id: tc.id || `call_${Date.now()}`, type: "function", function: { name: tc.function.name, arguments: rawArgs } };
          });

          currentMessagesForLlm.push({
            role: "assistant",
            content: accumulatedContent.trim() || " ",
            tool_calls: formattedToolCalls
          });

          for (const tc of formattedToolCalls) {
            let toolResult;
            try {
              const args = JSON.parse(tc.function.arguments);
              const mcpTool = mcpTools.find(t => t.function.name === tc.function.name);

              if (mcpTool) {
                let targetServer = null;
                for (const server of mcpServers) {
                  const serverTools = await fetchMcpTools(server);
                  if (serverTools.some(t => t.function.name === tc.function.name)) {
                    targetServer = server;
                    break;
                  }
                }
                toolResult = targetServer ? await executeMcpTool(targetServer, tc.function.name, args) : `Error: Server not found`;
              } else {
                toolResult = await executeTool(tc.function.name, args);
              }
            } catch (err) {
              toolResult = `Error: ${err.message}`;
            }

            currentMessagesForLlm.push({
              role: "tool",
              tool_call_id: tc.id,
              content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)
            });
          }
          continue;
        } else {
          finalResponse = accumulatedContent;
          currentMessagesForLlm.push({ role: "assistant", content: finalResponse || " " });
          break;
        }
      } catch (error) {
        console.error("LLM Call Error:", error);
        throw error;
      }
    }

    // 7. Post-Response State Sync
    if (conversationDoc) {
      conversationDoc.messages = currentMessagesForLlm;

      const isDefaultTitle = conversationDoc.title === 'New Conversation' ||
        conversationDoc.title === currentInput.substring(0, 30) + (currentInput.length > 30 ? '...' : '');

      if (isDefaultTitle && conversationDoc.messages.length > 1) {
        try {
          const titleContextMessages = conversationDoc.messages.slice(0, 2);
          const titlePrompt = [
            { role: "system", content: "You are a helpful assistant. Generate a short title (max 50 chars). No quotes." },
            { role: "user", content: `Generate title:\n\n${titleContextMessages.map(m => `[${m.role}]: ${m.content}`).join('\n')}` }
          ];

          const titleResponse = await axios.post(`${LLAMA_BASE_URL}/chat/completions`, {
            model: MODELS.REFLEX,
            messages: titlePrompt,
            temperature: 0.3,
            max_tokens: 50
          }, { timeout: 30000 });

          conversationDoc.title = titleResponse.data.choices[0].message.content.trim();
        } catch (e) {
          console.error('Title generation fallback invoked.');
        }
      }
      await conversationDoc.save();
    }

    if (honchoSessionID) {
      await session.addMessages([userPeer.message(currentInput), assistantPeer.message(finalResponse)]);
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