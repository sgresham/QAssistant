# QAssistant — Agent Instructions

## Dev Commands

```
npm run start:dev        # Installs deps + runs backend (nodemon) + frontend (vite) concurrently
npm run backend:dev      # Backend only (nodemon, watches backend/src)
npm run frontend         # Frontend only (vite dev server)
```

- **Requires Node 24+** (install via `nvm`, see [nvm-sh](https://github.com/nvm-sh/nvm))
- **Backend**: `localhost:3001` (Express 5, ES modules)
- **Frontend**: Vite dev server, proxies `/api` → `localhost:3001` (see `frontend/vite.config.js`)
- Run `npm install` in root, `backend/`, and `frontend/` — each has its own `package.json`

## Architecture

Monorepo with two packages:
- `backend/` — Express API, MCP server, MongoDB via Mongoose
- `frontend/` — React 19 SPA, Vite, no routing (single-page state-driven)

### Backend entrypoint
`backend/src/index.js` — all routes, MCP integration, server startup

### Key backend files
| File | Purpose |
|---|---|
| `db.js` | Mongoose schemas: User, Folder, Conversation, McpServer, AiProvider |
| `auth.js` | User model, JWT auth middleware, register/login/googleLogin |
| `conversations.js` | Chat CRUD + `/api/chat` SSE streaming endpoint with tool execution loop + AI provider resolution |
| `folders.js` | Folder CRUD (create/update/delete), systemPrompt support |
| `generatePrompt.js` | Builds LLM payload: merges system prompt, memory context, tools, temp metadata |
| `tools.js` | Built-in tool definitions + executor |
| `mcpClient.js` | MCP client: fetches tools from remote MCP servers, executes MCP tools |
| `mcpServers.js` | CRUD for user-configured MCP server connections |
| `aiProviders.js` | CRUD for user-configured AI provider connections (DeepSeek, OpenAI, etc.) |

### Frontend entrypoint
`frontend/src/main.jsx` → `App.jsx` (single-page, state-driven views)

### Frontend components
| Component | Purpose |
|---|---|
| `App.jsx` | Top-level state: auth, conversations, folders, AI providers, chat history, streaming |
| `Login.jsx` | Login form (email/password + Google OAuth) |
| `Sidebar.jsx` | Conversation list, folder management, new chat |
| `MainChat.jsx` | Chat UI, message input, SSE streaming display, provider/model selector |
| `Settings.jsx` | User settings: theme, sidebar position, MCP servers, AI providers |
| `MarkdownRenderer.jsx` | Markdown + syntax highlighting for AI responses |

## Data Flow

1. User sends message → `App.jsx` POSTs to `/api/chat` with full message history + selected `providerId` + `selectedModel`
2. Backend resolves folder `systemPrompt`, resolves AI provider config (base URL + API key from DB, or env fallback), fetches Honcho memory context, loads MCP tools
3. `buildLlmPayload()` assembles a single system message + history + tools
4. Streams LLM response via SSE (using provider's base URL/API key). If LLM requests tool calls, executes them (local or MCP) in a loop (max 5 iterations)
5. Saves conversation to MongoDB (with providerId/selectedModel), syncs to Honcho for memory

## Auth

- JWT tokens, 24h expiry, stored in `localStorage`
- All `/api/*` routes require `Bearer <token>` except `/api/auth/*`
- Default admin: email `admin`, password `admin` (created on startup if not exists)
- Google OAuth supported via `google-auth-library` backend + `@react-oauth/google` frontend

## Environment Variables

Single `.env` in the **root** directory. Loaded by:
- `backend/src/index.js`, `backend/src/db.js`, `backend/src/conversations.js` (via `dotenv`, path `../.env` from `src/`)
- Frontend via Vite's `envDir` config (only `VITE_*` vars exposed to browser)

Required variables:
- `API_IP`, `API_PORT` — backend server bind address
- `MONGODB_URI`, `MONGODB_DB` — MongoDB connection
- `JWT_SECRET` — JWT signing secret
- `LLAMA_ENDPOINT` — LLM API base URL (fallback if no DB provider configured)
- `THINKER_MODEL`, `REFLEX_MODEL` — model names for routing (fallback if no DB provider configured)
- `LLM_TIMEOUT` — LLM request timeout in seconds
- `HONCHO_API_KEY`, `HONCHO_API_URL` — Honcho memory SDK
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — Google OAuth backend
- `VITE_GOOGLE_CLIENT_ID` — Google OAuth frontend

## Gotchas

- **AI Providers (`aiProviders.js`)**: User-configured AI providers stored in DB (DeepSeek, OpenAI, local, etc.). Each stores `baseUrl`, `apiKey`, `models[]`. The chat endpoint resolves the provider by `providerId` from the request or conversation doc. If no provider is set, it falls back to `LLAMA_ENDPOINT` + `REFLEX_MODEL` env vars. The `Authorization: Bearer <apiKey>` header is only sent if `apiKey` is non-empty.
- **Conversation provider fields**: `providerId` (ObjectId ref `AiProvider`) and `selectedModel` (String) are stored on each conversation. Set on first message and persisted for subsequent turns.

- **Folder schema**: `systemPrompt` field added to `FolderSchema` in `db.js`. Routes in `folders.js` already handle it. Conversations pick up the folder's system prompt on creation (`conversations.js:createConversation`) and during chat (`conversations.js:chat`).
- **No `PUT /api/folders/:id` route**: `updateFolder` exists in `folders.js` but is NOT registered in `index.js`. Only `GET`, `POST`, `DELETE` are wired up. Add `app.put('/api/folders/:id', authenticateToken, updateFolder)` if needed.
- **User model defined in `auth.js`**, not `db.js`. The `User` model is not exported from `db.js`. Other files import it from `auth.js` indirectly or define their own reference.
- **`auth.js:153` bug**: `newUser` is referenced but should be `user` in the Google login else branch.
- **Mongoose schemas in two files**: `User` is in `auth.js`, everything else in `db.js`. Keep this in mind when modifying models.
- **ES modules throughout**: All `.js` files use `import`/`export`. No CommonJS.
- **No tests configured**: `backend/package.json` test script is a placeholder.
- **Docker Compose**: `docker-compose.yml` defines frontend + backend services. Nginx and Certbot are commented out.
