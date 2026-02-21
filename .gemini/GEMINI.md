# AI City Builder - Gemini CLI Guide

## Project Overview
AI City Builder is a SimCity-style city building game with Three.js.
The dev server runs at `http://127.0.0.1:3000/`.

## Browser Automation with Playwright
You have access to Playwright MCP to control Chrome browser.
Use it to interact with the game UI.

## Game UI Structure
- **Left side (70%)**: 3D city view with toolbar
- **Right side (30%)**: AI Mayor chat panel

### Chat Panel Elements
- Chat input: `#chat-input` - text input field
- Send button: `#chat-send` - sends the message
- Quick action buttons: `.chat-quick-btn` with data-action attributes:
  - `data-action="analyze"` - Analyze City
  - `data-action="starter"` - Build Starter Town
  - `data-action="suggest"` - Suggest Next

### Toolbar Buttons (left side)
- Select: `#button-select`
- Bulldoze: `#button-bulldoze`
- Residential: `#button-residential`
- Commercial: `#button-commercial`
- Industrial: `#button-industrial`
- Road: `#button-road`
- Power Plant: `#button-power-plant`
- Power Line: `#button-power-line`
- Pause: `#button-pause`

## HTTP API (for curl commands)
The Vite dev server exposes these API endpoints:

```bash
# Get city state
curl http://127.0.0.1:3000/api/city-state

# Place a building
curl -X POST http://127.0.0.1:3000/api/place-building \
  -H "Content-Type: application/json" \
  -d '{"x": 5, "y": 5, "type": "road"}'

# Bulldoze
curl -X POST http://127.0.0.1:3000/api/bulldoze \
  -H "Content-Type: application/json" \
  -d '{"x": 5, "y": 5}'

# Zone area
curl -X POST http://127.0.0.1:3000/api/zone-area \
  -H "Content-Type: application/json" \
  -d '{"x1": 2, "y1": 2, "x2": 4, "y2": 4, "type": "residential"}'

# Apply layout (bulk placement)
curl -X POST http://127.0.0.1:3000/api/apply-layout \
  -H "Content-Type: application/json" \
  -d '{"buildings":[{"type":"road","x":0,"y":4,"to_x":9,"to_y":4}]}'
```

## Valid Building Types
- `residential` - Housing zones
- `commercial` - Business zones
- `industrial` - Factory zones
- `road` - Roads
- `power-plant` - Power generation
- `power-line` - Power distribution

## City Grid
The city is a 10x10 grid. Coordinates: (0,0) top-left to (9,9) bottom-right.

## Workflow
1. Use Playwright to open `http://127.0.0.1:3000/` in Chrome
2. Interact with the chat panel or use curl API to build the city
3. Take screenshots to verify the results
