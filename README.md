# Duo Horde Survivor - Phase 1 MVP

A 2D co-op horde survivor game built with Phaser 3 and TypeScript.

## 🎮 What's Implemented (Phase 1 MVP)

### Core Systems
- ✅ **Player System**: Two players with independent controls (WASD + Arrows)
- ✅ **Auto-Attack Weapons**: Rapid-fire gun (P1) and shotgun (P2)
- ✅ **Heavy Weapons**: Rocket launcher with limited ammo
- ✅ **Enemy Types**: 4 enemy types (Shambler, Swarmer, Shieldbearer, Sniper)
- ✅ **Wave Spawning**: Dynamic enemy waves with scaling difficulty
- ✅ **XP & Leveling**: Shared XP pool, individual upgrade choices
- ✅ **Upgrades**: 5 upgrades including Mark & Detonate synergy
- ✅ **Revive System**: 8-second auto-revive, 10-second game over window
- ✅ **Object Pooling**: Pre-allocated pools for enemies, projectiles, XP gems

### Features
- Same-screen co-op (camera follows midpoint between players)
- Health bars and damage numbers
- Pierce mechanics
- Critical hits with explosion effects
- Shieldbearer front-shield mechanics
- Sniper laser charging
- XP collection with magnetization
- Upgrade selection screen
- Game over screen with stats

## 📁 Project Structure

```
duo-survivor/
├── src/
│   ├── components/
│   │   ├── Health.ts
│   │   ├── Weapon.ts
│   │   └── BuffContainer.ts
│   ├── entities/
│   │   ├── Player.ts
│   │   ├── Enemy.ts
│   │   ├── Projectile.ts
│   │   └── XPGem.ts
│   ├── systems/
│   │   ├── CombatSystem.ts
│   │   ├── SpawnSystem.ts
│   │   ├── UpgradeSystem.ts
│   │   └── ReviveSystem.ts
│   ├── scenes/
│   │   ├── MenuScene.ts
│   │   ├── GameScene.ts
│   │   ├── UpgradeScene.ts
│   │   └── GameOverScene.ts
│   ├── data/
│   │   ├── enemies.json
│   │   ├── upgrades.json
│   │   └── waves.json
│   ├── types/
│   │   └── GameTypes.ts
│   └── main.ts
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 🚀 Setup Instructions

### 1. Install Dependencies
```bash
cd duo-survivor
npm install
```

### 2. Run Development Server
```bash
npm run dev
```

Open your browser to `http://localhost:3000`

### 3. Build for Production
```bash
npm run build
npm run preview
```

## 🎮 Controls

**Player 1 (Red)**
- WASD - Movement
- SHIFT - Heavy Weapon
- Auto-attack - Automatic toward nearest enemy

**Player 2 (Blue)**
- Arrow Keys - Movement
- SPACE - Heavy Weapon
- Auto-attack - Automatic toward nearest enemy

## 🎯 Gameplay Features

### Enemy Types
1. **Shambler** (Brown Square)
   - Slow, high HP, melee
   - Strategy: Kite with one player, DPS with other

2. **Swarmer** (Red Triangle)
   - Fast, low HP, surrounds players
   - Strategy: One baits, one clears flanks

3. **Shieldbearer** (Blue Hexagon)
   - Front shield blocks 70% damage
   - Strategy: Attack from opposite sides

4. **Sniper** (Purple Circle)
   - Stationary, long-range laser with windup
   - Strategy: One draws fire, one flanks

### Upgrades (MVP)
1. **Rapid Fire** - +30% fire rate
2. **Armor Plating** - +25 max HP, +10% damage reduction
3. **Marker Rounds** - Marks enemies for 3s (synergy with Detonate)
4. **Detonate Shot** - Crits create explosions (synergy with Marker)
5. **Combat Rush** - +20% movement speed

### Synergy Example
If Player 1 has **Marker Rounds** and Player 2 has **Detonate Shot**:
- P1's bullets mark enemies (yellow tint)
- P2's critical explosions deal **+200% damage** to marked enemies
- Visual feedback: "SYNERGY ACTIVATED!" notification

## 🔧 Architecture Highlights

### Data-Driven Design
- All enemies, upgrades, and waves defined in JSON
- Easy to add new content without code changes
- Example: Add new enemy by editing `enemies.json`

### Object Pooling
- 500 enemies pre-allocated
- 1000 projectiles pre-allocated
- 500 XP gems pre-allocated
- Target: Maintain 60 FPS with hundreds of entities

### Systems Architecture
- **CombatSystem**: Damage calculation, hit detection, synergies
- **SpawnSystem**: Wave management, difficulty scaling
- **UpgradeSystem**: XP tracking, level-ups, upgrade application
- **ReviveSystem**: Death/revive mechanics, game over logic

### Component-Based Entities
- **Health Component**: HP management, damage reduction
- **Weapon Component**: Fire rate, damage, pierce
- **BuffContainer**: Temporary buffs with timers

## 🐛 Known Issues / TODOs

- [ ] Boss spawning not implemented yet
- [ ] Heavy weapon ammo refill needs balancing
- [ ] Camera zoom adjustment for player distance
- [ ] Audio system not implemented
- [ ] Particle effects are basic (no texture atlas)

## 🎯 Next Steps (Phase 2)

1. Add 10 more upgrades (5 more synergies)
2. Implement Tether Shield mechanic
3. Add Rift objective zones
4. Create Twin Reapers boss
5. Add combo meter system
6. Improve visual effects and screen shake
7. Add sound effects and music

## 🛠️ Development Tips

### Adding a New Enemy
1. Add entry to `src/data/enemies.json`
2. Enemy will automatically spawn if added to wave config
3. Special behaviors require code in `Enemy.ts`

### Adding a New Upgrade
1. Add entry to `src/data/upgrades.json`
2. Implement effect handler in `Player.applyUpgrade()`
3. For synergies, check in `CombatSystem.checkMarkDetonateSynergy()`

### Tuning Difficulty
Edit `src/data/waves.json`:
- `hpPerMinute`: Enemy HP scaling per minute
- `countPerMinute`: Additional enemies per minute
- `spawnRateMultiplier`: Spawn frequency increase

### Performance Profiling
Enable debug mode in `main.ts`:
```typescript
physics: {
  default: 'arcade',
  arcade: {
    debug: true // Shows physics bodies and FPS
  }
}
```

## 📊 Performance Targets

- 60 FPS with 300+ enemies on screen
- Object pool utilization < 80%
- Physics updates: < 10ms per frame
- Render time: < 6ms per frame

## 🎨 Visual Style

Current: Geometric shapes with solid colors (placeholder)
- Players: Colored circles with direction indicator
- Enemies: Shapes matching their type (square, triangle, hexagon, circle)
- Projectiles: Small colored circles
- Effects: Simple particle bursts

**Future**: Import sprite sheets or use procedural generation for grimdark sci-fi aesthetic

## 📝 Credits

Built with:
- Phaser 3 - Game framework
- TypeScript - Type safety
- Vite - Fast development server

---

**Status**: Phase 1 MVP Complete ✅
**Next Milestone**: Phase 2 - Full Synergy System
