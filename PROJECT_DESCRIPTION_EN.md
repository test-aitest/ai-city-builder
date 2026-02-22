# AI City Builder - Project Description

## Concept

AI City Builder is a new kind of city-building game where you build and manage a city **entirely through natural language**. There is no toolbar or button-based UI — players converse with an AI Mayor via text chat or voice to construct and manage their city.

Citizens autonomously detect city problems and issue requests. Players resolve these through conversation, creating a game loop driven by dialogue and civic engagement.

## Key Features

### Conversational City Building
- Give instructions to the AI Mayor through chat or voice to place buildings
- Natural language commands like "Build 3 houses" or "Add a road going east to west"
- AI uses Function Calling to check city state and place buildings in valid locations

### Citizen Request System
- Citizens automatically detect urban problems (housing shortage, unemployment, power outages, etc.)
- Requests are announced to the player through the AI Mayor
- Fulfilling requests increases the city's happiness score — the core game loop

### AI Voice Interaction
- **Mayor voice**: Real-time voice dialogue via Gemini Live API (microphone input supported)
- **Citizen voice**: Text-to-speech via Gemini Live API
- Speech coordinator prevents voice overlap between mayor and citizens
- When a citizen request arises, the mayor introduces it, then the citizen speaks

### 3D City Visualization
- 3D city rendered with Three.js
- Building construction and level-up animations
- Citizen movement and vehicle traffic simulation
- Click on buildings to chat with individual citizens

## Tech Stack

| Category | Technology |
|----------|-----------|
| 3D Rendering | Three.js v0.155 |
| AI | Google Gemini API (gemini-3-flash-preview / gemini-2.5-flash-native-audio) |
| Voice | Gemini Live API (WebSocket real-time audio) |
| Frontend | TypeScript, Tailwind CSS v4 |
| Build Tool | Vite 6 |
| API Bridge | Vite HMR WebSocket + HTTP API (curl / Claude Code integration) |

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Browser                                                      │
│  ┌─────────────────────────┬──────────────────────────┐       │
│  │  3D Game View (70%)      │  AI Chat Panel (30%)     │       │
│  │  - Three.js canvas       │  - Message history       │       │
│  │  - Status bar             │  - Quick actions         │       │
│  │    (Pop/Happiness/Reqs)   │  - Text/Voice input      │       │
│  └─────────────────────────┴──────────────────────────┘       │
│                                                                │
│  ┌──────────────────────────────────────────────────────┐     │
│  │  AI System                                            │     │
│  │  ├── GeminiService (Text chat + Function Calling)     │     │
│  │  ├── VoiceSession (Mayor voice dialogue)              │     │
│  │  ├── CitizenVoice (Citizen text-to-speech)            │     │
│  │  ├── RequestEngine (Request generation & fulfillment) │     │
│  │  ├── Advisor (Proactive suggestions)                  │     │
│  │  └── SpeechCoordinator (Voice mutex)                  │     │
│  └──────────────────────────────────────────────────────┘     │
│                                                                │
│  ┌──────────────────────────────────────────────────────┐     │
│  │  Simulation                                           │     │
│  │  ├── City (8x8 grid, happiness calculation)           │     │
│  │  ├── Buildings (residential/commercial/industrial/    │     │
│  │  │              road/power-plant/power-line)           │     │
│  │  ├── Citizens (population sim, employment, commuting) │     │
│  │  ├── Vehicles (traffic, road network pathfinding)     │     │
│  │  └── Power Service (electricity distribution)         │     │
│  └──────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────┘
         ↕ HMR WebSocket
┌──────────────────────────────────────────────────────────────┐
│  Vite Dev Server                                              │
│  └── HTTP API (/api/*) ← curl / Claude Code control          │
└──────────────────────────────────────────────────────────────┘
```

## Game Systems

### Building Types
| Type | Description |
|------|-------------|
| residential | Housing — citizens live here |
| commercial | Shops/Offices — provide employment |
| industrial | Factories — provide employment |
| road | Roads — required for building access |
| power-plant | Power plant — generates electricity |
| power-line | Power line — distributes electricity |

### Happiness System (0–100)
- Base value: 50
- Employment rate: up to +30
- Power supply rate: up to +10
- Population bonus: +10
- Pending requests: -5 per request (max -25)

### Citizen Request Types
| Type | Trigger Condition |
|------|-------------------|
| housing | Population exceeds 80% of residential capacity |
| jobs | Unemployed citizens with insufficient commercial/industrial buildings |
| power | Unpowered buildings exist |
| road | Buildings without road access exist |
| commerce | Commercial buildings below 30% of residential count |

## Setup

```bash
# Install dependencies
npm install

# Set Gemini API key in .env
echo "VITE_GEMINI_API_KEY=your_api_key_here" > .env

# Start dev server
npm run dev
# → http://127.0.0.1:3000/
```

## File Structure

```
src/
├── index.html                    # Main HTML entry point
├── public/main.css               # Styles (Tailwind CSS)
└── scripts/
    ├── game.js                   # Three.js game manager
    ├── ui.js                     # Status bar & info panels
    ├── camera.js                 # Camera controls
    ├── input.js                  # Mouse/keyboard input
    ├── config.js                 # Game configuration
    ├── api-bridge.ts             # HMR API bridge
    ├── ai/
    │   ├── index.ts              # AI system initialization
    │   ├── gemini-service.ts     # Gemini API wrapper
    │   ├── chat-panel.ts         # Chat UI component
    │   ├── city-api.ts           # City operations API
    │   ├── advisor.ts            # AI advisor
    │   ├── citizen-chat.ts       # Citizen chat dialog
    │   ├── citizen-voice.ts      # Citizen/Mayor voice (Gemini Live API)
    │   ├── voice-session.ts      # Voice dialogue session
    │   ├── speech-coordinator.ts # Voice overlap prevention
    │   ├── request-engine.ts     # Citizen request engine
    │   └── demo-presets.ts       # Demo layouts
    └── sim/
        ├── city.js               # City simulation
        ├── tile.js               # Grid tiles
        ├── citizen.js            # Citizen AI
        ├── buildings/            # Building classes
        ├── vehicles/             # Vehicles & pathfinding
        └── services/             # Power service, etc.
```

## HTTP API Endpoints

```bash
# Get city state with grid visualization
GET /api/city-state

# Place a single building
POST /api/place-building   {"x": 2, "y": 3, "type": "road"}

# Demolish a building
POST /api/bulldoze         {"x": 2, "y": 3}

# Batch zone an area
POST /api/zone-area        {"x1": 0, "y1": 0, "x2": 3, "y2": 3, "type": "residential"}

# Apply a layout (bulk placement with ranges)
POST /api/apply-layout     {"buildings": [{"type": "road", "x": 0, "y": 4, "to_x": 9, "to_y": 4}]}

# Get city happiness score and factors
GET /api/happiness

# Get active citizen requests
GET /api/requests

# Capture a screenshot of the game view
GET /api/screenshot
```
