# QAssistant

A full-stack AI chat application with multi-user authentication, streaming LLM responses, tool execution, MCP integration, and long-term memory.

## Architecture

Monorepo with two packages:
- **`backend/`** — Express 5 API, MCP server/client, MongoDB via Mongoose
- **`frontend/`** — React 19 SPA, Vite, single-page state-driven (no router)

## Features

### Authentication
- JWT-based auth (24h token expiry, stored in `localStorage`)
- Email/password registration and login (bcrypt password hashing)
- Google OAuth via auth-code flow (`@react-oauth/google` frontend + `google-auth-library` backend)
- Default admin account: email `admin`, password `admin` (auto-created on startup)
- All `/api/*` routes protected with `Bearer <token>` middleware (except `/api/auth/*`)

### Chat & Conversations
- SSE streaming LLM responses with real-time display
- Tool execution loop (up to 5 iterations) — LLM can call tools, results feed back into the conversation
- Full conversation history stored in MongoDB per user
- Auto-generated conversation titles via LLM
- Three model modes: Auto, Thinker (high-intellect), Reflex (fast)
- System prompt snapshotting — each conversation stores a copy of its folder's system prompt at creation time, with SHA-256 hash for change detection

### Folder Management
- Organize conversations into named folders
- Per-folder custom system prompts that override the default
- Drag-and-drop conversations between folders
- Inline rename and delete with confirmation
- Folder names must be unique per user

### Tool System
- **Built-in tools:** `get_infrastructure_health` — checks backend and MongoDB connectivity
- **MCP tools:** Dynamically fetched from user-configured MCP servers at chat time, converted to OpenAI function-calling format, executed via `StreamableHTTPClientTransport`
- Tool results returned as JSON strings and fed back to the LLM in the execution loop

### MCP Integration
- **MCP Server (outbound):** QAssistant exposes its own MCP server at `POST /mcp` using Streamable HTTP transport, with session management. Exposes `get_system_status` and `get_infrastructure_health` tools to external clients.
- **MCP Client (inbound):** Connects to user-configured remote MCP servers, fetches available tools, executes tool calls during chat sessions. Active client caching by URL to avoid re-initialization.
- **MCP Server Management:** Full CRUD for user-configured MCP server connections (name, URL, custom headers), scoped per user.

### Memory (Honcho)
- Long-term memory via `@honcho-ai/sdk`
- Conversation ID used as Honcho session ID for contextual recall
- Fetches up to 1500 tokens of summarized historical context before each chat turn
- Context injected as `[Memory]: ...` blocks in the system prompt
- Each chat turn (user message + assistant response) synced to Honcho for future recall

### Frontend
- **Chat UI:** Auto-expanding input, markdown rendering with syntax highlighting (VSC Dark+ theme), streaming display with auto-scroll
- **Sidebar:** Collapsible (300px/60px), conversation list grouped by folder, drag-and-drop, inline rename/delete, user profile with settings access
- **Settings:** Theme selection (Light, Subtle Dark, High-Contrast), sidebar position (Left/Right), MCP server management with add/edit/delete modal
- **Markdown rendering:** GitHub-flavored markdown via `react-markdown` + `remark-gfm`, code blocks highlighted with `react-syntax-highlighter`
- **Three themes:** Light, Subtle Dark (Catppuccin Mocha-inspired), High-Contrast (pure black)

## API Endpoints

### Auth (Public)
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login with email/password |
| POST | `/api/auth/google` | Google OAuth login |

### Folders (Protected)
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/folders` | List user's folders |
| POST | `/api/folders` | Create folder |
| PUT | `/api/folders/:id` | Update folder |
| DELETE | `/api/folders/:id` | Delete folder |

### Conversations (Protected)
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/conversations` | List user's conversations |
| GET | `/api/conversations/:id` | Get single conversation |
| POST | `/api/conversations` | Create conversation |
| PUT | `/api/conversations/:id` | Update conversation |
| DELETE | `/api/conversations/:id` | Delete conversation |

### Chat (Protected)
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/chat` | SSE streaming chat endpoint with tool execution |

### MCP Servers (Protected)
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/mcp-servers` | List user's MCP servers |
| GET | `/api/mcp-servers/:id` | Get single MCP server |
| POST | `/api/mcp-servers` | Create MCP server |
| PUT | `/api/mcp-servers/:id` | Update MCP server |
| DELETE | `/api/mcp-servers/:id` | Delete MCP server |

### MCP Streamable HTTP (Public)
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/mcp` | MCP server endpoint for external clients |

## Data Models

### User
| Field | Type | Notes |
|-------|------|-------|
| email | String | Required, unique, lowercase |
| password | String | Optional (null for OAuth users) |
| googleId | String | Unique, sparse |
| createdAt | Date | Auto-set |

### Folder
| Field | Type | Notes |
|-------|------|-------|
| name | String | Required, unique per user |
| userId | ObjectId | Reference to User |
| systemPrompt | String | Default: empty string |
| createdAt | Date | Auto-set |

### Conversation
| Field | Type | Notes |
|-------|------|-------|
| title | String | Default: "New Conversation" |
| messages | Array | `{ role, content }` objects |
| folderId | ObjectId | Reference to Folder (nullable) |
| userId | ObjectId | Reference to User |
| systemPrompt | String | Snapshot of folder prompt |
| systemPromptHash | String | SHA-256 of systemPrompt |
| createdAt | Date | Auto-set |

### McpServer
| Field | Type | Notes |
|-------|------|-------|
| name | String | Required |
| url | String | Required |
| headers | Object | Default: `{}` |
| userId | ObjectId | Reference to User |
| createdAt | Date | Auto-set |
| updatedAt | Date | Auto-set |

## Environment Variables

Single `.env` file in the project root:

| Variable | Purpose |
|----------|---------|
| `API_IP` | Backend bind address |
| `API_PORT` | Backend port |
| `MONGODB_URI` | MongoDB connection string |
| `MONGODB_DB` | Database name |
| `JWT_SECRET` | JWT signing secret |
| `LLAMA_ENDPOINT` | LLM API base URL |
| `THINKER_MODEL` | Model name for thinker routing |
| `REFLEX_MODEL` | Model name for reflex routing |
| `LLM_TIMEOUT` | LLM request timeout (seconds) |
| `HONCHO_API_KEY` | Honcho memory API key |
| `HONCHO_API_URL` | Honcho memory API URL |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (backend) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID (frontend) |

## Development

```bash
npm run start:dev        # Install deps + run backend (nodemon) + frontend (vite) concurrently
npm run backend:dev      # Backend only (nodemon, watches backend/src)
npm run frontend         # Frontend only (vite dev server)
```

- **Backend:** `localhost:3001` (Express 5, ES modules)
- **Frontend:** Vite dev server, proxies `/api` → `localhost:3001`

## Deployment

Docker Compose (`docker-compose.yml`):
- **Backend:** Node 24 Alpine, port 3001
- **Frontend:** Two-stage build (Node 24 → Nginx), ports 8111 (HTTP) / 8112 (HTTPS)
- **Nginx:** Reverse proxy for frontend SPA, `/api/` → backend, `/mcp` → MCP endpoint, long timeouts for streaming
- **Certbot:** Let's Encrypt SSL support (configured, commented out)

### Obtaining SSL Certificates
```bash
docker compose run --rm certbot certonly --webroot \
  --webroot-path=/var/www/certbot \
  -d qassistant.example.com \
  --email your-email@example.com \
  --agree-tos \
  --no-eff-email \
  --force-renewal
```

## Tech Stack

### Backend
Express 5, Mongoose 9, JSON Web Tokens, bcryptjs, Axios, Google Auth Library, Honcho SDK, MCP SDK (client + server + Express transport), Zod, JSON Schema validation

### Frontend
React 19, Vite 8, Axios, React OAuth Google, React Markdown + remark-gfm, React Syntax Highlighter, React Icons

### Infrastructure
MongoDB, Nginx, Docker Compose, Let's Encrypt/Certbot
