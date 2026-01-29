# 🎮 Grimfall - Online Co-op Multiplayer Setup

## Architecture Overview

Grimfall uses a **relay server model** for online multiplayer, similar to how chess.com works:

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────┐
│   Player 1  │ ◄─────► │   Relay Server   │ ◄─────► │   Player 2  │
│   (Host)    │   WS    │   (WebSocket)    │   WS    │   (Guest)   │
└─────────────┘         └──────────────────┘         └─────────────┘
```

## Game Flow

1. **Menu** → Click "Play Online"
2. **Lobby** → Create room (get shareable code) OR Join room (enter friend's code)
3. **Weapon Select** → Each player picks their weapon (synced in real-time)
4. **Game** → Host runs game logic, state synced to guest

## Running Locally (Development)

### 1. Start the Game Client
```bash
cd "c:\Users\yunus\OneDrive\Masaüstü\New folder"
npm run dev
# Opens at http://localhost:3000
```

### 2. Start the Relay Server (for online play)
```bash
cd server
npm install
npm run dev
# Runs at ws://localhost:8080
```

### 3. Configure Server URL
In `src/systems/NetworkManager.ts`, update the init call:
```typescript
// For local testing
network.init('ws://localhost:8080');

// For production (after deploying server)
network.init('wss://your-server.onrender.com');
```

## Deploying the Relay Server

### Option 1: Render.com (Recommended - Free)
1. Push server folder to GitHub
2. Create new "Web Service" on Render
3. Set build command: `npm install`
4. Set start command: `npm start`
5. Get your URL: `wss://your-app.onrender.com`

### Option 2: Railway.app (Free)
1. Connect GitHub repo
2. Deploy server folder
3. Get your URL from Railway dashboard

### Option 3: Fly.io (Free tier)
```bash
cd server
fly launch
fly deploy
```

## Deploying the Game Client

### GitHub Pages (Free)
```bash
npm run build
# Upload dist/ folder to GitHub Pages
```

### Netlify/Vercel (Free)
1. Connect repo
2. Build command: `npm run build`
3. Publish directory: `dist`

## Shareable Links

When a player creates a room, they get a link like:
```
https://your-game.netlify.app/?room=ABC123
```

The friend clicks this link → Auto-joins the room!

## Network Messages

| Message | Direction | Purpose |
|---------|-----------|---------|
| `create_room` | Client→Server | Host creates new room |
| `room_created` | Server→Client | Returns room code |
| `join_room` | Client→Server | Guest joins with code |
| `room_joined` | Server→Client | Confirms join, sends room state |
| `player_joined` | Server→Host | Notifies host of guest |
| `weapon_selected` | Bidirectional | Syncs weapon choices |
| `player_ready` | Bidirectional | Ready state |
| `game_start` | Host→Server→Guest | Start the game |
| `player_input` | Client→Server→Partner | Real-time input sync |
| `game_state` | Host→Server→Guest | Authoritative state sync |

## Testing Multiplayer Locally

1. Open browser tab 1 → Create room → Copy code
2. Open browser tab 2 → Join room → Paste code
3. Both select weapons → Host starts game

## Solo Mode (Offline Testing)

Click "Solo Practice" in the lobby to test without networking.
The AI partner will auto-select a random weapon.

## Security Notes

- Room codes are 6 characters (A-Z, 2-9), ~1.5 billion combinations
- Rooms expire after 30 minutes of inactivity
- No persistent storage - all data in memory
- Host is authoritative for game state (prevents cheating)
