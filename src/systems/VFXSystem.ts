import Phaser from 'phaser';

/**
 * VFXSystem - Manages all visual effects with proper layering and pooling
 * 
 * Design Philosophy:
 * "Holy sh*t, the screen is melting — but I still know what's killing me."
 * 
 * Clarity + aggression + juice. Not realism.
 */

// Layer order (never changes at runtime)
export enum RenderLayer {
  BG = 0,
  DECALS = 1,
  ENTITIES = 2,
  PROJECTILES = 3,
  VFX = 4,
  UI = 5
}

interface DamageNumberConfig {
  x: number;
  y: number;
  damage: number;
  isCrit: boolean;
  color?: number;
}

interface ExplosionConfig {
  x: number;
  y: number;
  radius: number;
  color?: number;
  duration?: number;
}

export class VFXSystem {
  private scene: Phaser.Scene;
  
  // Layer containers (fixed z-order)
  public layers: {
    bg: Phaser.GameObjects.Container;
    decals: Phaser.GameObjects.Container;
    entities: Phaser.GameObjects.Container;
    projectiles: Phaser.GameObjects.Container;
    vfx: Phaser.GameObjects.Container;
    ui: Phaser.GameObjects.Container;
  };
  
  // Pooled damage numbers
  private damageNumberPool: Phaser.GameObjects.Text[] = [];
  private activeDamageNumbers: number = 0;
  private readonly MAX_DAMAGE_NUMBERS = 30;
  
  // Pooled particle emitter (single, reusable)
  private particleEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private particlesPerSecond: number = 0;
  private readonly MAX_PARTICLES_PER_SECOND = 150;
  
  // Performance tracking
  private isCanvasMode: boolean = false;
  private fancyVFXEnabled: boolean = true;
  private lastFPSCheck: number = 0;
  
  // Screen juice state
  private timeScalePunching: boolean = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.isCanvasMode = scene.game.renderer.type === Phaser.CANVAS;
    
    // Create layer containers in fixed order
    this.layers = {
      bg: scene.add.container(0, 0),
      decals: scene.add.container(0, 0),
      entities: scene.add.container(0, 0),
      projectiles: scene.add.container(0, 0),
      vfx: scene.add.container(0, 0),
      ui: scene.add.container(0, 0)
    };
    
    // Set depths (never change at runtime!)
    this.layers.bg.setDepth(RenderLayer.BG);
    this.layers.decals.setDepth(RenderLayer.DECALS);
    this.layers.entities.setDepth(RenderLayer.ENTITIES);
    this.layers.projectiles.setDepth(RenderLayer.PROJECTILES);
    this.layers.vfx.setDepth(RenderLayer.VFX);
    this.layers.ui.setDepth(RenderLayer.UI);
    
    // Initialize pools
    this.initDamageNumberPool();
    this.initParticleEmitter();
    
    // Canvas fallback warning
    if (this.isCanvasMode) {
      console.log('VFX: Canvas mode detected - fancy effects disabled');
      this.fancyVFXEnabled = false;
    }
    
    // Setup event listeners
    this.setupEventListeners();
  }

  private initDamageNumberPool(): void {
    for (let i = 0; i < this.MAX_DAMAGE_NUMBERS; i++) {
      const text = this.scene.add.text(0, 0, '', {
        fontSize: '14px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
        fontFamily: 'monospace'
      });
      text.setOrigin(0.5);
      text.setVisible(false);
      this.damageNumberPool.push(text);
      this.layers.vfx.add(text);
    }
  }

  private initParticleEmitter(): void {
    // Create particle texture if not exists
    if (!this.scene.textures.exists('vfx_particle')) {
      const graphics = this.scene.add.graphics();
      graphics.fillStyle(0xffffff);
      graphics.fillCircle(4, 4, 4);
      graphics.generateTexture('vfx_particle', 8, 8);
      graphics.destroy();
    }
    
    // Single pooled emitter for all particle effects
    this.particleEmitter = this.scene.add.particles(0, 0, 'vfx_particle', {
      speed: { min: 50, max: 150 },
      scale: { start: 1, end: 0 },
      lifespan: 400,
      quantity: 0, // Controlled manually
      emitting: false
    });
    
    this.layers.vfx.add(this.particleEmitter);
  }

  private setupEventListeners(): void {
    // Hit feedback events
    this.scene.events.on('enemyHit', this.onEnemyHit, this);
    this.scene.events.on('playerHit', this.onPlayerHit, this);
    this.scene.events.on('enemyDeath', this.onEnemyDeath, this);
    this.scene.events.on('eliteDeath', this.onEliteDeath, this);
    this.scene.events.on('levelUp', this.onLevelUp, this);
  }

  // === LAYER MANAGEMENT ===
  
  addToLayer(gameObject: Phaser.GameObjects.GameObject, layer: RenderLayer): void {
    switch (layer) {
      case RenderLayer.BG:
        this.layers.bg.add(gameObject);
        break;
      case RenderLayer.DECALS:
        this.layers.decals.add(gameObject);
        break;
      case RenderLayer.ENTITIES:
        this.layers.entities.add(gameObject);
        break;
      case RenderLayer.PROJECTILES:
        this.layers.projectiles.add(gameObject);
        break;
      case RenderLayer.VFX:
        this.layers.vfx.add(gameObject);
        break;
      case RenderLayer.UI:
        this.layers.ui.add(gameObject);
        break;
    }
  }

  // === HIT FEEDBACK (CRITICAL) ===
  
  /**
   * Flash sprite white on hit (50ms)
   */
  flashHit(sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image): void {
    if (!sprite || !sprite.active) return;
    
    const originalTint = sprite.tintTopLeft;
    sprite.setTintFill(0xffffff);
    
    this.scene.time.delayedCall(50, () => {
      if (sprite && sprite.active) {
        sprite.clearTint();
        // Restore original tint if it had one
        if (originalTint !== 0xffffff) {
          sprite.setTint(originalTint);
        }
      }
    });
  }

  /**
   * Show damage number with pooling
   */
  showDamageNumber(config: DamageNumberConfig): void {
    if (this.activeDamageNumbers >= this.MAX_DAMAGE_NUMBERS) return;
    
    const text = this.damageNumberPool.find(t => !t.visible);
    if (!text || !text.scene) return; // Safety check - text must have valid scene
    
    this.activeDamageNumbers++;
    
    // Configure text
    text.setPosition(config.x + Phaser.Math.Between(-10, 10), config.y);
    text.setText(Math.round(config.damage).toString());
    text.setFontSize(config.isCrit ? '20px' : '14px');
    text.setStyle({
      color: config.isCrit ? '#ffff00' : 
             config.color ? `#${config.color.toString(16).padStart(6, '0')}` : '#ffffff',
      fontStyle: config.isCrit ? 'bold' : 'normal'
    });
    text.setAlpha(1);
    text.setVisible(true);
    
    // Animate up + fade
    this.scene.tweens.add({
      targets: text,
      y: text.y - 40,
      alpha: 0,
      duration: 800,
      ease: 'Power2',
      onComplete: () => {
        text.setVisible(false);
        this.activeDamageNumbers--;
      }
    });
  }

  // === PARTICLES (POOLED) ===

  /**
   * Emit particles at position (uses single pooled emitter)
   */
  emitParticles(x: number, y: number, count: number, color: number = 0xffffff): void {
    if (!this.particleEmitter) return;
    if (this.particlesPerSecond >= this.MAX_PARTICLES_PER_SECOND) return;
    
    // Clamp count
    const actualCount = Math.min(count, this.MAX_PARTICLES_PER_SECOND - this.particlesPerSecond);
    if (actualCount <= 0) return;
    
    this.particleEmitter.setPosition(x, y);
    this.particleEmitter.setParticleTint(color);
    this.particleEmitter.explode(actualCount);
    
    this.particlesPerSecond += actualCount;
  }

  /**
   * Create explosion effect (visual only)
   */
  createExplosion(config: ExplosionConfig): void {
    const { x, y, radius, color = 0xff8800, duration = 300 } = config;
    
    // Circle expansion
    const circle = this.scene.add.circle(x, y, 10, color, 0.6);
    this.layers.vfx.add(circle);
    
    this.scene.tweens.add({
      targets: circle,
      radius: radius,
      alpha: 0,
      duration: duration,
      ease: 'Power2',
      onComplete: () => circle.destroy()
    });
    
    // Particles
    this.emitParticles(x, y, 12, color);
    
    // Small screen shake
    this.cameraShake(60, 0.003);
  }

  // === CAMERA & SCREEN JUICE ===

  /**
   * Enable/disable fancy VFX (for performance profile changes)
   */
  setFancyVFX(enabled: boolean): void {
    this.fancyVFXEnabled = enabled;
    console.log(`[VFX] Fancy effects ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Camera shake (small, frequent > big, rare)
   */
  cameraShake(duration: number = 80, intensity: number = 0.004): void {
    if (!this.fancyVFXEnabled) return;
    this.scene.cameras.main.shake(duration, intensity);
  }

  /**
   * Time scale punch for impact moments
   */
  timeScalePunch(scale: number = 0.95, duration: number = 60): void {
    if (!this.fancyVFXEnabled || this.timeScalePunching) return;
    
    this.timeScalePunching = true;
    this.scene.time.timeScale = scale;
    
    this.scene.time.delayedCall(duration, () => {
      this.scene.time.timeScale = 1;
      this.timeScalePunching = false;
    });
  }

  /**
   * Screen flash
   * Overload 1: (duration, r, g, b) - legacy RGBA
   * Overload 2: (hexColor, alpha, duration) - new hex color style
   */
  screenFlash(arg1: number = 100, arg2: number = 255, arg3: number = 255, arg4?: number): void {
    // Check if using legacy signature (duration, r, g, b)
    if (arg4 !== undefined) {
      // Legacy: screenFlash(duration, r, g, b)
      this.scene.cameras.main.flash(arg1, arg2, arg3, arg4);
    } else if (arg1 > 255) {
      // New signature: screenFlash(hexColor, alpha, duration)
      const color = arg1;
      const duration = arg3;
      const r = (color >> 16) & 0xff;
      const g = (color >> 8) & 0xff;
      const b = color & 0xff;
      this.scene.cameras.main.flash(duration, r, g, b);
    } else {
      // Legacy fallback: screenFlash(duration, r, g)
      this.scene.cameras.main.flash(arg1, arg2, arg3, 255);
    }
  }

  // === EVENT HANDLERS ===

  private onEnemyHit(data: { sprite: Phaser.GameObjects.Sprite, damage: number, isCrit: boolean }): void {
    // Safety check - sprite must exist and be valid
    if (!data.sprite || !data.sprite.active) return;
    
    this.flashHit(data.sprite);
    this.showDamageNumber({
      x: data.sprite.x,
      y: data.sprite.y - 20,
      damage: data.damage,
      isCrit: data.isCrit
    });
  }

  private onPlayerHit(data: { sprite: Phaser.GameObjects.Sprite, damage: number }): void {
    this.flashHit(data.sprite);
    this.screenFlash(50, 255, 100, 100);
  }

  private onEnemyDeath(data: { x: number, y: number, color: number }): void {
    this.emitParticles(data.x, data.y, 8, data.color);
  }

  private onEliteDeath(data: { x: number, y: number, color: number }): void {
    // Big explosion for elites
    this.createExplosion({
      x: data.x,
      y: data.y,
      radius: 60,
      color: data.color
    });
    
    // Time punch for impact
    this.timeScalePunch(0.92, 80);
  }

  private onLevelUp(): void {
    // Level up flash and particles
    this.screenFlash(200, 0, 255, 100);
    this.timeScalePunch(0.9, 100);
  }

  // === SHADER HELPERS (WebGL only) ===

  /**
   * Apply glow effect to sprite (WebGL only, sparingly)
   */
  applyGlow(sprite: Phaser.GameObjects.Sprite): void {
    if (this.isCanvasMode || !this.fancyVFXEnabled) return;
    
    // Glow is done via additive overlay sprite
    const glow = this.scene.add.sprite(sprite.x, sprite.y, sprite.texture.key);
    glow.setAlpha(0.3);
    glow.setBlendMode(Phaser.BlendModes.ADD);
    glow.setScale(sprite.scaleX * 1.2, sprite.scaleY * 1.2);
    this.layers.vfx.add(glow);
    
    // Pulse animation
    this.scene.tweens.add({
      targets: glow,
      alpha: 0.1,
      scaleX: sprite.scaleX * 1.4,
      scaleY: sprite.scaleY * 1.4,
      duration: 500,
      yoyo: true,
      repeat: -1
    });
    
    // Store reference for cleanup
    (sprite as any)._glowSprite = glow;
  }

  /**
   * Remove glow effect
   */
  removeGlow(sprite: Phaser.GameObjects.Sprite): void {
    const glow = (sprite as any)._glowSprite;
    if (glow) {
      glow.destroy();
      delete (sprite as any)._glowSprite;
    }
  }

  // === PERFORMANCE GUARDRAILS ===

  update(time: number, delta: number): void {
    // Reset particles per second counter
    this.particlesPerSecond = 0;
    
    // FPS check every second
    if (time - this.lastFPSCheck > 1000) {
      this.lastFPSCheck = time;
      const fps = this.scene.game.loop.actualFps;
      
      // Disable fancy VFX if FPS drops below 50
      if (fps < 50 && this.fancyVFXEnabled && !this.isCanvasMode) {
        console.log('VFX: FPS dropped below 50, disabling fancy effects');
        this.fancyVFXEnabled = false;
      } else if (fps > 55 && !this.fancyVFXEnabled && !this.isCanvasMode) {
        console.log('VFX: FPS recovered, re-enabling fancy effects');
        this.fancyVFXEnabled = true;
      }
    }
  }

  /**
   * Check if we're in reduced effects mode
   */
  isFancyMode(): boolean {
    return this.fancyVFXEnabled && !this.isCanvasMode;
  }

  destroy(): void {
    this.scene.events.off('enemyHit', this.onEnemyHit, this);
    this.scene.events.off('playerHit', this.onPlayerHit, this);
    this.scene.events.off('enemyDeath', this.onEnemyDeath, this);
    this.scene.events.off('eliteDeath', this.onEliteDeath, this);
    this.scene.events.off('levelUp', this.onLevelUp, this);
    
    // Cleanup pools
    this.damageNumberPool.forEach(t => t.destroy());
    this.particleEmitter?.destroy();
  }
}
