# 🚀 QUICK START GUIDE - Duo Horde Survivor

Get the game running in **5 minutes**.

## Prerequisites
- Node.js 18+ installed
- A code editor (VS Code recommended)
- Terminal/Command Prompt

## Step-by-Step Setup

### 1. Navigate to Project
```bash
cd duo-survivor
```

### 2. Install Dependencies
```bash
npm install
```
This will take 1-2 minutes to download Phaser, TypeScript, and Vite.

### 3. Start Development Server
```bash
npm run dev
```

You should see:
```
  VITE v5.0.7  ready in 423 ms

  ➜  Local:   http://localhost:3000/
  ➜  press h + enter to show help
```

### 4. Open in Browser
Navigate to `http://localhost:3000`

You should see the **DUO HORDE SURVIVOR** title screen!

### 5. Play!
Press **SPACE** to start.

## ⌨️ Controls

**Player 1 (Red Circle)**
- W/A/S/D - Move
- SHIFT - Fire rocket (limited ammo)
- Auto-fires bullets automatically

**Player 2 (Blue Circle)**  
- Arrow Keys - Move
- SPACE - Fire rocket (limited ammo)
- Auto-fires shotgun automatically

## 🎮 Gameplay Tips

1. **Stay Together**: Many enemies require coordination
2. **Watch HP Bars**: They show above each player
3. **Collect XP**: Blue/green/yellow gems drop from enemies
4. **Choose Upgrades**: When you level up, game pauses for selection
5. **Try Synergy**: Pick Marker Rounds (P1) + Detonator (P2) for massive damage

## 🐛 Troubleshooting

### Game won't start
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### TypeScript errors
```bash
# Rebuild TypeScript
npm run build
```

### Port 3000 in use
Edit `vite.config.ts`:
```typescript
server: {
  port: 3001 // Change to any free port
}
```

### Black screen on load
- Check browser console (F12) for errors
- Make sure you're using a modern browser (Chrome, Firefox, Edge)
- Try incognito/private mode

## 📦 Building for Production

When ready to deploy:

```bash
npm run build
```

Output goes to `dist/` folder. Upload to:
- Netlify (drag-and-drop)
- itch.io (zip the dist folder)
- GitHub Pages
- Any static host

## 🎯 What to Test First

### Core Mechanics (5 min)
1. ✅ Both players move independently
2. ✅ Auto-attacks hit enemies
3. ✅ Heavy weapons fire on key press
4. ✅ HP bars decrease when hit
5. ✅ XP collection works

### Systems (10 min)
1. ✅ Level up after collecting XP
2. ✅ Upgrade selection pauses game
3. ✅ Upgrades apply correctly
4. ✅ Players revive after 8 seconds
5. ✅ Game over after both die

### Enemy Types (15 min)
1. ✅ Swarmers - fast red triangles
2. ✅ Shamblers - slow brown squares
3. ✅ Shieldbearers - blue hexagons (attack from behind)
4. ✅ Snipers - purple circles (laser windup)

### Synergy (5 min)
1. ✅ P1 takes Marker Rounds
2. ✅ P2 takes Detonator
3. ✅ Watch for "SYNERGY ACTIVATED!" message
4. ✅ P2's explosions should do massive damage to marked (yellow) enemies

## 🔧 Quick Tweaks

### Make game easier
Edit `src/data/waves.json`:
```json
"duoAdjustments": {
  "hpMultiplier": 1.0,  // Was 1.4
  "countMultiplier": 1.0 // Was 1.6
}
```

### Add more ammo
Edit `src/entities/Player.ts`:
```typescript
this.stats = {
  // ...
  ammo: 10,      // Was 5
  maxAmmo: 10    // Was 5
}
```

### Faster leveling
Edit `src/systems/UpgradeSystem.ts`:
```typescript
private baseXPPerLevel: number = 50; // Was 100
```

## 📊 Performance Check

Press `F12` in browser → Console tab

You should see:
```
GameScene created
Game started!
Wave 1 started!
```

FPS should be 60 (check top-right if you enable debug mode)

## 🎨 Visual Customization

### Change player colors
Edit `src/scenes/GameScene.ts`:
```typescript
const player1 = new Player(this, {
  color: 0x00ff00, // Green instead of red
  // ...
});
```

### Change enemy colors
Edit `src/data/enemies.json`:
```json
"shambler": {
  "color": "0xFF0000" // Hex color
}
```

## ⚡ Next Steps

Once everything works:

1. Read `README.md` for full documentation
2. Check `src/data/` files to understand data structure
3. Try adding a new upgrade in `upgrades.json`
4. Experiment with wave timing in `waves.json`
5. Move on to Phase 2 features!

## 🆘 Need Help?

Common issues and solutions:

| Issue | Solution |
|-------|----------|
| Module not found | Run `npm install` |
| TypeScript error | Check imports match file structure |
| Game freezes | Check browser console for infinite loops |
| No enemies spawn | Check `waves.json` has valid times |
| Players don't move | Check keyboard focus on game window |

## 📝 Development Workflow

Recommended:
1. Make code changes
2. Vite hot-reloads automatically
3. Test in browser (refresh if needed)
4. Check console for errors
5. Iterate!

---

**You're ready to go!** Press SPACE and survive the horde. 🎮
