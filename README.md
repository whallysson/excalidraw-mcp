# Excalidraw MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org/)
[![GitHub](https://img.shields.io/badge/GitHub-whallysson%2Fexcalidraw--mcp-blue?logo=github)](https://github.com/whallysson/excalidraw-mcp)

A Model Context Protocol (MCP) server that exposes Excalidraw diagram capabilities through standardized tools and resources, combined with a standalone React frontend for visual editing.

## Features

- 🎨 **MCP Protocol Integration**: Control Excalidraw programmatically via AI assistants
- 🖥️ **Standalone Frontend**: Use Excalidraw interface independently
- 🔄 **Real-Time Sync**: WebSocket synchronization between frontend and MCP server
- 🐳 **Docker Support**: Run locally or via Docker Compose
- 📦 **TypeScript**: Fully typed codebase with Zod validation
- 🧪 **Well Tested**: Unit, integration, and E2E test coverage

## Quick Start

### Prerequisites

- Node.js 18+ (LTS recommended)
- Docker & Docker Compose (optional, for container deployment)

### Local Development

**Option 1: Start Everything with ONE Command** (Recommended)

```bash
# Install dependencies (first time only)
npm install
cd backend && npm install
cd ../frontend && npm install
cd ..

# Configure environment (first time only)
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Start EVERYTHING (MCP + HTTP/WebSocket + Frontend)
npm run dev:all
```

This single command starts:
- `[MCP]` - MCP Server (stdio) on backend
- `[HTTP]` - HTTP/WebSocket Server on port 3333
- `[FRONTEND]` - Frontend Vite dev server on port 5173

Open your browser at **http://localhost:5173** and start creating diagrams!

**Option 2: Start Services Separately** (for debugging)

```bash
# Terminal 1: Backend MCP + HTTP/WebSocket Server
cd backend
npm run dev:all

# Terminal 2: Frontend
cd frontend
npm run dev
```

**Option 3: Individual Processes** (advanced)

```bash
# Terminal 1: HTTP/WebSocket Server only
cd backend && npm run dev

# Terminal 2: MCP Server only (for Claude Desktop integration)
cd backend && npm run dev:mcp

# Terminal 3: Frontend
cd frontend && npm run dev
```

### Docker Deployment (Production)

**IMPORTANT**: Docker starts only the **Frontend + HTTP/WebSocket Server**. The **MCP Server** (stdio) must run **locally** for communication with Claude Desktop.

#### Single Container

Docker now uses **1 container** that combines:
- ✅ Frontend (React/Vite static build)
- ✅ Backend HTTP Server (Express + WebSocket)
- ❌ MCP Server stdio (runs locally - see below)

#### Docker Commands

```bash
# Start application (Frontend + HTTP/WebSocket)
docker-compose up -d

# View logs
docker-compose logs -f

# Rebuild after changes
docker-compose down
docker-compose build
docker-compose up -d

# Stop application
docker-compose down

# Clean volumes (deletes canvas data)
docker-compose down -v
```

#### Access Application

- **Frontend**: http://localhost:3333
- **Health Check**: http://localhost:3333/health
- **API**: http://localhost:3333/api/canvas/main

#### MCP Server (Run Locally)

The MCP Server uses stdio protocol (stdin/stdout) and **CANNOT** run in Docker. Run it locally:

```bash
# Separate terminal: MCP Server for Claude Desktop
cd backend
npm run dev:mcp
```

**Claude Desktop Configuration** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "excalidraw": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/backend/src/index.ts"],
      "env": {
        "HTTP_SERVER_URL": "http://localhost:3333"
      }
    }
  }
}
```

#### Complete Architecture

```
┌─────────────────────────────────────────┐
│ Docker Container (excalidraw-mcp)      │
│                                         │
│  ┌──────────────┐   ┌────────────────┐ │
│  │   Frontend   │   │  HTTP Server   │ │
│  │ (Static Files)│◄──┤ Express + WS   │ │
│  └──────────────┘   └────────────────┘ │
│                                         │
│  Port: 3333                             │
└─────────────────────────────────────────┘
                  ▲
                  │ HTTP POST /api/canvas/*/broadcast
                  │
┌─────────────────┴───────────────────────┐
│ Local Process (MCP Server)              │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │ MCP Server (stdio)               │  │
│  │ JSON-RPC 2.0 Protocol            │  │
│  └──────────────────────────────────┘  │
│                  ▲                      │
│                  │ stdin/stdout         │
│                  │                      │
│  ┌───────────────┴──────────────────┐  │
│  │     Claude Desktop (MCP Client)  │  │
│  └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

#### Complete Tests

Run automated tests:

```bash
# Test Docker (Frontend, HTTP, API, Health)
./test-complete-flow.sh

# View detailed results
cat DOCKER_TEST_RESULTS.md
```

## Project Structure

```
├── backend/              # MCP server
│   ├── src/
│   │   ├── mcp/         # MCP tools and resources
│   │   ├── services/    # Canvas management, WebSocket, storage
│   │   ├── types/       # TypeScript definitions
│   │   └── utils/       # Logger, validation helpers
│   └── tests/           # Unit and integration tests
├── frontend/             # React frontend
│   ├── src/
│   │   ├── hooks/       # WebSocket client
│   │   ├── services/    # API client
│   │   └── utils/       # Element validation, conversion
│   └── tests/           # E2E tests
└── docker-compose.yml    # Orchestration
```

## Installation

### Backend Dependencies

```bash
cd backend
npm install
```

### Frontend Dependencies

```bash
cd frontend
npm install
```

## Local Setup

### Step 1: Install Dependencies

Install dependencies for both backend and frontend:

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### Step 2: Configure Environment Variables

Copy the example environment files and configure them:

```bash
# Backend environment
cp backend/.env.example backend/.env

# Frontend environment
cp frontend/.env.example frontend/.env
```

**Backend `.env` configuration:**
```env
PORT=3333
WS_PORT=3333
NODE_ENV=development
LOG_LEVEL=debug
CANVAS_DATA_DIR=./data
SERVER_NAME=excalidraw-mcp-server
SERVER_VERSION=1.0.0
```

**Frontend `.env` configuration:**
```env
VITE_MCP_SERVER_URL=http://localhost:3333
VITE_WS_SERVER_URL=ws://localhost:3333
```

### Step 3: Start Backend Server

The backend requires **TWO processes** to run:
1. **MCP Server** (stdio) - Handles MCP protocol commands
2. **HTTP/WebSocket Server** - Serves frontend and manages WebSocket connections

**Option A: Run both processes with a single command** (Recommended):

```bash
npm run dev:all
```

This starts both servers simultaneously with colored output:
```
[HTTP] 🚀 Excalidraw MCP Server
[HTTP]    HTTP: http://localhost:3333
[HTTP]    WebSocket: ws://localhost:3333
[HTTP]    Health: http://localhost:3333/health
[MCP] MCP server started successfully
[MCP] Tools registered: element_create, element_update, element_delete, get_canvas_state
```

**Option B: Run processes separately** (for debugging):

```bash
# Terminal 1: HTTP/WebSocket Server
npm run dev

# Terminal 2: MCP Server (for Claude Desktop integration)
npm run dev:mcp
```

**Available MCP Tools (12 total):**

**Element Operations:**
- `element_create` - Create new elements (rectangle, ellipse, diamond, arrow, text, freedraw, image, frame, etc.)
- `element_update` - Update existing element properties (position, size, colors, text, etc.)
- `element_delete` - Soft delete elements (mark as deleted without removing from storage)
- `batch_create_elements` - Create multiple elements efficiently in a single operation

**Canvas Operations:**
- `get_canvas_state` - Get all active elements and canvas state
- `clear_canvas` - Remove all elements from canvas
- `canvas_export` - Export canvas data in JSON or Excalidraw format
- `canvas_import` - Import elements into canvas (merge or replace mode)

**Group & Layout:**
- `group_create` - Group elements together to move as a unit
- `group_ungroup` - Ungroup previously grouped elements

**Element State:**
- `lock_elements` - Lock elements to prevent accidental modification
- `unlock_elements` - Unlock previously locked elements

**Available MCP Resources:**
- `canvas://main/state` - Read canvas state and elements
- `health://check` - Server health metrics

### Step 4: Start Frontend (Optional)

The frontend is optional and runs independently:

```bash
cd frontend
npm run dev
```

Frontend will be available at: `http://localhost:5173`

### Step 5: Test MCP Commands

Test the MCP server using curl or your MCP client:

```bash
# Health check
curl http://localhost:3333/health

# Create a rectangle via MCP
curl -X POST http://localhost:3333/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "element_create",
      "arguments": {
        "type": "rectangle",
        "x": 100,
        "y": 100,
        "width": 200,
        "height": 150,
        "strokeColor": "#c92a2a",
        "backgroundColor": "#ffd43b"
      }
    }
  }'

# Query all elements
curl -X POST http://localhost:3333/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "element_query",
      "arguments": {}
    }
  }'

# Read canvas state
curl -X POST http://localhost:3333/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "resources/read",
    "params": {
      "uri": "canvas://main/state"
    }
  }'
```

### Troubleshooting

**Problem**: Port 3333 already in use
```bash
# Change PORT in backend/.env
PORT=3334
WS_PORT=3334

# Update frontend/.env
VITE_MCP_SERVER_URL=http://localhost:3334
VITE_WS_SERVER_URL=ws://localhost:3334
```

**Problem**: Module not found errors
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
```

**Problem**: TypeScript compilation errors
```bash
# Rebuild
npm run build
```

## Docker Deployment

Run the entire system using Docker Compose with hot-reload support for development.

### Prerequisites

- Docker 20.10+ and Docker Compose 1.29+
- Ports 3333 (backend) and 8080 (frontend) available

### Quick Start

**Start all services**:
```bash
docker-compose up
```

Frontend: `http://localhost:8080`
Backend: `http://localhost:3333`

**With rebuild** (after code changes):
```bash
docker-compose up --build
```

**Detached mode** (run in background):
```bash
docker-compose up -d
```

**View logs**:
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
```

**Stop services**:
```bash
docker-compose down
```

**Stop and remove volumes** (deletes persisted canvas data):
```bash
docker-compose down -v
```

### Architecture

**Services**:
1. **backend**: Node.js 18 Alpine (MCP server + WebSocket + REST API)
2. **frontend**: Nginx Alpine (Static React SPA)

**Volumes**:
- `canvas-data`: Persistent canvas storage (survives container restarts)
- `./backend/src`: Hot-reload for backend development (read-only mount)

**Networking**:
- Custom bridge network `excalidraw-network`
- Frontend depends on backend health check
- Services communicate via service names

### Health Checks

Both services have built-in health checks:

```bash
# Check backend health
curl http://localhost:3333/health

# Check frontend health
curl http://localhost:8080/health
```

Docker automatically restarts unhealthy containers.

### Development vs Production

**Development** (with hot-reload):
```yaml
# docker-compose.yml - backend volumes section
volumes:
  - canvas-data:/app/data
  - ./backend/src:/app/src:ro  # Enabled
```

**Production** (no hot-reload):
```yaml
volumes:
  - canvas-data:/app/data
  # - ./backend/src:/app/src:ro  # Disabled
```

Comment out hot-reload volumes in production for better performance.

### Environment Variables

Override defaults in `docker-compose.yml`:

```yaml
environment:
  - PORT=3333
  - WS_PORT=3333
  - NODE_ENV=production
  - LOG_LEVEL=info
  - VITE_MCP_SERVER_URL=http://localhost:3333
  - VITE_WS_SERVER_URL=ws://localhost:3333
```

### Data Persistence

Canvas data persists in Docker volume `canvas-data`:

```bash
# Inspect volume
docker volume inspect excalidraw-mcp_canvas-data

# Backup data
docker run --rm -v excalidraw-mcp_canvas-data:/data -v $(pwd):/backup alpine tar czf /backup/canvas-backup.tar.gz -C /data .

# Restore data
docker run --rm -v excalidraw-mcp_canvas-data:/data -v $(pwd):/backup alpine tar xzf /backup/canvas-backup.tar.gz -C /data
```

### Troubleshooting

**Problem**: Port 3333 or 8080 already in use
```bash
# Change ports in docker-compose.yml
ports:
  - "3334:3333"  # backend
  - "8081:80"    # frontend
```

**Problem**: Services won't start
```bash
# Check logs
docker-compose logs

# Rebuild from scratch
docker-compose down -v
docker-compose build --no-cache
docker-compose up
```

**Problem**: Frontend can't connect to backend
```bash
# Ensure backend is healthy
docker-compose ps

# Check backend logs
docker-compose logs backend

# Verify network
docker network inspect excalidraw-mcp_excalidraw-network
```

**Problem**: Changes not reflecting (hot-reload not working)
```bash
# Ensure volume mount is correct
docker-compose config | grep volumes

# Restart services
docker-compose restart
```

### Custom Dockerfile Builds

**Backend only**:
```bash
cd backend
docker build -t excalidraw-mcp-backend .
docker run -p 3333:3333 -v canvas-data:/app/data excalidraw-mcp-backend
```

**Frontend only**:
```bash
cd frontend
docker build -t excalidraw-mcp-frontend .
docker run -p 8080:80 excalidraw-mcp-frontend
```

## Frontend Standalone Usage

The frontend can be used **independently** without the backend MCP server. All data is persisted to browser localStorage.

### Starting the Frontend

```bash
cd frontend
npm run dev
```

Frontend will be available at: `http://localhost:5173`

### Features

**Theme Management**
- Click the menu icon (☰) in the top-left
- Select **Theme** → Choose Light, Dark, or System
- Theme preference is saved to localStorage

**Drawing**
- Use toolbar on the left to select shapes (rectangle, circle, diamond, arrow, line, text, freedraw)
- Click and drag on canvas to create elements
- Select elements to edit properties (color, stroke, size)
- Use mouse wheel or pinch gesture to zoom
- Click and drag canvas to pan

**Persistence**
- Canvas automatically saves to localStorage every second
- Viewport position (scroll, zoom) is also persisted
- Refresh page to verify persistence

**Export Options**
- Click menu icon (☰) → **Export**
- **Export as PNG**: High-quality raster image
- **Export as SVG**: Vector format (scalable, editable)
- **Export as JSON**: Full Excalidraw format (`.excalidraw` file)

**Clear Canvas**
- Click menu icon (☰) → **Canvas** → **Clear Canvas**
- Confirms before deleting all elements
- Also clears localStorage

### Keyboard Shortcuts

Standard Excalidraw shortcuts are available:
- `V` - Selection tool
- `R` - Rectangle
- `D` - Diamond
- `O` - Ellipse
- `A` - Arrow
- `L` - Line
- `T` - Text
- `Delete` - Delete selected elements
- `Ctrl+Z` / `Cmd+Z` - Undo
- `Ctrl+Shift+Z` / `Cmd+Shift+Z` - Redo
- `Ctrl+D` / `Cmd+D` - Duplicate
- `Ctrl+A` / `Cmd+A` - Select all

### Integration with Backend

The frontend can sync with the backend in real-time via WebSocket. See **Real-Time Sync** section below for full details.

## Usage

### MCP Tools

```bash
# Example: Create a rectangle
curl -X POST http://localhost:3333/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "element_create",
      "arguments": {
        "type": "rectangle",
        "x": 100,
        "y": 100,
        "width": 200,
        "height": 150
      }
    }
  }'
```

More usage examples in the [Quickstart Guide](./specs/001-excalidraw-mcp-server/quickstart.md).

## MCP Server Configuration for IDEs

Integrate the Excalidraw MCP Server with AI-powered IDEs for programmatic diagram control.

### Prerequisites

Ensure your backend server is running:

```bash
# Option 1: Development mode
npm run dev:all

# Option 2: Production build
npm run build && npm run start:all
```

The MCP server will be available on **stdio** (stdin/stdout), and the HTTP/WebSocket server on **http://localhost:3333**.

### Quick Reference

| IDE | Config File | Location |
|-----|-------------|----------|
| **Claude Desktop** | `claude_desktop_config.json` | Platform-specific (see below) |
| **Claude Code** | `.mcp.json` | Project root |
| **Cursor** | `mcp.json` | `.cursor/` directory |

### Configuration for Claude Desktop

**Config file locations:**
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

**Local Development (Recommended):**

```json
{
  "mcpServers": {
    "excalidraw": {
      "command": "node",
      "args": ["/absolute/path/to/excalidraw-mcp/backend/dist/index.js"],
      "env": {
        "CANVAS_DATA_DIR": "/absolute/path/to/excalidraw-mcp/backend/data",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

**Important:** Replace `/absolute/path/to/excalidraw-mcp` with your actual project path.

**Docker (Alternative):**

```json
{
  "mcpServers": {
    "excalidraw": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-v", "/path/to/canvas-data:/app/data",
        "excalidraw-mcp-backend"
      ]
    }
  }
}
```

First build the Docker image:
```bash
cd backend
docker build -t excalidraw-mcp-backend .
```

### Configuration for Claude Code

Create or edit `.mcp.json` in your **project root**:

**Local Development (Recommended):**

```json
{
  "mcpServers": {
    "excalidraw": {
      "command": "node",
      "args": ["backend/dist/index.js"],
      "env": {
        "CANVAS_DATA_DIR": "./backend/data",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

**Using Claude CLI:**

```bash
# Project-scoped (recommended)
claude mcp add --scope project --transport stdio excalidraw \
  -- node backend/dist/index.js

# User-scoped (available across all projects)
claude mcp add --scope user --transport stdio excalidraw \
  -- node /absolute/path/to/excalidraw-mcp/backend/dist/index.js
```

### Configuration for Cursor IDE

Edit `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "excalidraw": {
      "command": "node",
      "args": ["/absolute/path/to/excalidraw-mcp/backend/dist/index.js"],
      "env": {
        "CANVAS_DATA_DIR": "/absolute/path/to/excalidraw-mcp/backend/data",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CANVAS_DATA_DIR` | `./data` | Directory for canvas persistence |
| `LOG_LEVEL` | `info` | Logging level (debug, info, warn, error) |
| `SERVER_NAME` | `excalidraw-mcp-server` | MCP server identifier |
| `SERVER_VERSION` | `1.0.0` | Server version |

### Verification

After configuring your IDE:

1. **Restart the IDE** to load the new MCP server configuration
2. **Open a new conversation** in the AI assistant
3. **Test the connection** by asking:

```
Create a simple diagram with a rectangle and circle using Excalidraw MCP
```

The AI should use the MCP tools to create elements that appear in the frontend (if running).

### Troubleshooting

**Problem**: MCP server not detected
```bash
# Verify the backend is built
cd backend && npm run build

# Check the dist folder exists
ls -la backend/dist/

# Test MCP server directly
echo '{"jsonrpc":"2.0","method":"initialize","id":1}' | node backend/dist/index.js
```

**Problem**: Permission denied
```bash
# Ensure the backend is executable
chmod +x backend/dist/index.js

# Verify Node.js is in PATH
which node
```

**Problem**: Canvas data not persisting
```bash
# Check data directory exists and is writable
mkdir -p backend/data
chmod 755 backend/data
```

## Real-Time Sync

The frontend and backend sync bidirectionally via WebSocket, enabling multi-client collaboration and persistence.

### How It Works

**Architecture**:
```
Frontend (Browser)  ←→  WebSocket  ←→  Backend (Node.js)  ←→  JSON Storage
     ↓                                        ↓
localStorage                          MCP Tools (stdio)
```

**Connection Flow**:
1. Frontend connects to `ws://localhost:3333` on page load
2. Backend sends initial canvas state
3. Frontend enables auto-sync (toggle in menu)
4. Changes propagate in real-time to all connected clients

**Source Tracking** (prevents echo loops):
- Each message has `source: 'mcp' | 'frontend'`
- Clients ignore messages from their own source
- Prevents infinite update loops

### Features

**Auto-Sync (Toggle in Menu)**:
- **ON**: Changes sync automatically every 3 seconds (throttled)
- **OFF**: Standalone mode (localStorage only)
- Connection status indicator shows green when connected

**Manual Sync**:
- Menu → **Sync** → **Sync to Backend Now**: Force immediate sync
- Menu → **Sync** → **Load from Backend**: Pull latest from backend

**Multi-Client Support**:
1. Open frontend in multiple browser tabs/windows
2. Draw in one tab
3. Watch changes appear in other tabs in real-time

**Offline Handling**:
- WebSocket reconnects automatically with exponential backoff
- Messages buffer while offline (max 100)
- Sends buffered messages when reconnected

### Testing Real-Time Sync

**Step 1: Start Both Servers**
```bash
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev
```

**Step 2: Open Multiple Tabs**
```bash
# Open http://localhost:5173 in 2+ browser tabs
```

**Step 3: Enable Auto-Sync**
- In each tab: Menu (☰) → **Sync** → **Auto-Sync: OFF** → Click to turn **ON**
- Connection indicator should show green "Connected"

**Step 4: Draw and Observe**
- Draw a rectangle in Tab 1
- Watch it appear in Tab 2 within 3 seconds
- Changes persist to backend automatically

**Step 5: Test MCP Integration**
```bash
# Create element via MCP while frontend is open
curl -X POST http://localhost:3333/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "element_create",
      "arguments": {
        "type": "ellipse",
        "x": 300,
        "y": 300,
        "width": 100,
        "height": 100,
        "strokeColor": "#5f3dc4"
      }
    }
  }'

# Element appears in ALL open frontend tabs immediately
```

### API Endpoints

**HTTP REST API**:
- `GET /api/canvas/main` - Get current canvas state
- `POST /api/canvas/main/sync` - Sync elements to backend
- `GET /health` - Health check with metrics

**WebSocket Messages**:
- `sync_request` - Request full canvas sync
- `sync_to_backend` - Send elements to persist
- `sync_response` - Receive updated elements
- `element_created` - Broadcast new element
- `element_updated` - Broadcast element change
- `element_deleted` - Broadcast element deletion

### Troubleshooting

**Problem**: Connection indicator shows red "Disconnected"
```bash
# Check backend is running
curl http://localhost:3333/health

# Check WebSocket port
lsof -i :3333

# Restart backend
cd backend && npm run dev
```

**Problem**: Changes don't sync between tabs
```bash
# Ensure auto-sync is enabled in ALL tabs
# Menu → Sync → Auto-Sync: ON

# Check browser console for WebSocket errors
# Open DevTools → Console tab
```

**Problem**: "Failed to sync" error
```bash
# Check backend logs
tail -f backend/logs/combined.log

# Verify canvas data directory exists
ls -la backend/data/

# Ensure write permissions
chmod 755 backend/data
```

## Testing

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test

# Integration tests
cd backend
npm run test:integration
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Support

- **GitHub Repository**: [https://github.com/whallysson/excalidraw-mcp](https://github.com/whallysson/excalidraw-mcp)
- **Issues**: [Report bugs and feature requests](https://github.com/whallysson/excalidraw-mcp/issues)
- **Discussions**: [Ask questions and share ideas](https://github.com/whallysson/excalidraw-mcp/discussions)
- **Logs**: Check `backend/logs/` for structured JSON logs

