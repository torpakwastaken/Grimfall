import Phaser from 'phaser';
import { PALETTE } from '@/systems/AnimationSystem';

/**
 * Destructible - Barrels, crystals, etc that can be destroyed
 * 
 * When destroyed together (both players hit within 0.5s):
 * - Big VFX explosion
 * - Slow-mo punch
 * - Bonus XP/buff
 * 
 * "We're stronger together."
 */

export interface DestructibleConfig {
  x: number;
  y: number;
  type: 'barrel' | 'crystal';
  hp: number;
  xpValue: number;
}

export class Destructible extends Phaser.Physics.Arcade.Sprite {
  public hp: number;
  public maxHp: number;
  public xpValue: number;
  public destructibleType: string;
  
  private hpBar: Phaser.GameObjects.Graphics;
  private hitByPlayers: Set<number> = new Set();
  private lastHitTime: number = 0;
  private readonly COMBO_WINDOW = 500; // 0.5s window for combo destruction

  constructor(scene: Phaser.Scene, config: DestructibleConfig) {
    // Create texture based on type
    const textureKey = `destructible_${config.type}`;
    if (!scene.textures.exists(textureKey)) {
      const graphics = scene.add.graphics();
      const size = config.type === 'barrel' ? 32 : 28;
      
      if (config.type === 'barrel') {
        // Barrel - brown rectangle with bands
        graphics.fillStyle(0x8B4513);
        graphics.fillRect(4, 0, size - 8, size);
        graphics.fillStyle(0x654321);
        graphics.fillRect(0, 4, size, 4);
        graphics.fillRect(0, size - 8, size, 4);
        graphics.fillRect(0, size / 2 - 2, size, 4);
      } else {
        // Crystal - purple diamond with glow
        graphics.fillStyle(PALETTE.FX_BUFF, 0.3);
        graphics.fillCircle(size / 2, size / 2, size / 2);
        graphics.fillStyle(0x9966ff);
        const half = size / 2;
        graphics.fillPoints([
          { x: half, y: 2 },
          { x: size - 4, y: half },
          { x: half, y: size - 2 },
          { x: 4, y: half }
        ], true);
        // Highlight
        graphics.fillStyle(0xffffff, 0.5);
        graphics.fillTriangle(half, 4, half - 6, half - 4, half + 2, half - 8);
      }
      
      graphics.generateTexture(textureKey, size, size);
      graphics.destroy();
    }
    
    super(scene, config.x, config.y, textureKey);
    
    this.hp = config.hp;
    this.maxHp = config.hp;
    this.xpValue = config.xpValue;
    this.destructibleType = config.type;
    
    scene.add.existing(this);
    scene.physics.add.existing(this, true); // Static body
    
    // HP bar
    this.hpBar = scene.add.graphics();
    this.updateHPBar();
    
    // Idle animation (subtle pulse for crystal)
    if (config.type === 'crystal') {
      scene.tweens.add({
        targets: this,
        scaleX: 1.05,
        scaleY: 1.05,
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut'
      });
    }
  }

  takeDamage(amount: number, playerId: number): { destroyed: boolean; wasCombo: boolean } {
    const now = this.scene.time.now;
    
    // Track which players hit within combo window
    if (now - this.lastHitTime > this.COMBO_WINDOW) {
      this.hitByPlayers.clear();
    }
    this.hitByPlayers.add(playerId);
    this.lastHitTime = now;
    
    this.hp -= amount;
    this.updateHPBar();
    
    // Flash white (capture reference in case destroyed)
    this.setTintFill(0xffffff);
    const self = this;
    this.scene.time.delayedCall(50, () => {
      if (self.active) self.clearTint();
    });
    
    if (this.hp <= 0) {
      const wasCombo = this.hitByPlayers.size >= 2;
      this.onDestroy(wasCombo);
      return { destroyed: true, wasCombo };
    }
    
    return { destroyed: false, wasCombo: false };
  }

  private onDestroy(wasCombo: boolean): void {
    // Capture scene reference before destroy
    const scene = this.scene;
    const x = this.x;
    const y = this.y;
    
    // Drop XP
    const xpMultiplier = wasCombo ? 2 : 1;
    scene.events.emit('dropXP', x, y, this.xpValue * xpMultiplier);
    
    if (wasCombo) {
      // BIG VFX for combo destruction
      scene.events.emit('comboDestruction', {
        x: x,
        y: y,
        type: this.destructibleType
      });
      
      // Slow-mo punch
      scene.time.timeScale = 0.3;
      scene.time.delayedCall(150, () => {
        scene.time.timeScale = 1;
      });
      
      // Big explosion particles
      const particles = scene.add.particles(x, y, 'particle', {
        speed: { min: 100, max: 250 },
        scale: { start: 1.5, end: 0 },
        lifespan: 600,
        quantity: 30,
        tint: this.destructibleType === 'barrel' ? 0xff8800 : PALETTE.FX_BUFF
      });
      scene.time.delayedCall(600, () => particles.destroy());
      
      // Screen shake
      scene.cameras.main.shake(200, 0.015);
      
      // Flash
      scene.cameras.main.flash(100, 255, 200, 100);
    } else {
      // Normal destruction
      const particles = scene.add.particles(x, y, 'particle', {
        speed: { min: 50, max: 120 },
        scale: { start: 0.8, end: 0 },
        lifespan: 400,
        quantity: 12,
        tint: this.destructibleType === 'barrel' ? 0x8B4513 : 0x9966ff
      });
      scene.time.delayedCall(400, () => particles.destroy());
      
      scene.cameras.main.shake(80, 0.005);
    }
    
    // Cleanup
    this.hpBar.destroy();
    this.destroy();
  }

  private updateHPBar(): void {
    this.hpBar.clear();
    
    const barWidth = 30;
    const barHeight = 4;
    const x = this.x - barWidth / 2;
    const y = this.y - 25;
    
    // Background
    this.hpBar.fillStyle(0x000000, 0.6);
    this.hpBar.fillRect(x, y, barWidth, barHeight);
    
    // HP
    const hpPercent = this.hp / this.maxHp;
    const color = hpPercent > 0.5 ? 0x00ff00 : (hpPercent > 0.25 ? 0xffff00 : 0xff0000);
    this.hpBar.fillStyle(color);
    this.hpBar.fillRect(x, y, barWidth * hpPercent, barHeight);
  }

  update(): void {
    // Keep HP bar positioned
    if (this.hpBar) {
      this.hpBar.clear();
      this.updateHPBar();
    }
  }
}

/**
 * DestructibleManager - Spawns and manages destructibles
 */
export class DestructibleManager {
  private scene: Phaser.Scene;
  private destructibles: Phaser.GameObjects.Group;
  private comboCount: number = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.destructibles = scene.add.group();
  }

  spawn(config: DestructibleConfig): Destructible {
    const destructible = new Destructible(this.scene, config);
    this.destructibles.add(destructible);
    return destructible;
  }

  spawnRandom(count: number, bounds: { x: number; y: number; width: number; height: number }): void {
    const types: Array<'barrel' | 'crystal'> = ['barrel', 'crystal'];
    
    for (let i = 0; i < count; i++) {
      const x = bounds.x + Math.random() * bounds.width;
      const y = bounds.y + Math.random() * bounds.height;
      const type = types[Math.floor(Math.random() * types.length)];
      
      this.spawn({
        x,
        y,
        type,
        hp: type === 'barrel' ? 30 : 50,
        xpValue: type === 'barrel' ? 5 : 10
      });
    }
  }

  getGroup(): Phaser.GameObjects.Group {
    return this.destructibles;
  }

  getComboCount(): number {
    return this.comboCount;
  }

  incrementCombo(): void {
    this.comboCount++;
  }

  destroy(): void {
    this.destructibles.destroy(true);
  }
}
