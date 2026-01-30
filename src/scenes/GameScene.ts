import Phaser from 'phaser';
import { Player } from '@/entities/Player';
import { Enemy } from '@/entities/Enemy';
import { Projectile } from '@/entities/Projectile';
import { XPGem } from '@/entities/XPGem';
import { Weapon } from '@/components/Weapon';
import { CombatSystem } from '@/systems/CombatSystem';
import { SpawnSystem } from '@/systems/SpawnSystem';
import { UpgradeSystem } from '@/systems/UpgradeSystem';
import { ReviveSystem } from '@/systems/ReviveSystem';
import { DebugOverlay } from '@/systems/DebugOverlay';
import { VFXSystem, RenderLayer } from '@/systems/VFXSystem';
import { registerShaderPipelines } from '@/systems/ShaderPipelines';
import { AnimationSystem, createPlayerSprite, createEnemySprite, PALETTE } from '@/systems/AnimationSystem';
import { CoopVFXSystem } from '@/systems/CoopVFXSystem';
import { initPerformanceManager, getPerformanceManager } from '@/systems/PerformanceConfig';
import { GameNetworkSync } from '@/systems/GameNetworkSync';
import { NetworkManager } from '@/systems/NetworkManager';
import { WeaponConfig } from '@/types/GameTypes';

export class GameScene extends Phaser.Scene {
  // Entity pools
  public players!: Phaser.GameObjects.Group;
  public enemies!: Phaser.GameObjects.Group;
  private projectiles!: Phaser.GameObjects.Group;
  private xpGems!: Phaser.GameObjects.Group;

  // Systems
  private combatSystem!: CombatSystem;
  public spawnSystem!: SpawnSystem;
  public upgradeSystem!: UpgradeSystem;
  private reviveSystem!: ReviveSystem;
  private debugOverlay!: DebugOverlay;
  public vfxSystem!: VFXSystem;
  public animationSystem!: AnimationSystem;
  public coopVFXSystem!: CoopVFXSystem;
  private networkSync!: GameNetworkSync;
  
  // Network state
  private isHost: boolean = true;
  private localPlayerIndex: number = 0;

  // UI
  private hud!: {
    p1HP: Phaser.GameObjects.Text;
    p2HP: Phaser.GameObjects.Text;
    p1Ammo: Phaser.GameObjects.Text;
    p2Ammo: Phaser.GameObjects.Text;
    timer: Phaser.GameObjects.Text;
    level: Phaser.GameObjects.Text;
    xpBar: Phaser.GameObjects.Graphics;
    notification: Phaser.GameObjects.Text;
  };

  // Game state
  private isPaused: boolean = false;

  constructor() {
    super('GameScene');
  }

  preload(): void {
    // Create a simple particle texture
    const graphics = this.add.graphics();
    graphics.fillStyle(0xffffff);
    graphics.fillCircle(4, 4, 4);
    graphics.generateTexture('particle', 8, 8);
    graphics.destroy();
  }

  create(): void {
    console.log('GameScene created');

    // Initialize performance manager (auto-detects device capabilities)
    initPerformanceManager();
    const perfManager = getPerformanceManager();
    console.log(`[Performance] Starting with profile: ${perfManager.getProfile().name}`);

    // Register custom shader pipelines (WebGL only, respects performance profile)
    if (perfManager.getProfile().enableShaders) {
      registerShaderPipelines(this.game);
    }

    // Set world bounds (large wraparound arena)
    const worldSize = 2000;
    this.physics.world.setBounds(0, 0, worldSize, worldSize);

    // Setup camera
    this.cameras.main.setBounds(0, 0, worldSize, worldSize);
    this.cameras.main.setZoom(1);

    // Initialize VFX system FIRST (creates layer containers)
    this.vfxSystem = new VFXSystem(this);
    
    // Initialize animation system
    this.animationSystem = new AnimationSystem(this);
    
    // Initialize co-op VFX system
    this.coopVFXSystem = new CoopVFXSystem(this);

    // Create entity pools
    this.createPools();

    // Create players
    this.createPlayers();
    
    // Initialize network sync (AFTER players are created)
    this.networkSync = new GameNetworkSync(this);
    this.isHost = this.networkSync.isHostPlayer();
    this.localPlayerIndex = this.networkSync.getLocalPlayerIndex();
    console.log(`[GameScene] Running as ${this.isHost ? 'HOST' : 'GUEST'}, controlling player ${this.localPlayerIndex}`);
    
    // GUEST OPTIMIZATION: Disable physics entirely - guest just renders positions from host
    if (!this.isHost) {
      this.physics.world.pause();
      console.log('[GameScene] Physics disabled on guest for performance');
    }
    
    // Set up network control flags
    // Host runs the game, Guest just sends input and renders state
    const playerArray = this.players.getChildren() as Player[];
    if (this.isHost) {
      // Host controls P1 locally, P2 is controlled via network input from guest
      if (playerArray[1]) playerArray[1].isNetworkControlled = true;
    } else {
      // Guest: BOTH players are network controlled (positions come from host)
      // Guest reads WASD keyboard and sends to host for P2 movement
      if (playerArray[0]) playerArray[0].isNetworkControlled = true;
      if (playerArray[1]) playerArray[1].isNetworkControlled = true;
    }

    // Initialize systems
    this.combatSystem = new CombatSystem(this);
    this.spawnSystem = new SpawnSystem(this, this.enemies);
    this.upgradeSystem = new UpgradeSystem(this);
    this.reviveSystem = new ReviveSystem(this);
    this.debugOverlay = new DebugOverlay(this);
    this.debugOverlay.setPlayers(this.players.getChildren() as Player[]);
    
    // Register performance profile change callbacks
    perfManager.onProfileChange('gameScene', (profile) => {
      console.log(`[Performance] Profile changed to: ${profile.name}`);
      this.vfxSystem.setFancyVFX(profile.enableShaders);
    });

    // Setup collisions - ONLY on host (guest receives state, doesn't run combat)
    if (this.isHost) {
      this.combatSystem.setupCollisions(
        this.players,
        this.enemies,
        this.projectiles,
        this.xpGems
      );
    }

    // Setup camera to follow average position of both players
    this.setupCamera();

    // Create HUD
    this.createHUD();

    // Event listeners
    this.setupEventListeners();

    // Start spawning
    console.log('Game started!');
  }

  private createPools(): void {
    const perfManager = getPerformanceManager();
    const profile = perfManager.getProfile();
    
    // Check if we're host (registry is set before create)
    const isHost = this.registry.get('isHost') ?? true;
    
    // Players pool - NO auto-update, we call update manually
    this.players = this.add.group({
      runChildUpdate: false
    });

    // Enemies pool - only host needs auto-update
    this.enemies = this.add.group({
      classType: Enemy,
      maxSize: isHost ? profile.maxEnemies : 50, // Guest only needs to display synced enemies (max 30)
      runChildUpdate: false  // We manually call update on host only
    });

    // Only create large enemy pool on host
    const enemyPoolSize = isHost ? Math.min(500, profile.maxEnemies) : 50;
    for (let i = 0; i < enemyPoolSize; i++) {
      const enemy = new Enemy(this);
      this.enemies.add(enemy, true);
    }

    // Projectiles pool - only host needs these
    this.projectiles = this.add.group({
      classType: Projectile,
      maxSize: isHost ? profile.maxProjectiles : 10, // Guest needs minimal pool
      runChildUpdate: false  // We manually call update on host only
    });

    if (isHost) {
      const projectilePoolSize = Math.min(1000, profile.maxProjectiles);
      for (let i = 0; i < projectilePoolSize; i++) {
        const projectile = new Projectile(this);
        this.projectiles.add(projectile, true);
      }
    }

    // XP gems pool - only host needs these
    this.xpGems = this.add.group({
      classType: XPGem,
      maxSize: isHost ? 500 : 10,  // Guest needs minimal pool
      runChildUpdate: false  // We manually call update on host only
    });

    // Only create XP gems on host
    if (isHost) {
      for (let i = 0; i < 500; i++) {
        const gem = new XPGem(this);
        this.xpGems.add(gem, true);
      }
    }
  }

  private createPlayers(): void {
    // Player 1 - Rapid Fire (lowered base fire rate)
    const p1Weapon: WeaponConfig = {
      id: 'rapid_gun',
      type: 'auto',
      damage: 10,
      fireRate: 1, // Lowered from 5 to 1 shot/sec
      projectileSpeed: 400,
      projectileSize: 4,
      pierce: 0,
      color: 0xff0000
    };

    const player1 = new Player(this, {
      id: 0,
      color: 0xff0000,
      startX: 900,
      startY: 1000,
      keys: {
        up: 'W',
        down: 'S',
        left: 'A',
        right: 'D',
        heavy: 'SHIFT'
      }
    }, p1Weapon);

    // Player 2 - Shotgun (lowered base fire rate and pellets)
    const p2Weapon: WeaponConfig = {
      id: 'shotgun',
      type: 'auto',
      damage: 8,
      fireRate: 0.5, // Lowered from 2 to 0.5 shot/sec
      projectileSpeed: 350,
      projectileSize: 3,
      pierce: 0,
      spread: 30,
      pellets: 3, // Lowered from 5 to 3
      color: 0x0000ff
    };

    const player2 = new Player(this, {
      id: 1,
      color: 0x0000ff,
      startX: 1100,
      startY: 1000,
      keys: {
        up: 'UP',
        down: 'DOWN',
        left: 'LEFT',
        right: 'RIGHT',
        heavy: 'SPACE'
      }
    }, p2Weapon);

    // Add heavy weapon (rocket launcher) to both
    const heavyWeapon: WeaponConfig = {
      id: 'rocket',
      type: 'heavy',
      damage: 100,
      fireRate: 1,
      projectileSpeed: 500,
      projectileSize: 8,
      pierce: 0,
      color: 0xffff00
    };

    player1.heavyWeapon = new Weapon(this, player1, heavyWeapon);
    player2.heavyWeapon = new Weapon(this, player2, heavyWeapon);

    this.players.add(player1, true);
    this.players.add(player2, true);
  }

  private setupCamera(): void {
    // Camera follows the midpoint between players
    this.cameras.main.startFollow(
      this.players.getChildren()[0],
      true,
      0.1,
      0.1
    );
  }

  private createHUD(): void {
    const cam = this.cameras.main;
    
    this.hud = {
      p1HP: this.add.text(16, 16, 'P1 HP: 100/100', {
        fontSize: '16px',
        color: '#ff0000',
        stroke: '#000000',
        strokeThickness: 3
      }).setScrollFactor(0),

      p2HP: this.add.text(cam.width - 16, 16, 'P2 HP: 100/100', {
        fontSize: '16px',
        color: '#0000ff',
        stroke: '#000000',
        strokeThickness: 3
      }).setScrollFactor(0).setOrigin(1, 0),

      p1Ammo: this.add.text(16, 40, 'Ammo: 5', {
        fontSize: '14px',
        color: '#ffff00',
        stroke: '#000000',
        strokeThickness: 2
      }).setScrollFactor(0),

      p2Ammo: this.add.text(cam.width - 16, 40, 'Ammo: 5', {
        fontSize: '14px',
        color: '#ffff00',
        stroke: '#000000',
        strokeThickness: 2
      }).setScrollFactor(0).setOrigin(1, 0),

      timer: this.add.text(cam.width / 2, 16, '0:00', {
        fontSize: '24px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4
      }).setScrollFactor(0).setOrigin(0.5, 0),

      level: this.add.text(cam.width / 2, 50, 'Level 1', {
        fontSize: '18px',
        color: '#00ff00',
        stroke: '#000000',
        strokeThickness: 3
      }).setScrollFactor(0).setOrigin(0.5, 0),

      xpBar: this.add.graphics().setScrollFactor(0),

      notification: this.add.text(cam.width / 2, cam.height / 2, '', {
        fontSize: '32px',
        color: '#ffff00',
        stroke: '#000000',
        strokeThickness: 5,
        align: 'center'
      }).setScrollFactor(0).setOrigin(0.5).setAlpha(0)
    };

    this.updateXPBar();
  }

  private setupEventListeners(): void {
    this.events.on('createProjectile', this.createProjectile, this);
    this.events.on('dropXP', this.dropXP, this);
    this.events.on('addXP', (amount: number) => this.upgradeSystem.addXP(amount), this);
    this.events.on('enemyKilled', (data: any) => this.spawnSystem.onEnemyKilled(data), this);
    this.events.on('xpChanged', this.onXPChanged, this);
    this.events.on('levelUp', this.onLevelUp, this);
    this.events.on('showNotification', this.showNotification, this);
    this.events.on('synergyActivated', this.onSynergyActivated, this);
    
    // Co-op VFX events
    this.events.on('syncKill', this.onSyncKill, this);
    this.events.on('playerSaved', this.onPlayerSaved, this);
    this.events.on('playerRevived', this.onPlayerRevived, this);
    this.events.on('sharedBuff', this.onSharedBuff, this);

    // Pause game with ESC key
    this.input.keyboard?.on('keydown-ESC', () => {
      // Sync pause to partner
      const network = NetworkManager.getInstance();
      if (network && network.isOnline()) {
        network.sendPause();
      }
      this.scene.pause('GameScene');
      this.scene.launch('OptionsScene');
    });
    
    // Listen for partner's pause
    const network = NetworkManager.getInstance();
    if (network && network.isOnline()) {
      network.on('game_paused', () => {
        if (!this.scene.isPaused('GameScene')) {
          this.scene.pause('GameScene');
          this.scene.launch('OptionsScene');
        }
      });
      network.on('game_resumed', () => {
        if (this.scene.isPaused('GameScene')) {
          this.scene.resume('GameScene');
          this.scene.stop('OptionsScene');
        }
      });
    }
  }
  
  // Co-op VFX handlers
  private onSyncKill(data: { x: number; y: number }): void {
    this.coopVFXSystem.createSyncExplosion(data.x, data.y);
    this.coopVFXSystem.showSyncPopup(data.x, data.y - 30);
  }
  
  private onPlayerSaved(data: { x: number; y: number; saverId: number }): void {
    this.coopVFXSystem.showSavePopup(data.x, data.y - 30);
  }
  
  private onPlayerRevived(data: { x: number; y: number }): void {
    this.coopVFXSystem.showRevivePopup(data.x, data.y - 30);
    this.vfxSystem.screenFlash(PALETTE.FX_HEAL, 0.3, 200);
  }
  
  private onSharedBuff(data: { player1: Player; player2: Player; duration: number }): void {
    this.coopVFXSystem.createSharedBuffRing(data.player1, data.player2, data.duration);
  }

  private createProjectile(data: any): void {
    const projectile = this.projectiles.getFirstDead(false) as Projectile;
    if (projectile) {
      projectile.activate(data);
    }
  }

  private dropXP(x: number, y: number, value: number): void {
    const gem = this.xpGems.getFirstDead(false) as XPGem;
    if (gem) {
      gem.activate(x, y, value);
    }
  }

  private onXPChanged(totalXP: number, progress: number): void {
    this.updateXPBar();
  }

  private onLevelUp(data: { level: number }): void {
    this.hud.level.setText(`Level ${data.level}`);
    this.showNotification(`LEVEL UP! Level ${data.level}`);
  }

  private showNotification(text: string): void {
    this.hud.notification.setText(text);
    this.hud.notification.setAlpha(1);

    this.tweens.add({
      targets: this.hud.notification,
      alpha: 0,
      duration: 2000,
      delay: 1000
    });
  }

  private onSynergyActivated(data: any): void {
    this.showNotification('SYNERGY ACTIVATED!');
    this.cameras.main.flash(200, 255, 255, 0);
  }

  private updateXPBar(): void {
    const cam = this.cameras.main;
    const barWidth = 300;
    const barHeight = 10;
    const x = (cam.width - barWidth) / 2;
    const y = 80;

    this.hud.xpBar.clear();

    // Background
    this.hud.xpBar.fillStyle(0x000000, 0.5);
    this.hud.xpBar.fillRect(x, y, barWidth, barHeight);

    // Progress
    const progress = this.upgradeSystem.getXPProgress();
    this.hud.xpBar.fillStyle(0x00ff00);
    this.hud.xpBar.fillRect(x, y, barWidth * progress, barHeight);

    // Border
    this.hud.xpBar.lineStyle(2, 0xffffff);
    this.hud.xpBar.strokeRect(x, y, barWidth, barHeight);
  }

  update(time: number, delta: number): void {
    if (this.isPaused) return;

    // Update performance manager with FPS
    const fps = this.game.loop.actualFps;
    getPerformanceManager().update(fps, time);

    const playerArray = this.players.getChildren() as Player[];
    const enemyArray = this.enemies.getChildren() as Enemy[];

    // === NETWORK SYNC LOGIC ===
    if (this.isHost) {
      // HOST: Run game normally, then broadcast state to guest
      
      // Update players
      for (const player of playerArray) {
        if (player.active) {
          // For player 2, apply guest's input if available
          if (player.playerId === 1) {
            const partnerInput = this.networkSync.getPartnerInput();
            if (partnerInput) {
              this.applyRemoteInput(player, partnerInput);
            }
          }
          player.update(time, delta);
          
          const body = player.body as Phaser.Physics.Arcade.Body;
          if (body) {
            this.animationSystem.applyMovementSquash(player, body.velocity.x, body.velocity.y);
          }
        }
      }

      // Update enemies
      for (const enemy of enemyArray) {
        if (enemy.active) {
          enemy.update(time, delta, playerArray);
        }
      }

      // Update projectiles
      const projectileArray = this.projectiles.getChildren() as Projectile[];
      for (const projectile of projectileArray) {
        if (projectile.active) {
          projectile.update(time);
        }
      }

      // Update XP gems
      const gemArray = this.xpGems.getChildren() as XPGem[];
      for (const gem of gemArray) {
        if (gem.active) {
          gem.update(time, delta, playerArray);
        }
      }

      // Update systems (only host runs game logic)
      this.spawnSystem.update(time, delta);
      this.reviveSystem.update(time);
      
      // Send state to guest
      this.networkSync.sendState(
        playerArray,
        enemyArray,
        this.spawnSystem.getCurrentWave(),
        0, // Score tracking not implemented yet
        this.spawnSystem.getElapsedTime()
      );
      
    } else {
      // GUEST: Minimal update - just send input and apply state
      
      // Guest reads WASD keys directly and sends to host for P2 control
      if (playerArray[0]) {
        this.networkSync.sendInput(playerArray[0]);
      }
      
      // Apply state received from host
      const state = this.networkSync.getPendingState();
      if (state) {
        this.networkSync.applyState(state, playerArray, this.enemies, this.spawnSystem);
      }
      
      // Skip animations on guest - too expensive
    }

    // Update systems (skip expensive ones on guest)
    if (this.isHost) {
      this.debugOverlay.update();
      this.vfxSystem.update(time, delta);
      this.coopVFXSystem.update(delta);
    }

    // Update HUD (throttled on guest)
    if (this.isHost || time % 3 === 0) {
      this.updateHUD();
    }

    // Update camera to follow midpoint
    this.updateCameraTarget(playerArray);
  }
  
  // Apply input received from remote player
  private applyRemoteInput(player: Player, input: { up: boolean; down: boolean; left: boolean; right: boolean; firing: boolean }): void {
    const speed = player.stats.moveSpeed;
    const body = player.body as Phaser.Physics.Arcade.Body;
    if (!body) return;
    
    let vx = 0;
    let vy = 0;
    
    if (input.left) vx -= speed;
    if (input.right) vx += speed;
    if (input.up) vy -= speed;
    if (input.down) vy += speed;
    
    // Normalize diagonal movement
    if (vx !== 0 && vy !== 0) {
      const factor = Math.SQRT1_2;
      vx *= factor;
      vy *= factor;
    }
    
    body.setVelocity(vx, vy);
    
    // Handle firing state
    player.setFiringState(input.firing);
  }

  private updateHUD(): void {
    const players = this.players.getChildren() as Player[];
    
    if (players[0]) {
      this.hud.p1HP.setText(`P1 HP: ${Math.ceil(players[0].health.current)}/${players[0].health.max}`);
      this.hud.p1Ammo.setText(`Ammo: ${players[0].stats.ammo}`);
    }
    
    if (players[1]) {
      this.hud.p2HP.setText(`P2 HP: ${Math.ceil(players[1].health.current)}/${players[1].health.max}`);
      this.hud.p2Ammo.setText(`Ammo: ${players[1].stats.ammo}`);
    }

    // Timer
    const elapsed = this.spawnSystem.getElapsedTime();
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    this.hud.timer.setText(`${minutes}:${seconds.toString().padStart(2, '0')}`);
  }

  private updateCameraTarget(players: Player[]): void {
    if (players.length !== 2) return;

    const midX = (players[0].x + players[1].x) / 2;
    const midY = (players[0].y + players[1].y) / 2;

    // Smoothly move camera toward midpoint
    const cam = this.cameras.main;
    cam.scrollX += (midX - cam.width / 2 - cam.scrollX) * 0.1;
    cam.scrollY += (midY - cam.height / 2 - cam.scrollY) * 0.1;
  }
}
