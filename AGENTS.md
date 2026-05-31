# QAssistant — Agent Instructions

## Dev Commands

```
npm run start:dev        # Installs deps + runs backend (nodemon) + frontend (vite) concurrently
npm run backend:dev      # Backend only (nodemon, watches backend/src)
npm run frontend         # Frontend only (vite dev server)
```

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
| `db.js` | Mongoose schemas: User, Folder, Conversation, McpServer |
| `auth.js` | User model, JWT auth middleware, register/login/googleLogin |
| `conversations.js` | Chat CRUD + `/api/chat` SSE streaming endpoint with tool execution loop |
| `folders.js` | Folder CRUD (create/update/delete), systemPrompt support |
| `generatePrompt.js` | Builds LLM payload: merges system prompt, memory context, tools, temp metadata |
| `tools.js` | Built-in tool definitions + executor |
| `mcpClient.js` | MCP client: fetches tools from remote MCP servers, executes MCP tools |
| `mcpServers.js` | CRUD for user-configured MCP server connections |

### Frontend entrypoint
`frontend/src/main.jsx` → `App.jsx` (single-page, state-driven views)

### Frontend components
| Component | Purpose |
|---|---|
| `App.jsx` | Top-level state: auth, conversations, folders, chat history, streaming |
| `Login.jsx` | Login form (email/password + Google OAuth) |
| `Sidebar.jsx` | Conversation list, folder management, new chat |
| `MainChat.jsx` | Chat UI, message input, SSE streaming display |
| `Settings.jsx` | User settings view |
| `MarkdownRenderer.jsx` | Markdown + syntax highlighting for AI responses |

## Data Flow

1. User sends message → `App.jsx` POSTs to `/api/chat` with full message history
2. Backend resolves folder `systemPrompt`, fetches Honcho memory context, loads MCP tools
3. `buildLlmPayload()` assembles a single system message + history + tools
4. Streams LLM response via SSE. If LLM requests tool calls, executes them (local or MCP) in a loop (max 5 iterations)
5. Saves conversation to MongoDB, syncs to Honcho for memory

## Auth

- JWT tokens, 24h expiry, stored in `localStorage`
- All `/api/*` routes require `Bearer <token>` except `/api/auth/*`
- Default admin: email `admin`, password `admin` (created on startup if not exists)
- Google OAuth supported via `google-auth-library` backend + `@react-oauth/google` frontend

## Environment Variables

Required in root `.env`:
- `MONGODB_URI` — MongoDB connection string
- `JWT_SECRET` — JWT signing secret
- `LLAMA_ENDPOINT` — LLM API base URL (default `http://10.10.10.30:8888/v1`)
- `THINKER_MODEL`, `REFLEX_MODEL` — model names for routing
- `HONCHO_API_KEY`, `HONCHO_API_URL` — Honcho memory SDK
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — Google OAuth
- `VITE_GOOGLE_CLIENT_ID` — Frontend Google OAuth client ID
- `VITE_API_IP`, `VITE_API_PORT`, `VITE_HTTPS_ENABLED` — Frontend API config

`.env` is loaded from the **root** directory by both `backend/src/db.js` and `backend/src/conversations.js` (resolve up one level from `src/`).

## Gotchas

- **Folder schema**: `systemPrompt` field added to `FolderSchema` in `db.js`. Routes in `folders.js` already handle it. Conversations pick up the folder's system prompt on creation (`conversations.js:createConversation`) and during chat (`conversations.js:chat`).
- **No `PUT /api/folders/:id` route**: `updateFolder` exists in `folders.js` but is NOT registered in `index.js`. Only `GET`, `POST`, `DELETE` are wired up. Add `app.put('/api/folders/:id', authenticateToken, updateFolder)` if needed.
- **User model defined in `auth.js`**, not `db.js`. The `User` model is not exported from `db.js`. Other files import it from `auth.js` indirectly or define their own reference.
- **`auth.js:153` bug**: `newUser` is referenced but should be `user` in the Google login else branch.
- **Mongoose schemas in two files**: `User` is in `auth.js`, everything else in `db.js`. Keep this in mind when modifying models.
- **ES modules throughout**: All `.js` files use `import`/`export`. No CommonJS.
- **No tests configured**: `backend/package.json` test script is a placeholder.
- **Docker Compose**: `docker-compose.yml` defines frontend + backend services. Nginx and Certbot are commented out.
