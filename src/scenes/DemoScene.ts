import Phaser from 'phaser';
import { Player } from '@/entities/Player';
import { Enemy } from '@/entities/Enemy';
import { Projectile } from '@/entities/Projectile';
import { XPGem } from '@/entities/XPGem';
import { MiniBoss } from '@/entities/MiniBoss';
import { Destructible, DestructibleManager } from '@/entities/Destructible';
import { Weapon } from '@/components/Weapon';
import { CombatSystem } from '@/systems/CombatSystem';
import { VFXSystem } from '@/systems/VFXSystem';
import { AnimationSystem, PALETTE } from '@/systems/AnimationSystem';
import { CoopVFXSystem } from '@/systems/CoopVFXSystem';
import { SynergyZone } from '@/systems/SynergyZone';
import { CoopObjective } from '@/systems/CoopObjective';
import { WeaponConfig, EnemyData } from '@/types/GameTypes';
import demoConfig from '@/data/demo.json';
import enemiesData from '@/data/enemies.json';

/**
 * DemoScene - 3-minute vertical slice with ROLE-BASED CO-OP
 * 
 * ROLES:
 * 🟥 P1 = BREAKER: Knockback, applies BROKEN state (orange)
 * 🟦 P2 = AMPLIFIER: Fast shots, marks enemies, 2.5x vs BROKEN
 * 
 * SYNERGY: Break → Detonate = explosion!
 * 
 * Phases:
 * 0:00-0:30 - Learn roles
 * 0:30-1:00 - Break → Detonate combo
 * 1:00-1:40 - Rising pressure
 * 1:40-2:15 - Synergy required (dual zone objective)
 * 2:15-2:50 - Mini-Boss
 * 2:50-3:00 - Stats
 */

interface DemoStats {
  totalKills: number;
  comboKills: number;
  synergyTime: number;
  damageDealt: number;
  saves: number;
  bossKillTime: number;
  objectivesCompleted: number;
}

interface DemoPhase {
  id: string;
  name: string;
  startTime: number;
  endTime: number;
  enemies: Array<{ type: string; weight?: number; hpMultiplier: number; aggroSplit?: boolean }>;
  destructibles: number;
  hints: string[];
  bossSpawn: boolean;
  boss?: any;
  showStats?: boolean;
  coopObjective?: any;
}

export class DemoScene extends Phaser.Scene {
  // Entity pools
  private players!: Phaser.GameObjects.Group;
  private enemies!: Phaser.GameObjects.Group;
  private projectiles!: Phaser.GameObjects.Group;
  private xpGems!: Phaser.GameObjects.Group;
  
  // Systems
  private combatSystem!: CombatSystem;
  private vfxSystem!: VFXSystem;
  private animationSystem!: AnimationSystem;
  private coopVFXSystem!: CoopVFXSystem;
  private synergyZone!: SynergyZone;
  private destructibleManager!: DestructibleManager;
  private coopObjective: CoopObjective | null = null;
  
  // Demo state
  private currentPhase: number = 0;
  private phases: DemoPhase[] = demoConfig.phases as DemoPhase[];
  private elapsedTime: number = 0;
  private stats: DemoStats = {
    totalKills: 0,
    comboKills: 0,
    synergyTime: 0,
    damageDealt: 0,
    saves: 0,
    bossKillTime: 0,
    objectivesCompleted: 0
  };
  
  // Spawn tracking
  private lastSpawnTime: Map<string, number> = new Map();
  private spawnedCount: Map<string, number> = new Map();
  
  // Boss
  private miniBoss: MiniBoss | null = null;
  
  // UI
  private phaseText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private hintContainer!: Phaser.GameObjects.Container;
  private statsOverlay!: Phaser.GameObjects.Container;

  constructor() {
    super('DemoScene');
  }

  preload(): void {
    // Create particle texture
    if (!this.textures.exists('particle')) {
      const graphics = this.add.graphics();
      graphics.fillStyle(0xffffff);
      graphics.fillCircle(4, 4, 4);
      graphics.generateTexture('particle', 8, 8);
      graphics.destroy();
    }
  }

  create(): void {
    console.log('DemoScene: Starting 3-minute demo slice');
    
    // Set up smaller arena for demo
    const arena = demoConfig.arena;
    this.physics.world.setBounds(0, 0, arena.width, arena.height);
    this.cameras.main.setBounds(0, 0, arena.width, arena.height);
    
    // Create arena background
    this.createArenaBackground(arena);
    
    // Initialize systems
    this.vfxSystem = new VFXSystem(this);
    this.animationSystem = new AnimationSystem(this);
    this.coopVFXSystem = new CoopVFXSystem(this);
    this.destructibleManager = new DestructibleManager(this);
    
    // Create pools
    this.createPools();
    
    // Create players
    this.createPlayers(arena);
    
    // Initialize synergy zone
    this.synergyZone = new SynergyZone(this, {
      radius: 100,
      damageBoost: 1.30,
      fireRateBoost: 1.25,
      speedBoost: 1.15
    });
    this.synergyZone.setPlayers(this.players.getChildren() as Player[]);
    
    // Combat system
    this.combatSystem = new CombatSystem(this);
    this.combatSystem.setupCollisions(
      this.players,
      this.enemies,
      this.projectiles,
      this.xpGems
    );
    
    // Setup destructible collisions
    this.setupDestructibleCollisions();
    
    // Create UI
    this.createUI();
    
    // Event listeners
    this.setupEventListeners();
    
    // Camera follows midpoint
    this.setupCamera();
    
    // Start first phase
    this.startPhase(0);
    
    console.log('DemoScene: Ready!');
  }

  private createArenaBackground(arena: any): void {
    // Dark background
    this.add.rectangle(arena.centerX, arena.centerY, arena.width, arena.height, PALETTE.BG_DARK);
    
    // Grid lines for visual reference
    const graphics = this.add.graphics();
    graphics.lineStyle(1, PALETTE.BG_MID, 0.3);
    
    for (let x = 0; x <= arena.width; x += 100) {
      graphics.lineBetween(x, 0, x, arena.height);
    }
    for (let y = 0; y <= arena.height; y += 100) {
      graphics.lineBetween(0, y, arena.width, y);
    }
    
    // Arena border
    graphics.lineStyle(4, PALETTE.BG_LIGHT, 0.8);
    graphics.strokeRect(10, 10, arena.width - 20, arena.height - 20);
  }

  private createPools(): void {
    this.players = this.add.group({ runChildUpdate: true });
    
    this.enemies = this.add.group({
      classType: Enemy,
      maxSize: 100,
      runChildUpdate: true
    });
    for (let i = 0; i < 50; i++) {
      const enemy = new Enemy(this);
      this.enemies.add(enemy, true);
    }
    
    this.projectiles = this.add.group({
      classType: Projectile,
      maxSize: 200,
      runChildUpdate: true
    });
    for (let i = 0; i < 100; i++) {
      const proj = new Projectile(this);
      this.projectiles.add(proj, true);
    }
    
    this.xpGems = this.add.group({
      classType: XPGem,
      maxSize: 100,
      runChildUpdate: true
    });
    for (let i = 0; i < 50; i++) {
      const gem = new XPGem(this);
      this.xpGems.add(gem, true);
    }
  }

  private createPlayers(arena: any): void {
    // ============================================
    // 🟥 PLAYER 1 - BREAKER / CONTROL
    // Fantasy: Space Marine frontline enforcer
    // Role: Shapes battlefield, creates openings
    // ============================================
    const p1Weapon: WeaponConfig = {
      id: 'shockwave_cannon',
      type: 'auto',
      damage: 10,           // Lower base damage
      fireRate: 2.5,        // Slower fire rate
      projectileSpeed: 300, // Slower projectiles
      projectileSize: 10,   // Bigger projectiles
      pierce: 2,            // Pierces through enemies
      color: PALETTE.P1_PRIMARY
    };
    
    const player1 = new Player(this, {
      id: 0,
      color: PALETTE.P1_PRIMARY,
      startX: arena.centerX - 100,
      startY: arena.centerY,
      keys: { up: 'W', down: 'S', left: 'A', right: 'D', heavy: 'SHIFT' }
    }, p1Weapon);
    
    // ============================================
    // 🟦 PLAYER 2 - AMPLIFIER / EXECUTION
    // Fantasy: Heavy gunner / tech specialist
    // Role: Capitalizes on openings, deletes targets
    // ============================================
    const p2Weapon: WeaponConfig = {
      id: 'precision_cannon',
      type: 'auto',
      damage: 6,            // Lower base (but 2.5x vs broken!)
      fireRate: 5,          // Fast fire rate
      projectileSpeed: 500, // Fast projectiles
      projectileSize: 4,    // Smaller projectiles
      pierce: 0,            // No pierce
      color: PALETTE.P2_PRIMARY
    };
    
    const player2 = new Player(this, {
      id: 1,
      color: PALETTE.P2_PRIMARY,
      startX: arena.centerX + 100,
      startY: arena.centerY,
      keys: { up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', heavy: 'SPACE' }
    }, p2Weapon);
    
    this.players.add(player1, true);
    this.players.add(player2, true);
  }

  private setupDestructibleCollisions(): void {
    // Projectiles hit destructibles
    this.physics.add.overlap(
      this.projectiles,
      this.destructibleManager.getGroup(),
      (proj: any, dest: any) => {
        if (!proj.active || !dest.active) return;
        
        const projectile = proj as Projectile;
        const destructible = dest as Destructible;
        
        const result = destructible.takeDamage(projectile.damage, projectile.ownerId);
        projectile.onHit();
        
        if (result.wasCombo) {
          this.stats.comboKills++;
          this.coopVFXSystem.showAssistPopup(destructible.x, destructible.y - 20, 'COMBO!', PALETTE.FX_CRIT);
        }
      }
    );
  }

  private createUI(): void {
    const cam = this.cameras.main;
    
    // Phase indicator
    this.phaseText = this.add.text(cam.width / 2, 20, '', {
      fontSize: '20px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
      fontFamily: 'Arial Black'
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(1000);
    
    // Timer
    this.timerText = this.add.text(cam.width / 2, 50, '0:00', {
      fontSize: '28px',
      color: '#ffff00',
      stroke: '#000000',
      strokeThickness: 4,
      fontFamily: 'Arial Black'
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(1000);
    
    // Hint container
    this.hintContainer = this.add.container(cam.width / 2, cam.height - 80).setScrollFactor(0).setDepth(1000);
    
    // Stats overlay (hidden initially)
    this.statsOverlay = this.add.container(cam.width / 2, cam.height / 2).setScrollFactor(0).setDepth(2000);
    this.statsOverlay.setVisible(false);
  }

  private setupEventListeners(): void {
    this.events.on('createProjectile', this.createProjectile, this);
    this.events.on('dropXP', this.dropXP, this);
    this.events.on('enemyKilled', this.onEnemyKilled, this);
    this.events.on('bossDefeated', this.onBossDefeated, this);
    this.events.on('comboDestruction', this.onComboDestruction, this);
    
    // Role synergy events
    this.events.on('synergyTriggered', this.onSynergyTriggered, this);
    this.events.on('enemyBroken', this.onEnemyBroken, this);
    
    // Co-op objective events
    this.events.on('objectiveComplete', this.onObjectiveComplete, this);
    this.events.on('objectiveFailed', this.onObjectiveFailed, this);
  }
  
  private onObjectiveComplete(data: any): void {
    this.stats.objectivesCompleted++;
    this.coopVFXSystem.showAssistPopup(
      this.cameras.main.width / 2, 
      this.cameras.main.height / 2, 
      '🎯 TEAMWORK!', 
      PALETTE.FX_SYNC
    );
  }
  
  private onObjectiveFailed(data: any): void {
    // Failed objective - increase pressure
    this.cameras.main.shake(300, 0.02);
  }
  
  private onSynergyTriggered(data: any): void {
    if (data.type === 'break_detonate') {
      // BIG synergy explosion when Amplifier hits Broken enemy
      this.stats.comboKills++;
      
      // Explosion VFX
      const ring = this.add.circle(data.x, data.y, 10, PALETTE.FX_SYNC, 0.8);
      ring.setStrokeStyle(4, PALETTE.FX_CRIT);
      
      this.tweens.add({
        targets: ring,
        radius: data.radius,
        alpha: 0,
        duration: 200,
        ease: 'Power2',
        onComplete: () => ring.destroy()
      });
      
      // Damage enemies in radius
      const enemies = this.enemies.getChildren() as Enemy[];
      for (const enemy of enemies) {
        if (!enemy.active || !enemy.health.isAlive) continue;
        const dist = Phaser.Math.Distance.Between(data.x, data.y, enemy.x, enemy.y);
        if (dist <= data.radius) {
          enemy.takeDamage(data.damage, { playerId: 1 }); // Credit to Amplifier
        }
      }
      
      // Slow-mo punch + shake
      this.time.timeScale = 0.3;
      this.time.delayedCall(80, () => { this.time.timeScale = 1; });
      this.cameras.main.shake(100, 0.012);
      
      // Popup
      this.coopVFXSystem.showAssistPopup(data.x, data.y - 30, '💥 DETONATE!', PALETTE.FX_CRIT);
      
    } else if (data.type === 'marked_shatter') {
      // Spread mark to nearby enemies when Breaker hits Marked
      const enemies = this.enemies.getChildren() as Enemy[];
      for (const enemy of enemies) {
        if (!enemy.active || !enemy.health.isAlive) continue;
        const dist = Phaser.Math.Distance.Between(data.x, data.y, enemy.x, enemy.y);
        if (dist <= data.spreadRadius && !enemy.isMarked()) {
          enemy.mark(2000);
        }
      }
      
      // Visual feedback
      this.coopVFXSystem.showAssistPopup(data.x, data.y - 30, '⚡ SPREAD!', PALETTE.P2_PRIMARY);
    }
  }
  
  private onEnemyBroken(data: any): void {
    // Visual cue that enemy is now vulnerable
    const indicator = this.add.text(data.x, data.y - 20, '⚠️', {
      fontSize: '16px'
    }).setOrigin(0.5);
    
    this.tweens.add({
      targets: indicator,
      y: data.y - 40,
      alpha: 0,
      duration: 500,
      onComplete: () => indicator.destroy()
    });
  }

  private setupCamera(): void {
    const players = this.players.getChildren() as Player[];
    if (players.length >= 2) {
      // Follow midpoint
      const midX = (players[0].x + players[1].x) / 2;
      const midY = (players[0].y + players[1].y) / 2;
      this.cameras.main.centerOn(midX, midY);
    }
  }

  private startPhase(index: number): void {
    if (index >= this.phases.length) return;
    
    this.currentPhase = index;
    const phase = this.phases[index];
    
    console.log(`DemoScene: Starting phase "${phase.name}" (${phase.startTime}s - ${phase.endTime}s)`);
    
    // Update UI
    this.phaseText.setText(phase.name.toUpperCase());
    this.tweens.add({
      targets: this.phaseText,
      alpha: { from: 0, to: 1 },
      scaleX: { from: 1.5, to: 1 },
      scaleY: { from: 1.5, to: 1 },
      duration: 500,
      ease: 'Back.out'
    });
    
    // Reset spawn tracking
    this.lastSpawnTime.clear();
    this.spawnedCount.clear();
    
    // Spawn destructibles
    if (phase.destructibles > 0) {
      const arena = demoConfig.arena;
      this.destructibleManager.spawnRandom(phase.destructibles, {
        x: 100,
        y: 100,
        width: arena.width - 200,
        height: arena.height - 200
      });
    }
    
    // Show hints
    this.showHints(phase.hints);
    
    // Start co-op objective if defined
    if ((phase as any).coopObjective) {
      const objConfig = (phase as any).coopObjective;
      const arena = demoConfig.arena;
      
      // Delay objective start based on config
      this.time.delayedCall(((objConfig.startTime || phase.startTime) - phase.startTime) * 1000, () => {
        this.coopObjective = new CoopObjective(this, objConfig.type, {
          duration: objConfig.duration || 15000
        });
        this.coopObjective.start(arena);
      });
    }
    
    // Spawn boss if needed
    if (phase.bossSpawn && phase.boss) {
      this.spawnMiniBoss(phase.boss);
    }
    
    // Show stats if final phase
    if (phase.showStats) {
      this.showStatsScreen();
    }
  }

  private showHints(hintIds: string[]): void {
    this.hintContainer.removeAll(true);
    
    let delay = 0;
    for (const hintId of hintIds) {
      const hint = (demoConfig.hints as any)[hintId];
      if (!hint) continue;
      
      this.time.delayedCall(delay + (hint.delay || 0), () => {
        const hintText = this.add.text(0, 0, `${hint.icon} ${hint.text}`, {
          fontSize: '24px',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 4,
          fontFamily: 'Arial Black'
        }).setOrigin(0.5);
        
        this.hintContainer.add(hintText);
        
        // Animate in
        hintText.setAlpha(0);
        hintText.setScale(0.5);
        this.tweens.add({
          targets: hintText,
          alpha: 1,
          scaleX: 1,
          scaleY: 1,
          duration: 300,
          ease: 'Back.out'
        });
        
        // Fade out
        this.time.delayedCall(hint.duration, () => {
          this.tweens.add({
            targets: hintText,
            alpha: 0,
            y: hintText.y - 20,
            duration: 300,
            onComplete: () => hintText.destroy()
          });
        });
      });
      
      delay += 2000;
    }
  }

  private spawnMiniBoss(bossConfig: any): void {
    const arena = demoConfig.arena;
    
    // Dramatic entrance
    this.cameras.main.shake(200, 0.01);
    
    // Warning
    const warning = this.add.text(arena.centerX, arena.centerY - 100, '⚠️ BOSS INCOMING ⚠️', {
      fontSize: '28px',
      color: '#ff0000',
      stroke: '#000000',
      strokeThickness: 5,
      fontFamily: 'Arial Black'
    }).setOrigin(0.5);
    
    this.tweens.add({
      targets: warning,
      alpha: { from: 0, to: 1 },
      scaleX: { from: 2, to: 1 },
      scaleY: { from: 2, to: 1 },
      duration: 500,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        warning.destroy();
        
        // Spawn boss
        this.miniBoss = new MiniBoss(this, {
          x: arena.centerX,
          y: 100,
          hp: bossConfig.hp,
          damage: bossConfig.damage,
          speed: bossConfig.speed,
          shieldPhases: bossConfig.shieldPhases
        });
      }
    });
  }

  private showStatsScreen(): void {
    // Freeze gameplay
    this.physics.pause();
    
    // Dim background
    const bg = this.add.rectangle(0, 0, 2000, 2000, 0x000000, 0.8);
    this.statsOverlay.add(bg);
    
    // Title
    const title = this.add.text(0, -150, '🎮 DEMO COMPLETE 🎮', {
      fontSize: '32px',
      color: '#ffff00',
      stroke: '#000000',
      strokeThickness: 5,
      fontFamily: 'Arial Black'
    }).setOrigin(0.5);
    this.statsOverlay.add(title);
    
    // Stats
    const statLines = [
      `💀 Kills: ${this.stats.totalKills}`,
      `🤝 Combo Kills: ${this.stats.comboKills}`,
      `⚡ Synergy Time: ${(this.stats.synergyTime / 1000).toFixed(1)}s`,
      `🛡️ Saves: ${this.stats.saves}`
    ];
    
    let y = -60;
    for (const line of statLines) {
      const text = this.add.text(0, y, line, {
        fontSize: '20px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
        fontFamily: 'Arial'
      }).setOrigin(0.5);
      this.statsOverlay.add(text);
      y += 40;
    }
    
    // Teaser
    const teaser = this.add.text(0, 120, '"More chaos coming..."', {
      fontSize: '18px',
      color: '#888888',
      fontStyle: 'italic',
      fontFamily: 'Arial'
    }).setOrigin(0.5);
    this.statsOverlay.add(teaser);
    
    // Restart prompt
    const restart = this.add.text(0, 180, 'Press SPACE to restart', {
      fontSize: '16px',
      color: '#ffff00',
      fontFamily: 'Arial'
    }).setOrigin(0.5);
    this.statsOverlay.add(restart);
    
    this.tweens.add({
      targets: restart,
      alpha: { from: 1, to: 0.3 },
      duration: 500,
      yoyo: true,
      repeat: -1
    });
    
    // Show overlay
    this.statsOverlay.setVisible(true);
    this.statsOverlay.setAlpha(0);
    this.tweens.add({
      targets: this.statsOverlay,
      alpha: 1,
      duration: 500
    });
    
    // Restart on space
    this.input.keyboard?.once('keydown-SPACE', () => {
      this.scene.restart();
    });
  }

  // Event handlers
  private createProjectile(data: any): void {
    const proj = this.projectiles.getFirstDead(false) as Projectile;
    if (proj) {
      proj.activate(data);
    }
  }

  private dropXP(x: number, y: number, value: number): void {
    const gem = this.xpGems.getFirstDead(false) as XPGem;
    if (gem) {
      gem.activate(x, y, value);
    }
  }

  private onEnemyKilled(data: any): void {
    this.stats.totalKills++;
    
    // First kill in onboarding - trigger snappy feedback
    if (this.currentPhase === 0 && this.stats.totalKills === 1) {
      this.cameras.main.shake(60, 0.005);
      this.coopVFXSystem.showAssistPopup(data.x, data.y - 20, 'NICE!', PALETTE.FX_CRIT);
    }
  }

  private onBossDefeated(data: any): void {
    this.stats.bossKillTime = this.elapsedTime;
    
    // Big celebration
    this.coopVFXSystem.showAssistPopup(data.x, data.y - 40, '🏆 VICTORY!', PALETTE.FX_SYNC);
    
    // Move to finale phase
    this.time.delayedCall(2000, () => {
      this.startPhase(this.phases.length - 1);
    });
  }

  private onComboDestruction(data: any): void {
    this.coopVFXSystem.createSyncExplosion(data.x, data.y, 100);
  }

  update(time: number, delta: number): void {
    this.elapsedTime += delta;
    const elapsedSeconds = this.elapsedTime / 1000;
    
    // Update timer display
    const mins = Math.floor(elapsedSeconds / 60);
    const secs = Math.floor(elapsedSeconds % 60);
    this.timerText.setText(`${mins}:${secs.toString().padStart(2, '0')}`);
    
    // Check phase transitions
    const currentPhaseData = this.phases[this.currentPhase];
    if (elapsedSeconds >= currentPhaseData.endTime && this.currentPhase < this.phases.length - 1) {
      // Don't auto-advance past miniboss phase if boss still alive
      if (currentPhaseData.bossSpawn && this.miniBoss?.active) {
        // Wait for boss death
      } else {
        this.startPhase(this.currentPhase + 1);
      }
    }
    
    // Spawn enemies for current phase
    this.updateEnemySpawning(elapsedSeconds, delta);
    
    // Update players
    const playerArray = this.players.getChildren() as Player[];
    for (const player of playerArray) {
      if (player.active) {
        player.update(time, delta);
        
        // Squash/stretch
        const body = player.body as Phaser.Physics.Arcade.Body;
        if (body) {
          this.animationSystem.applyMovementSquash(player, body.velocity.x, body.velocity.y);
        }
      }
    }
    
    // Update enemies
    const enemyArray = this.enemies.getChildren() as Enemy[];
    for (const enemy of enemyArray) {
      if (enemy.active) {
        enemy.update(time, delta, playerArray);
      }
    }
    
    // Update mini-boss
    if (this.miniBoss?.active) {
      this.miniBoss.update(time, delta, playerArray);
    }
    
    // Update projectiles
    for (const proj of this.projectiles.getChildren() as Projectile[]) {
      if (proj.active) proj.update(time);
    }
    
    // Update XP gems
    for (const gem of this.xpGems.getChildren() as XPGem[]) {
      if (gem.active) gem.update(time, delta, playerArray);
    }
    
    // Update systems
    this.vfxSystem.update(time, delta);
    this.coopVFXSystem.update(delta);
    this.synergyZone.update(time, delta);
    
    // Update co-op objective
    if (this.coopObjective?.isActive()) {
      this.coopObjective.update(delta, playerArray);
    }
    
    // Track synergy time
    if (this.synergyZone.isSynergyActive()) {
      this.stats.synergyTime += delta;
    }
    
    // Update camera
    this.updateCamera(playerArray);
  }

  private updateEnemySpawning(elapsedSeconds: number, delta: number): void {
    const phase = this.phases[this.currentPhase];
    if (!phase.enemies || phase.enemies.length === 0) return;
    
    const arena = demoConfig.arena;
    const spawnConfig = (demoConfig as any).spawnConfig || { maxEnemies: 60, aggroSplitChance: 0.5 };
    
    // Budget-based spawning: spawn X enemies per interval
    const spawnBudget = (phase as any).spawnBudget || 3;
    const spawnInterval = (phase as any).spawnInterval || 1000;
    
    // Check if it's time to spawn
    const lastGlobalSpawn = this.lastSpawnTime.get('_global') || 0;
    if (this.elapsedTime - lastGlobalSpawn < spawnInterval) return;
    
    // Count current active enemies
    const activeEnemies = (this.enemies.getChildren() as Enemy[]).filter(e => e.active).length;
    if (activeEnemies >= spawnConfig.maxEnemies) return;
    
    // Calculate total weight for weighted random selection
    const totalWeight = phase.enemies.reduce((sum: number, e: any) => sum + (e.weight || 1), 0);
    
    // Spawn budget enemies
    for (let i = 0; i < spawnBudget; i++) {
      const enemy = this.enemies.getFirstDead(false) as Enemy;
      if (!enemy) break;
      
      // Weighted random enemy type selection
      let roll = Math.random() * totalWeight;
      let selectedConfig: any = phase.enemies[0];
      for (const config of phase.enemies) {
        roll -= (config as any).weight || 1;
        if (roll <= 0) {
          selectedConfig = config;
          break;
        }
      }
      
      const enemyData = { ...(enemiesData as any)[selectedConfig.type] } as EnemyData;
      enemyData.hp *= selectedConfig.hpMultiplier || 1;
      
      // Random edge spawn - prefer screen edges to fill periphery
      const side = Math.floor(Math.random() * 4);
      let x: number, y: number;
      const buffer = 30;
      switch (side) {
        case 0: x = buffer + Math.random() * (arena.width - buffer * 2); y = buffer; break;
        case 1: x = arena.width - buffer; y = buffer + Math.random() * (arena.height - buffer * 2); break;
        case 2: x = buffer + Math.random() * (arena.width - buffer * 2); y = arena.height - buffer; break;
        default: x = buffer; y = buffer + Math.random() * (arena.height - buffer * 2); break;
      }
      
      enemy.activate(enemyData, x, y);
      
      // AGGRO SPLIT: Some enemies target specific players
      if (selectedConfig.aggroSplit && Math.random() < spawnConfig.aggroSplitChance) {
        enemy.aggroType = Math.random() < 0.5 ? 'fixed' : 'dps';
        enemy.aggroTarget = Math.random() < 0.5 ? 0 : 1; // Target P1 or P2 specifically
      }
    }
    
    this.lastSpawnTime.set('_global', this.elapsedTime);
  }

  private updateCamera(players: Player[]): void {
    if (players.length < 2) return;
    
    const midX = (players[0].x + players[1].x) / 2;
    const midY = (players[0].y + players[1].y) / 2;
    
    const cam = this.cameras.main;
    cam.scrollX += (midX - cam.width / 2 - cam.scrollX) * 0.1;
    cam.scrollY += (midY - cam.height / 2 - cam.scrollY) * 0.1;
  }
}
