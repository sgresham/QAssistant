# QAssistant "Jarvis" — Detailed Implementation Plan

## Vision

Transform QAssistant from a chat application into a comprehensive home assistant system with voice I/O, smart home control, scheduled routines, multi-channel notifications, and environmental awareness — all orchestrated through an MCP-first architecture.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Nginx (Reverse Proxy)                     │
│  /           → React SPA                                        │
│  /api/        → QAssistant Backend (Express)                     │
│  /mcp         → QAssistant MCP Server                            │
│  /google-mcp/ → Google Workspace MCP (10.10.10.30:8222)          │
│  /ha-mcp/     → Home Assistant MCP (NEW)                         │
│  /voice-mcp/  → Voice MCP (STT+TTS) (NEW)                        │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼─────────────────┐
              ▼               ▼                   ▼
    ┌───────────────┐ ┌──────────────┐  ┌──────────────────┐
    │  QAssistant    │ │  Home        │  │  Voice MCP       │
    │  Backend       │ │  Assistant   │  │  (Whisper+Piper) │
    │  (Express)     │ │  (Container) │  │  (LAN machine)   │
    └────────────────┘ └──────────────┘  └──────────────────┘
              │
              ▼
    ┌──────────────────────────────────────┐
    │  MCP Client (dynamic tool discovery)  │
    │  · Google Workspace MCP tools         │
    │  · Home Assistant MCP tools           │
    │  · Voice MCP tools                    │
    │  · Future MCP servers                 │
    └──────────────────────────────────────┘
```

**Hosting strategy:**
- MCP servers on LAN machine (10.10.10.30): Voice MCP (Whisper + Piper)
- Docker Compose services: Home Assistant MCP server, scheduling worker (if needed)
- Proxied via Nginx with existing pattern

---

## Phase 1: Home Automation Foundation

### 1.1 Deploy Home Assistant MCP Server

**Goal:** Connect QAssistant to Home Assistant so the LLM can query entity states and call services.

**Implementation:**
- Deploy `homeassistant-mcp-server` (Python-based, from `home-assistant-mcp-server` project) as a Docker service
- Expose HA entities: lights, switches, climate, covers, locks, sensors, cameras, media players
- Expose HA services: light.turn_on/off, climate.set_temperature, cover.open/close, etc.
- Expose HA automations: trigger, list, enable/disable

**Files to create/modify:**
- `docker-compose.yml` — Add `ha-mcp` service:
  ```yaml
  ha-mcp:
    image: ghcr.io/therobch/homeassistant-mcp-server:latest
    restart: unless-stopped
    environment:
      - HOMEASSISTANT_URL=http://homeassistant:8123
      - TOKEN=${HA_TOKEN}
    depends_on:
      - homeassistant
  ```
- `docker-compose.yml` — Add `homeassistant` service (if not already running externally):
  ```yaml
  homeassistant:
    image: ghcr.io/home-assistant/home-assistant:stable
    restart: unless-stopped
    volumes:
      - ./ha-config:/config
    ports:
      - "8123:8123"
  ```
- `nginx/conf.d/default.conf` — Add `/ha-mcp/` proxy route (following `/google-mcp/` pattern)

**New env vars (`.env`):**
```
HA_TOKEN=your-long-lived-access-token
```

**QAssistant integration:**
- Register HA MCP server in Settings UI (URL: `https://qassistant.alacritycore.com/ha-mcp/`)
- Tools will be auto-discovered via existing MCP client infrastructure

**Expected MCP tools from HA server:**
- `get_entity_state` — Query any entity state
- `set_entity_state` / `call_service` — Control devices (lights, climate, etc.)
- `get_entities_by_domain` — List lights, sensors, cameras, etc.
- `trigger_automation` — Fire HA automations
- `get_camera_image` — Snapshot from camera entities

**Estimated effort:** 2-3 hours (mostly deployment + Nginx config)

---

### 1.2 Nginx Proxy Configuration

**Goal:** Add proxy routes for new MCP servers.

**File:** `nginx/conf.d/default.conf`

**Add after `/google-mcp/` block:**
```nginx
# Home Assistant MCP Server
location /ha-mcp/ {
    proxy_pass http://ha-mcp:PORT/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_cache off;
    proxy_buffering off;
    chunked_transfer_encoding on;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}

# Voice MCP Server (STT + TTS)
location /voice-mcp/ {
    proxy_pass http://10.10.10.30:VOICE_PORT/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_cache off;
    proxy_buffering off;
    chunked_transfer_encoding on;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;

    # Larger body limit for audio uploads
    client_max_body_size 50M;
}
```

**Estimated effort:** 30 min

---

## Phase 2: Voice I/O

### 2.1 Voice MCP Server (Whisper STT + Piper TTS)

**Goal:** Local, offline voice processing. Whisper for speech-to-text, Piper for text-to-speech.

**Hosting:** LAN machine (10.10.10.30) — already hosts Google Workspace MCP

**Implementation:**
- Build a FastMCP server (Python, consistent with existing Google Workspace MCP pattern)
- Two tools:
  - `transcribe_audio` — Accepts audio blob/URL, returns transcribed text (Whisper)
  - `synthesize_speech` — Accepts text, returns audio blob/URL (Piper)

**Backend (LAN machine):**
```python
# Conceptual structure
from mcp.server.fastmcp import FastMcp
import whisper
from piper import PiperVoice

mcp = FastMcp("voice-assistant")

@mcp.tool()
def transcribe_audio(audio_base64: str, audio_format: str = "wav") -> str:
    """Transcribe audio to text using Whisper."""
    # Decode base64, save temp file, run whisper, return text
    ...

@mcp.tool()
def synthesize_speech(text: str, voice: str = "en_US-medium") -> str:
    """Convert text to speech using Piper. Returns base64-encoded audio."""
    # Generate audio, encode to base64, return
    ...
```

**Dependencies (LAN machine):**
- `openai-whisper` (or `faster-whisper` for GPU acceleration)
- `piper-tts` (install via pip or system package)
- `mcp` (FastMCP server framework, consistent with Google Workspace MCP)

**Estimated effort:** 4-6 hours (depends on Whisper/Piper setup on LAN machine)

---

### 2.2 Frontend: Voice Input

**Goal:** Microphone button in chat UI, records audio, sends to STT, replaces text input.

**Files to modify:**
- `frontend/src/MainChat.jsx`

**Implementation:**
- Add microphone icon button next to send button
- On click: use `navigator.mediaDevices.getUserMedia()` to start recording
- Use `MediaRecorder` API to capture audio chunks as `audio/webm` or `audio/wav`
- On stop: convert blob to base64, call `transcribe_audio` via a new API endpoint
- Replace input text with transcription
- Visual feedback: pulsing red indicator while recording, waveform or timer

**New backend endpoint:**
- `POST /api/voice/transcribe` — Accepts `{ audioBase64, format }`, calls MCP tool `transcribe_audio`, returns `{ text }`

**File to create:**
- `backend/src/voice.js` — Voice route handlers

**File to modify:**
- `backend/src/index.js` — Register voice routes

**Estimated effort:** 3-4 hours

---

### 2.3 Frontend: Voice Output (TTS)

**Goal:** Speak AI responses aloud.

**Files to modify:**
- `frontend/src/MainChat.jsx`
- `frontend/src/App.jsx` (for SSE event handling)

**Implementation:**
- Add speaker icon button on each assistant message
- On click: send message text to TTS endpoint, receive audio blob, play via `<audio>` element
- Optional: auto-speak toggle in settings
- SSE event: backend sends `audio_url` or `audio_base64` chunk alongside content

**New backend endpoint:**
- `POST /api/voice/synthesize` — Accepts `{ text, voice }`, calls MCP tool `synthesize_speech`, returns `{ audioBase64 }`

**File to modify:**
- `backend/src/voice.js` — Add synthesize handler

**File to modify:**
- `backend/src/index.js` — Register synthesize route

**Estimated effort:** 2-3 hours

---

## Phase 3: Scheduled Routines

### 3.1 HA-Based Scheduling (Simple Routines)

**Goal:** Use Home Assistant's built-in automation engine for time-based triggers.

**Implementation:**
- Through HA MCP tools, QAssistant can:
  - Create HA automations programmatically via `call_service` (automation.reload, script creation)
  - Trigger existing automations
  - List/manage automations
- User says "turn on lights at 7am" → LLM calls HA MCP tool to create automation

**No new code needed** — this works once HA MCP server is connected.

**Estimated effort:** 0 (free with Phase 1)

---

### 3.2 QAssistant Routines Service (Complex Multi-Step)

**Goal:** Multi-step routines that span HA actions, LLM decisions, and notifications.

**Example:** "Every morning: check weather, read news summary, announce it over speakers, turn on kitchen lights"

**New data model:**
```javascript
// backend/src/db.js — add RoutineSchema
const RoutineSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Schedule
  schedule: {
    type: { type: String, enum: ['cron', 'once', 'recurring'], required: true },
    cronExpression: { type: String },        // e.g. "0 7 * * *"
    recurringInterval: { type: String },      // e.g. "daily", "weekly"
    nextRunAt: { type: Date },
  },
  // Steps
  steps: [{
    order: { type: Number, required: true },
    type: { type: String, enum: ['ha_service', 'llm_prompt', 'notification', 'wait'], required: true },
    config: { type: Object, required: true },  // Step-specific parameters
  }],
  // State
  enabled: { type: Boolean, default: true },
  lastRunAt: { type: Date },
  lastResult: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const Routine = mongoose.model('Routine', RoutineSchema);
```

**New API endpoints:**
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/routines` | List user's routines |
| GET | `/api/routines/:id` | Get single routine |
| POST | `/api/routines` | Create routine |
| PUT | `/api/routines/:id` | Update routine |
| DELETE | `/api/routines/:id` | Delete routine |
| POST | `/api/routines/:id/run` | Manually trigger a routine |
| POST | `/api/routines/:id/toggle` | Enable/disable routine |

**Scheduler service:**
- Add `node-cron` package to backend
- On startup: load all enabled routines, schedule cron jobs
- Each cron trigger: iterate steps, execute actions, log results
- For `llm_prompt` steps: invoke chat endpoint with step context
- For `ha_service` steps: call HA MCP tool
- For `notification` steps: send via notification service (Phase 4)

**Files to create:**
- `backend/src/routines.js` — CRUD handlers + scheduler logic
- `backend/src/scheduler.js` — Cron management, step execution engine

**Files to modify:**
- `backend/src/db.js` — Add `RoutineSchema`
- `backend/src/index.js` — Register routes, initialize scheduler on startup

**Estimated effort:** 6-8 hours

---

### 3.3 Frontend: Routine Management UI

**Goal:** Visual interface to create, edit, and manage routines.

**Files to modify:**
- `frontend/src/App.jsx` — Add 'routines' view state
- `frontend/src/Sidebar.jsx` — Add "Routines" nav item
- `frontend/src/Settings.jsx` — Or create new `Routines.jsx` component

**New file:**
- `frontend/src/Routines.jsx`

**Features:**
- List of routines with enabled/disabled toggle
- Create/edit modal:
  - Name, description
  - Schedule type (cron / once / recurring) + picker
  - Step builder: add/remove/reorder steps
  - Step type selector with config form per type
- Run now button
- Last run result display

**Estimated effort:** 4-6 hours

---

## Phase 4: Notifications & Proactive Alerts

### 4.1 Browser Web Push

**Goal:** Send push notifications to the browser even when the tab is closed.

**Implementation:**
- Add a service worker: `frontend/public/sw.js`
- On first visit: request notification permission, subscribe via `PushManager`
- Store subscription (endpoint, keys) in MongoDB
- Backend sends push via `web-push` library

**New data model:**
```javascript
const PushSubscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  endpoint: { type: String, required: true },
  keys: { type: Object, required: true },  // p256dhAuth, auth
  createdAt: { type: Date, default: Date.now },
});
```

**New backend dependencies:**
- `web-push` — Send Web Push notifications

**New env vars:**
```
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
```

**New API endpoints:**
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/notifications/subscribe` | Register push subscription |
| DELETE | `/api/notifications/unsubscribe` | Remove push subscription |
| POST | `/api/notifications/send` | Send test notification |

**Files to create:**
- `frontend/public/sw.js` — Service worker for push events
- `backend/src/notifications.js` — Push notification handlers

**Files to modify:**
- `backend/src/db.js` — Add `PushSubscriptionSchema`
- `backend/src/index.js` — Register routes
- `frontend/src/App.jsx` — Init push subscription on mount

**Estimated effort:** 4-5 hours

---

### 4.2 Email Notifications (via Google Workspace MCP)

**Goal:** Send email alerts via existing Gmail integration.

**Implementation:**
- Leverage existing Google Workspace MCP server at `/google-mcp/`
- Tool: `send_email` (from Gmail MCP) — LLM calls it when user requests email notification
- No new code needed for basic email — just needs the LLM to know the tool exists

**Enhancement (optional):**
- Built-in tool `send_notification_email` in `tools.js` — wraps the MCP call with user's email from JWT

**Estimated effort:** 1-2 hours (or 0 if relying on LLM to use Gmail MCP tool directly)

---

### 4.3 Home Assistant Notifications

**Goal:** Use HA's notification integrations (mobile app push, Telegram, Discord, etc.).

**Implementation:**
- Through HA MCP: `call_service` with `notify.mobile_app_*`, `notify.telegram`, etc.
- LLM calls HA MCP tool to trigger notifications
- No new code needed — works once HA MCP is connected

**Estimated effort:** 0 (free with Phase 1)

---

### 4.4 Webhook Receiver (External Event Triggers)

**Goal:** Accept webhook events from HA, IFTTT, or other services to trigger actions.

**Implementation:**
- Endpoint: `POST /api/webhooks/:integration` — Receives events, processes them
- For HA: HA sends event → QAssistant receives → LLM decides action → executes via tools
- For proactive alerts: sensor triggers → notification sent

**New data model:**
```javascript
const WebhookLogSchema = new mongoose.Schema({
  integration: { type: String, required: true },  // 'homeassistant', 'ifttt', etc.
  payload: { type: Object, required: true },
  processed: { type: Boolean, default: false },
  response: { type: String },
  receivedAt: { type: Date, default: Date.now },
});
```

**New API endpoint:**
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/webhooks/:integration` | Receive webhook event |
| GET | `/api/webhooks/logs` | View webhook history |

**Files to create:**
- `backend/src/webhooks.js` — Webhook handler, event processing logic

**Files to modify:**
- `backend/src/db.js` — Add `WebhookLogSchema`
- `backend/src/index.js` — Register routes

**Estimated effort:** 3-4 hours

---

## Phase 5: Media & Observation

### 5.1 Media Player Control

**Goal:** Control media players exposed by Home Assistant.

**Implementation:**
- Through HA MCP: tools for media player entities
- Expected tools from HA MCP:
  - `play_media` — Play URL/track on a media player entity
  - `media_play/pause/stop/next/previous` — Playback control
  - `set_volume` — Volume control
  - `get_media_info` — Current playing info
- No new code needed — works once HA MCP is connected

**Frontend enhancement (optional):**
- Media control bar in chat UI when media is playing
- Quick controls: play/pause, volume slider

**Estimated effort:** 0 (free with Phase 1) + 2-3 hours for optional UI

---

### 5.2 Sensor Data & Observation

**Goal:** Query environmental sensors and camera feeds.

**Implementation:**
- Through HA MCP:
  - `get_entity_state` for sensor entities (temperature, humidity, air quality, motion, door/window)
  - `get_camera_image` for camera snapshots
  - `get_entities_by_domain` for listing all sensors/cameras
- LLM can proactively check sensors when relevant to conversation

**Frontend enhancement (optional):**
- Dashboard widget showing key sensor values
- Camera thumbnail grid

**Estimated effort:** 0 (free with Phase 1) + 3-4 hours for optional dashboard

---

### 5.3 Presence Detection

**Goal:** Know who is home and where.

**Implementation:**
- Through HA MCP: `device_tracker` and `person` entities
- LLM can query: "Is anyone home?" → checks person entities
- Can be combined with routines: "When I get home, turn on lights"

**Estimated effort:** 0 (free with Phase 1)

---

## Phase 6: Dashboard

### 6.1 Home Dashboard View

**Goal:** At-a-glance view of home state — sensors, devices, routines, cameras.

**New file:**
- `frontend/src/Dashboard.jsx`

**Features:**
- **Sensor cards:** Temperature, humidity, air quality (live values, refreshed periodically)
- **Device quick-toggles:** Frequently used lights/switches (toggle buttons)
- **Camera thumbnails:** Recent snapshots from HA camera entities
- **Routine status:** Next scheduled run, last result
- **Climate card:** Current temp + quick adjust buttons
- **Activity feed:** Recent automation triggers, webhook events

**Files to modify:**
- `frontend/src/App.jsx` — Add 'dashboard' view
- `frontend/src/Sidebar.jsx` — Add "Dashboard" nav item

**New API endpoints (for efficient dashboard data loading):**
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/dashboard/state` | Fetch dashboard data (sensor states, device states, routine status) |

**File to create:**
- `backend/src/dashboard.js` — Aggregates data from HA MCP + local models

**Estimated effort:** 6-8 hours

---

## Phase 7: QAssistant MCP Server Enhancements

### 7.1 Additional Tools Exposed to External Clients

**Goal:** Make QAssistant's own MCP server more useful for external tools (Cursor, Claude Desktop, etc.).

**Current tools:** `get_system_status`, `get_infrastructure_health`

**New tools to register in `backend/src/index.js`:**
| Tool | Description |
|------|-------------|
| `get_user_conversations` | List recent conversations for a user |
| `get_home_status` | Query HA entity states via MCP client |
| `control_device` | Call HA services via MCP client |
| `create_routine` | Create a scheduled routine |
| `send_notification` | Send push/email/HA notification |

**Estimated effort:** 3-4 hours

---

## Implementation Order & Dependencies

```
Phase 1: Home Automation Foundation (HA MCP + Nginx)
    │
    ├──→ Phase 2: Voice I/O (Voice MCP + frontend voice)
    │       │
    │       └──→ Phase 6: Dashboard (optional media/observation widgets)
    │
    ├──→ Phase 3: Scheduled Routines
    │       │
    │       └──→ Phase 4: Notifications (needs routines for triggered alerts)
    │
    └──→ Phase 5: Media & Observation (free with HA MCP)
            │
            └──→ Phase 6: Dashboard
                    │
                    └──→ Phase 7: MCP Server Enhancements
```

**Critical path:** Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 6

**Can run in parallel:** Phase 5 (once Phase 1 done), Phase 7 (independent)

---

## New Environment Variables

Add to `.env`:
```env
# Home Assistant
HA_TOKEN=your-long-lived-access-token

# Voice (if needed for backend config)
VOICE_MCP_URL=http://10.10.10.30:VOICE_PORT

# Web Push
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
```

---

## New Dependencies

### Backend (`backend/package.json`):
```json
{
  "node-cron": "^3.0.3",
  "web-push": "^3.6.7"
}
```

### Frontend (`frontend/package.json`):
- No new dependencies needed (uses browser APIs: `MediaRecorder`, `getUserMedia`, `PushManager`, `SpeechSynthesis` as fallback)

### LAN Machine (Voice MCP):
```
openai-whisper (or faster-whisper)
piper-tts
mcp (FastMCP, same framework as Google Workspace MCP)
```

---

## Estimated Total Effort

| Phase | Description | Hours |
|-------|-------------|-------|
| 1.1 | HA MCP server deployment | 2-3 |
| 1.2 | Nginx proxy config | 0.5 |
| 2.1 | Voice MCP server (LAN) | 4-6 |
| 2.2 | Frontend voice input | 3-4 |
| 2.3 | Frontend voice output | 2-3 |
| 3.1 | HA-based scheduling | 0 (free) |
| 3.2 | QAssistant routines service | 6-8 |
| 3.3 | Routines UI | 4-6 |
| 4.1 | Browser Web Push | 4-5 |
| 4.2 | Email notifications | 1-2 |
| 4.3 | HA notifications | 0 (free) |
| 4.4 | Webhook receiver | 3-4 |
| 5.1 | Media control | 0-3 |
| 5.2 | Sensor/observation | 0-4 |
| 5.3 | Presence detection | 0 (free) |
| 6.1 | Dashboard view | 6-8 |
| 7.1 | MCP server enhancements | 3-4 |
| | **Total** | **~40-60 hours** |

---

## Risk & Consideration Notes

1. **Whisper performance:** If the LAN machine lacks a GPU, Whisper will be slow. Consider `faster-whisper` (CTranslate2) or a smaller model (`base` or `small`) for acceptable latency.

2. **MCP client caching:** The current `activeClients` Map in `mcpClient.js` works for chat turns but may need a periodic refresh mechanism for long-lived connections to HA/Voice MCP servers.

3. **Audio format compatibility:** Ensure `MediaRecorder` output format is compatible with Whisper input. May need client-side format conversion (WebM → WAV via AudioContext).

4. **Push notification reliability:** Web Push requires the service worker to be active. Consider a fallback: if the user has the tab open, use `navigator.serviceWorker.controller.postMessage()` instead of push.

5. **Routine step execution:** Multi-step routines with LLM prompts could be slow. Consider timeouts per step and a "resume later" mechanism.

6. **HA MCP server choice:** `homeassistant-mcp-server` is a community project — verify its tool set matches needs. Alternative: build a custom FastMCP server tailored to your HA setup.

7. **Security:** Webhook endpoints should be authenticated (HMAC signature or token in headers). Same for Voice MCP if exposed beyond LAN.
