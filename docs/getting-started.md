# Getting Started with QAssistant

QAssistant is a full-stack AI chat application with multi-user support, streaming LLM responses, tool execution, MCP integration, and long-term memory.

## Quick Start

### Prerequisites

- **Node.js 24+** (install via `nvm`, see [nvm-sh](https://github.com/nvm-sh/nvm))
- MongoDB instance (local or remote)
- An LLM API endpoint (OpenAI-compatible) — e.g., DeepSeek, OpenAI, or a local model

### Setup

```bash
# 1. Clone and install dependencies
cd QAssistant
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# 2. Configure environment
cp .env.example .env
# Edit .env with your settings (see Configuration below)

# 3. Start development servers
npm run start:dev
```

The backend starts at `http://localhost:3001` and the frontend dev server at its own port (with `/api` proxied to the backend).

### Default Login

An admin account is created automatically on first startup:

- **Email:** `admin`
- **Password:** `admin`

---

## Configuration

Copy `.env.example` to `.env` in the project root and fill in the values:

| Variable | Required | Description |
|---|---|---|
| `API_IP` | Yes | Backend bind address (`0.0.0.0` for all interfaces) |
| `API_PORT` | Yes | Backend port (`3001`) |
| `MONGODB_URI` | Yes | MongoDB connection string |
| `MONGODB_DB` | Yes | MongoDB database name |
| `JWT_SECRET` | Yes | Secret key for JWT tokens |
| `LLAMA_ENDPOINT` | No* | Fallback LLM API base URL |
| `REFLEX_MODEL` | No* | Fallback model name |
| `THINKER_MODEL` | No | Fallback thinker model (unused) |
| `LLM_TIMEOUT` | No | LLM request timeout in seconds (default: 600) |
| `HONCHO_API_KEY` | No | Honcho memory API key |
| `HONCHO_API_URL` | No | Honcho memory API URL |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |
| `VITE_GOOGLE_CLIENT_ID` | No | Google OAuth client ID (exposed to frontend) |

*\* `LLAMA_ENDPOINT` and `REFLEX_MODEL` are only used as fallbacks when no AI Provider is configured in the app. See [AI Providers](#ai-providers) below.*

---

## Using the App

### Login

- **Email/Password:** Use the default `admin`/`admin` account or register a new one
- **Google OAuth:** If configured, sign in with your Google account

### Chat

1. Click **+ New Chat** in the sidebar to start a conversation
2. Select an **AI Provider** and **Model** from the dropdowns above the chat
3. Type your message and press **Enter** (or Ctrl+Enter depending on configuration)
4. Responses stream in real-time with markdown rendering

### Conversations

- Conversations are automatically titled by the AI
- Click any conversation in the sidebar to resume it
- Right-click or hover to **rename** or **delete**
- **Drag and drop** conversations between folders

### Folders

Folders help organize your conversations. Each folder can have a custom **system prompt** that sets the behavior of the AI for conversations inside it.

- Click **+ Folder** in the sidebar to create one
- Edit the system prompt by clicking the gear icon
- System prompts are snapshotted when a conversation is created, so changing a folder's prompt won't affect existing conversations

---

## AI Providers

QAssistant lets you configure multiple LLM providers and switch between them per conversation.

### Supported Providers

Any **OpenAI-compatible** API works — including:

- **DeepSeek** — `https://api.deepseek.com/v1`
- **OpenAI** — `https://api.openai.com/v1`
- **OpenRouter** — `https://openrouter.ai/api/v1`
- **Local models** (llama.cpp, vLLM, Ollama with OpenAI compatibility) — `http://localhost:11434/v1`

### Adding a Provider

1. Go to **Settings** (gear icon in the sidebar)
2. Scroll to the **AI Providers** section
3. Click **Add New Provider**
4. Fill in:
   - **Name** — A friendly label (e.g., "DeepSeek")
   - **Base URL** — The API endpoint (e.g., `https://api.deepseek.com/v1`)
   - **API Key** — Your API key (stored in the database, masked in the UI)
   - **Models** — Comma-separated model names (e.g., `deepseek-chat, deepseek-reasoner`)
5. Click **Save**

### Using a Provider

Once configured, select your provider and model from the dropdowns in the chat header. Each conversation remembers which provider and model it used, so subsequent messages in the same conversation use the same configuration.

### Fallback

If no providers are configured, QAssistant falls back to the `LLAMA_ENDPOINT` and `REFLEX_MODEL` environment variables.

---

## MCP Integration

QAssistant supports the **Model Context Protocol (MCP)** for extending the AI's capabilities with external tools.

### Built-in Tools

QAssistant has built-in tools available to the LLM without any configuration:

- **`get_infrastructure_health`** — Checks backend and database connectivity

### Adding MCP Servers

1. Go to **Settings** → **MCP Servers**
2. Click **Add New Server**
3. Enter the server's name, URL (e.g., `http://localhost:3002/mcp`), and any required headers (as JSON)
4. The AI will automatically discover and use the server's tools during chat

### MCP Server (for external clients)

QAssistant also exposes its own MCP server at `POST /mcp` for external MCP clients. It exposes the same built-in tools.

---

## Memory (Honcho)

QAssistant uses [Honcho](https://honcho.ai) for long-term memory. It maintains a session per conversation and injects relevant historical context as memory blocks in the system prompt before each chat turn.

To enable memory:
1. Set up a Honcho instance
2. Configure `HONCHO_API_KEY` and `HONCHO_API_URL` in `.env`
3. Memory is automatically fetched and synced during chat

---

## Settings

Access settings via the gear icon in the sidebar:

| Setting | Options |
|---|---|
| **Theme** | Light, Subtle Dark, High-Contrast |
| **Sidebar Position** | Left, Right |
| **MCP Servers** | Add/edit/delete remote MCP servers |
| **AI Providers** | Add/edit/delete LLM provider connections |

---

## Docker Deployment

```bash
# Start all services
docker compose up -d

# Or rebuild and start
docker compose up -d --build
```

The Docker Compose setup includes:
- **Backend** — Node 24 Alpine on port 3001
- **Frontend** — Nginx-served SPA on ports 8111 (HTTP) and 8112 (HTTPS)

Environment variables are loaded from `.env` at the project root.

### SSL Certificates (Optional)

```bash
docker compose run --rm certbot certonly --webroot \
  --webroot-path=/var/www/certbot \
  -d qassistant.example.com \
  --email your-email@example.com \
  --agree-tos \
  --no-eff-email \
  --force-renewal
```

---

## API Endpoints

### Authentication (Public)

| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/register` | Register a new user |
| POST | `/api/auth/login` | Login with email/password |
| POST | `/api/auth/google` | Google OAuth login |

### Folders (Protected)

| Method | Route | Description |
|---|---|---|
| GET | `/api/folders` | List folders |
| POST | `/api/folders` | Create a folder |
| PUT | `/api/folders/:id` | Update a folder |
| DELETE | `/api/folders/:id` | Delete a folder |

### Conversations (Protected)

| Method | Route | Description |
|---|---|---|
| GET | `/api/conversations` | List conversations |
| GET | `/api/conversations/:id` | Get a conversation |
| POST | `/api/conversations` | Create a conversation |
| PUT | `/api/conversations/:id` | Update a conversation |
| DELETE | `/api/conversations/:id` | Delete a conversation |

### Chat (Protected)

| Method | Route | Description |
|---|---|---|
| POST | `/api/chat` | SSE streaming chat with tool execution |

### AI Providers (Protected)

| Method | Route | Description |
|---|---|---|
| GET | `/api/ai-providers` | List AI providers |
| GET | `/api/ai-providers/:id` | Get a provider |
| POST | `/api/ai-providers` | Create a provider |
| PUT | `/api/ai-providers/:id` | Update a provider |
| DELETE | `/api/ai-providers/:id` | Delete a provider |

### MCP Servers (Protected)

| Method | Route | Description |
|---|---|---|
| GET | `/api/mcp-servers` | List MCP servers |
| GET | `/api/mcp-servers/:id` | Get an MCP server |
| POST | `/api/mcp-servers` | Create an MCP server |
| PUT | `/api/mcp-servers/:id` | Update an MCP server |
| DELETE | `/api/mcp-servers/:id` | Delete an MCP server |

### MCP Streamable HTTP

| Method | Route | Description |
|---|---|---|
| POST | `/mcp` | MCP endpoint for external clients |

---

## Tech Stack

- **Backend:** Express 5, Mongoose 9, JWT, bcryptjs, Axios, Honcho SDK, MCP SDK
- **Frontend:** React 19, Vite 8, react-markdown, react-syntax-highlighter
- **Infrastructure:** MongoDB, Nginx, Docker Compose, Let's Encrypt
