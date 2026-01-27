# 🏗️ ARCHITECTURE GUIDE - Duo Horde Survivor

Technical deep-dive for developers extending the game.

## 📐 High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Phaser Game                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │              Scene Manager                       │  │
│  │  ┌────────┐  ┌─────────┐  ┌──────────┐         │  │
│  │  │  Menu  │→ │  Game   │→ │ GameOver │         │  │
│  │  └────────┘  └────┬────┘  └──────────┘         │  │
│  │                   ↓                              │  │
│  │            ┌──────────────┐                      │  │
│  │            │   Upgrade    │                      │  │
│  │            └──────────────┘                      │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─────────────────── GameScene ────────────────────┐  │
│  │                                                   │  │
│  │  ┌─────────────┐      ┌──────────────┐          │  │
│  │  │   Systems   │      │   Entities   │          │  │
│  │  ├─────────────┤      ├──────────────┤          │  │
│  │  │ Combat      │──────│ Players (2)  │          │  │
│  │  │ Spawn       │      │ Enemies (N)  │          │  │
│  │  │ Upgrade     │      │ Projectiles  │          │  │
│  │  │ Revive      │      │ XP Gems      │          │  │
│  │  └─────────────┘      └──────────────┘          │  │
│  │                                                   │  │
│  │  ┌────────────────────────────────────────────┐  │  │
│  │  │          Component Layer                   │  │  │
│  │  │  Health | Weapon | BuffContainer           │  │  │
│  │  └────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

## 🎯 Design Patterns

### 1. Entity-Component System (Lite)

**Pattern**: Entities own Components, not full ECS

```typescript
// Entity (Player)
class Player {
  health: Health;        // Component
  weapon: Weapon;        // Component
  buffs: BuffContainer;  // Component
  
  update() {
    // Entity logic
  }
}

// Component (Health)
class Health {
  damage(amount: number): void { }
  heal(amount: number): void { }
}
```

**Why**: Simpler than full ECS, good enough for small game. Components are reusable.

### 2. Object Pooling

**Pattern**: Pre-allocate objects, reuse instead of new/destroy

```typescript
// Pool initialization
for (let i = 0; i < 1000; i++) {
  const projectile = new Projectile(scene);
  projectiles.add(projectile);
}

// Reuse from pool
const projectile = projectiles.getFirstDead() as Projectile;
projectile.activate(data);

// Return to pool
projectile.deactivate();
```

**Why**: Avoids garbage collection spikes, maintains 60 FPS

### 3. Event-Driven Communication

**Pattern**: Systems communicate via scene events

```typescript
// Emit from anywhere
this.scene.events.emit('enemyKilled', enemy);

// Listen in system
this.scene.events.on('enemyKilled', this.onEnemyKilled, this);
```

**Why**: Decouples systems, easy to extend

### 4. Data-Driven Design

**Pattern**: Behavior defined in JSON, not code

```json
// enemies.json
{
  "shambler": {
    "hp": 100,
    "speed": 30,
    "damage": 15
  }
}
```

**Why**: Non-programmers can tweak, easy iteration

## 🔧 Core Systems Explained

### CombatSystem

**Purpose**: Manage all damage calculations and hit detection

**Responsibilities**:
- Setup physics collisions
- Calculate damage with modifiers (crits, buffs)
- Check synergies between players
- Display damage numbers
- Create explosion effects

**Key Methods**:
```typescript
setupCollisions()           // Initialize Arcade Physics overlaps
onProjectileHitEnemy()      // Handle damage + synergies
createExplosion()           // AOE damage in radius
checkMarkDetonateSynergy()  // Synergy detection
```

**Extension Points**:
- Add new synergy checks in `checkMarkDetonateSynergy()`
- Add damage types (fire, ice, etc.)
- Implement status effects (burn, freeze)

### SpawnSystem

**Purpose**: Manage enemy waves and scaling

**Responsibilities**:
- Read wave data from JSON
- Spawn enemies at intervals
- Apply difficulty scaling per minute
- Enforce max enemy cap (800)

**Scaling Formula**:
```typescript
hp = baseHp * (1.08 ^ minutes) * 1.4 (duo multiplier)
speed = baseSpeed * (1 + 0.02 * minutes) // capped at 130%
```

**Extension Points**:
- Add boss wave logic
- Implement elite enemy variants
- Add special events (double XP wave, etc.)

### UpgradeSystem

**Purpose**: Handle XP, leveling, and upgrades

**Responsibilities**:
- Track shared XP pool
- Calculate level thresholds (exponential)
- Generate upgrade choices
- Apply upgrades to players
- Detect synergies

**Level Scaling**:
```typescript
xpThreshold[level] = 100 * (1.5 ^ level)
// Level 1: 100 XP
// Level 2: 150 XP
// Level 3: 225 XP
// etc.
```

**Extension Points**:
- Add upgrade prerequisites/trees
- Implement upgrade refund
- Add meta-progression (permanent upgrades)

### ReviveSystem

**Purpose**: Death and resurrection mechanics

**Responsibilities**:
- Track player death timers
- Auto-revive after 8 seconds
- Game over if both dead for 10 seconds
- Trigger notifications

**Flow**:
```
Player Dies
    ↓
8s Timer Starts
    ↓
Check: Is Partner Alive?
    ↓
Yes → Auto-Revive with Invuln
    ↓
No → Game Over Timer (10s)
```

**Extension Points**:
- Add manual revive (partner walks to corpse)
- Implement revive tokens (limited uses)
- Add penalty/bonus on revive

## 📦 Entity Deep Dive

### Player

**Core Features**:
- Dual input systems (WASD / Arrows)
- Auto-attack toward nearest enemy
- Manual heavy weapon
- Upgrade tracking
- Revive state machine

**State Machine**:
```
Alive ←→ Dead ←→ Reviving ←→ Invulnerable → Alive
```

**Upgrade Application**:
```typescript
applyUpgrade(id, data) {
  switch(data.effect.type) {
    case 'stat': modifyStat(); break;
    case 'onHit': enableFlag(); break;
    case 'onCrit': enableFlag(); break;
  }
}
```

**Extension Points**:
- Add dash ability
- Implement character classes
- Add melee attacks

### Enemy

**Core Features**:
- AI: Follow nearest player
- Attack on cooldown
- Shape-based rendering
- Shieldbearer: directional shield
- Sniper: laser charging

**AI Flow**:
```typescript
update() {
  findNearestPlayer();
  if (stationary) {
    handleSniperBehavior();
  } else {
    moveTowardTarget();
    attackIfInRange();
  }
}
```

**Extension Points**:
- Add flee behavior (at low HP)
- Implement formations
- Add boss-specific AI

### Projectile

**Core Features**:
- Velocity-based movement
- Pierce mechanic (hit N enemies)
- Lifetime timer (3 seconds)
- Visual feedback on hit

**Pooling Implementation**:
```typescript
activate(data) {
  this.active = true;
  this.setPosition(x, y);
  this.body.setVelocity(vx, vy);
  this.spawnTime = now;
}

deactivate() {
  this.active = false;
  this.setVisible(false);
  this.body.setVelocity(0, 0);
}
```

**Extension Points**:
- Add homing projectiles
- Implement bouncing bullets
- Add projectile splitting

## 🎨 Rendering Pipeline

### Layer Order (Z-index)
```
5. UI (HUD, notifications)     - setScrollFactor(0)
4. Particles (effects)          - Alpha blending
3. Projectiles                  - Normal rendering
2. Players / Enemies            - Normal rendering
1. Background (if added)        - Parallax optional
```

### Camera System

**Strategy**: Follow midpoint of both players

```typescript
updateCameraTarget(players) {
  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;
  
  camera.scrollX += (midX - camera.scrollX) * 0.1; // Smooth lerp
  camera.scrollY += (midY - camera.scrollY) * 0.1;
}
```

**Extension**: Add zoom based on player distance
```typescript
const distance = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
const targetZoom = 1 - (distance / 1000) * 0.3; // Max 30% zoom out
camera.setZoom(Phaser.Math.Linear(camera.zoom, targetZoom, 0.05));
```

## ⚡ Performance Optimization

### Current Optimizations

1. **Object Pooling**
   - 500 enemies pre-allocated
   - 1000 projectiles pre-allocated
   - Zero instantiation during gameplay

2. **Update Culling**
   ```typescript
   // Only update active entities
   if (!entity.active) return;
   ```

3. **Physics Groups**
   - Arcade Physics with broadphase
   - Group-based collision detection

### Planned Optimizations

1. **Spatial Hashing**
   ```typescript
   // Only check nearby enemies for target selection
   const nearbyEnemies = spatialHash.query(player.x, player.y, 400);
   ```

2. **Update Batching**
   ```typescript
   // Update every N frames for distant enemies
   if (distanceToCamera > 600 && frame % 3 !== 0) return;
   ```

3. **Sprite Atlas**
   ```typescript
   // Pack all sprites into single texture
   this.load.atlas('game', 'sprites.png', 'sprites.json');
   ```

## 🔌 Extension API

### Adding a New Upgrade

1. Define in `upgrades.json`:
```json
{
  "my_upgrade": {
    "id": "my_upgrade",
    "name": "My Upgrade",
    "description": "Does cool stuff",
    "effect": {
      "type": "stat",
      "stat": "moveSpeed",
      "value": 0.5
    }
  }
}
```

2. Handle in `Player.applyUpgrade()` if needed:
```typescript
if (upgradeId === 'my_upgrade') {
  // Custom logic
}
```

3. Add synergy check in `CombatSystem` if needed

### Adding a New Enemy

1. Define in `enemies.json`:
```json
{
  "my_enemy": {
    "id": "my_enemy",
    "hp": 200,
    "speed": 50,
    "damage": 25,
    "shape": "triangle"
  }
}
```

2. Add custom behavior in `Enemy.update()`:
```typescript
if (this.enemyData.id === 'my_enemy') {
  // Custom AI
}
```

3. Add to wave in `waves.json`

### Adding a System

1. Create `src/systems/MySystem.ts`:
```typescript
export class MySystem {
  private scene: Phaser.Scene;
  
  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.setupListeners();
  }
  
  setupListeners() {
    this.scene.events.on('myEvent', this.handle, this);
  }
  
  update(time: number, delta: number) {
    // Per-frame logic
  }
}
```

2. Initialize in `GameScene.create()`:
```typescript
this.mySystem = new MySystem(this);
```

3. Update in `GameScene.update()`:
```typescript
this.mySystem.update(time, delta);
```

## 🧪 Testing Strategy

### Manual Testing Checklist

- [ ] Both players can move independently
- [ ] Auto-attacks work
- [ ] Heavy weapons consume ammo
- [ ] Enemies pathfind correctly
- [ ] Damage numbers appear
- [ ] XP collection works
- [ ] Level up triggers upgrade screen
- [ ] Upgrades apply correctly
- [ ] Synergies activate
- [ ] Death/revive works
- [ ] Game over triggers

### Debug Mode

Enable in `main.ts`:
```typescript
physics: {
  arcade: {
    debug: true // Shows collision bounds
  }
}
```

### Console Logging

Key events already logged:
- `GameScene created`
- `Wave X started`
- `Level up!`
- `Player X died/revived`
- `Synergy activated`

## 📊 Data Flow Example

**Scenario**: Player 1 shoots an enemy with Mark upgrade

```
1. Player.update()
   └→ handleAutoAttack()
      └→ weapon.fire()
         └→ scene.events.emit('createProjectile', data)

2. GameScene receives event
   └→ createProjectile()
      └→ projectilePool.getFirstDead()
         └→ projectile.activate(data)

3. CombatSystem detects collision
   └→ onProjectileHitEnemy()
      ├→ Check for crit
      ├→ Apply mark (player.hasMarkerRounds)
      ├→ enemy.mark(3000)
      ├→ Check synergy with Partner
      └→ Calculate final damage

4. Enemy.takeDamage()
   └→ health.damage(amount)
      └→ If HP <= 0:
         ├→ scene.events.emit('enemyKilled')
         └→ scene.events.emit('dropXP')

5. SpawnSystem.onEnemyKilled()
   └→ activeEnemyCount--

6. XPGem spawns
   └→ Player collects via CombatSystem collision

7. UpgradeSystem.addXP()
   └→ Check for level up
      └→ If level up:
         └→ scene.scene.launch('UpgradeScene')
```

## 🎓 Best Practices

### Code Organization
- Keep scenes < 500 lines (split into systems)
- One responsibility per system
- Data in JSON, logic in code
- Events for cross-system communication

### Performance
- Use object pools for frequent instantiation
- Avoid `new` in update loops
- Batch similar operations
- Profile with Chrome DevTools

### Maintainability
- Document complex algorithms
- Use TypeScript types everywhere
- Keep JSON schemas consistent
- Version control everything

---

**Ready to extend?** Pick a system, read the code, and start building! 🚀
