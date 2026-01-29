import Phaser from 'phaser';
import { Health } from '@/components/Health';
import { PALETTE } from '@/systems/AnimationSystem';
import { Player } from '@/entities/Player';

/**
 * MiniBoss - Elite enemy with shield phases
 * 
 * Shield breaks when:
 * - Both players are nearby (proximity)
 * - OR both players deal damage within window (combo)
 * 
 * Uses: Glow shader, heat pulse, heavy hit flash
 */

export interface MiniBossConfig {
  x: number;
  y: number;
  hp: number;
  damage: number;
  speed: number;
  shieldPhases: number;
}

enum BossState {
  IDLE,
  CHASING,
  SHIELDED,
  STUNNED,
  ENRAGED,
  DEAD
}

export class MiniBoss extends Phaser.Physics.Arcade.Sprite {
  public health!: Health;
  public damage: number;
  public speed: number;
  
  private bossState: BossState = BossState.IDLE;
  private shieldPhasesRemaining: number;
  private shieldActive: boolean = false;
  private shieldGraphics: Phaser.GameObjects.Arc | null = null;
  private hpBar!: Phaser.GameObjects.Graphics;
  private nameText!: Phaser.GameObjects.Text;
  
  // Shield break tracking
  private playersInRange: Set<number> = new Set();
  private readonly SHIELD_BREAK_RADIUS = 100;
  private shieldPulseTime: number = 0;
  
  // Attack patterns
  private lastAttackTime: number = 0;
  private attackCooldown: number = 1500;
  private target: Player | null = null;
  
  // Visual effects
  private glowTween: Phaser.Tweens.Tween | null = null;
  private heatPulseTime: number = 0;

  constructor(scene: Phaser.Scene, config: MiniBossConfig) {
    // Create boss texture
    const textureKey = 'miniboss_guardian';
    if (!scene.textures.exists(textureKey)) {
      const graphics = scene.add.graphics();
      const size = 48;
      const half = size / 2;
      
      // Outer glow
      graphics.fillStyle(PALETTE.ENEMY_BOSS, 0.3);
      graphics.fillCircle(half, half, half);
      
      // Main body - hexagon
      graphics.fillStyle(PALETTE.ENEMY_BOSS);
      const points = [];
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI * 2) / 6 - Math.PI / 2;
        points.push({
          x: half + Math.cos(angle) * (half - 6),
          y: half + Math.sin(angle) * (half - 6)
        });
      }
      graphics.fillPoints(points, true);
      
      // Inner detail
      graphics.fillStyle(0x000000, 0.3);
      graphics.fillCircle(half, half, 10);
      
      // Eye
      graphics.fillStyle(0xff0000);
      graphics.fillCircle(half, half, 6);
      graphics.fillStyle(0xffffff);
      graphics.fillCircle(half - 2, half - 2, 2);
      
      graphics.generateTexture(textureKey, size, size);
      graphics.destroy();
    }
    
    super(scene, config.x, config.y, textureKey);
    
    this.damage = config.damage;
    this.speed = config.speed;
    this.shieldPhasesRemaining = config.shieldPhases;
    
    scene.add.existing(this);
    scene.physics.add.existing(this);
    
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(24);
    body.setCollideWorldBounds(true);
    
    // Initialize health
    this.health = new Health(
      this,
      config.hp,
      () => this.onDeath(),
      (amount) => this.onDamage(amount)
    );
    
    // HP bar (larger for boss)
    this.hpBar = scene.add.graphics();
    
    // Name text
    this.nameText = scene.add.text(config.x, config.y - 50, '💀 GUARDIAN', {
      fontSize: '14px',
      color: '#ff4444',
      stroke: '#000000',
      strokeThickness: 3,
      fontFamily: 'Arial Black'
    });
    this.nameText.setOrigin(0.5);
    
    // Shield visual
    this.shieldGraphics = scene.add.arc(config.x, config.y, 40, 0, 360, false, PALETTE.FX_BUFF, 0);
    this.shieldGraphics.setStrokeStyle(4, PALETTE.FX_BUFF, 0);
    this.shieldGraphics.setVisible(false);
    this.shieldGraphics.setDepth(this.depth + 1);
    
    // Start with shield if has phases
    if (this.shieldPhasesRemaining > 0) {
      this.activateShield();
    }
    
    // Glow effect
    this.startGlowEffect();
    
    this.updateHPBar();
  }

  private startGlowEffect(): void {
    this.glowTween = this.scene.tweens.add({
      targets: this,
      alpha: { from: 1, to: 0.7 },
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut'
    });
  }

  private activateShield(): void {
    this.shieldActive = true;
    this.bossState = BossState.SHIELDED;
    
    if (this.shieldGraphics) {
      this.shieldGraphics.setVisible(true);
      this.shieldGraphics.setAlpha(0);
      
      this.scene.tweens.add({
        targets: this.shieldGraphics,
        alpha: 0.6,
        duration: 300,
        ease: 'Power2'
      });
    }
    
    // Emit event for UI hint
    this.scene.events.emit('bossShieldActivated', {
      x: this.x,
      y: this.y,
      hint: 'Get close together!'
    });
  }

  private breakShield(): void {
    this.shieldActive = false;
    this.shieldPhasesRemaining--;
    this.bossState = BossState.STUNNED;
    
    // Shield break VFX
    if (this.shieldGraphics) {
      this.scene.tweens.add({
        targets: this.shieldGraphics,
        alpha: 0,
        scale: 2,
        duration: 300,
        ease: 'Power2',
        onComplete: () => {
          this.shieldGraphics?.setVisible(false);
          this.shieldGraphics?.setScale(1);
        }
      });
    }
    
    // Big flash
    this.scene.cameras.main.flash(150, 100, 200, 255);
    this.scene.cameras.main.shake(150, 0.01);
    
    // Slow-mo punch
    this.scene.time.timeScale = 0.2;
    this.scene.time.delayedCall(100, () => {
      this.scene.time.timeScale = 1;
    });
    
    // Emit event
    this.scene.events.emit('bossShieldBroken', {
      x: this.x,
      y: this.y,
      phasesRemaining: this.shieldPhasesRemaining
    });
    
    // Stunned for a moment, then resume or re-shield
    this.scene.time.delayedCall(2000, () => {
      if (this.active && this.shieldPhasesRemaining > 0 && this.health.percentage < 0.5) {
        this.activateShield();
      } else {
        this.bossState = BossState.ENRAGED;
        this.speed *= 1.3;
        this.setTint(0xff6666);
      }
    });
  }

  update(time: number, delta: number, players: Player[]): void {
    if (!this.active || this.bossState === BossState.DEAD) return;
    
    // Update visuals position
    this.updateHPBar();
    this.nameText.setPosition(this.x, this.y - 50);
    
    if (this.shieldGraphics) {
      this.shieldGraphics.setPosition(this.x, this.y);
    }
    
    // Heat pulse effect
    this.heatPulseTime += delta;
    const pulse = 1 + 0.05 * Math.sin(this.heatPulseTime / 200);
    this.setScale(pulse);
    
    // Shield logic
    if (this.shieldActive) {
      this.updateShield(delta, players);
      // Move slower when shielded
      this.moveTowardTarget(players, this.speed * 0.5);
    } else if (this.bossState === BossState.STUNNED) {
      // Don't move when stunned
      const body = this.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(0, 0);
    } else {
      // Normal behavior
      this.moveTowardTarget(players, this.speed);
      this.handleAttack(time, players);
    }
  }

  private updateShield(delta: number, players: Player[]): void {
    this.shieldPulseTime += delta;
    
    // Check for players in range
    this.playersInRange.clear();
    for (const player of players) {
      if (!player.active || player.isDead) continue;
      
      const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
      if (dist <= this.SHIELD_BREAK_RADIUS) {
        this.playersInRange.add(player.playerId);
      }
    }
    
    // Shield pulse visual
    if (this.shieldGraphics) {
      const baseAlpha = 0.4 + 0.2 * Math.sin(this.shieldPulseTime / 200);
      
      // Glow more when players are close
      const proximityBonus = this.playersInRange.size * 0.15;
      this.shieldGraphics.setStrokeStyle(4, PALETTE.FX_BUFF, baseAlpha + proximityBonus);
      
      // Color shift when close to breaking
      if (this.playersInRange.size >= 2) {
        this.shieldGraphics.setStrokeStyle(5, 0xff0000, 0.8);
      }
    }
    
    // Break shield if both players are close
    if (this.playersInRange.size >= 2) {
      this.breakShield();
    }
  }

  private moveTowardTarget(players: Player[], speed: number): void {
    // Find closest player
    let closest: Player | null = null;
    let minDist = Infinity;
    
    for (const player of players) {
      if (!player.active || player.isDead) continue;
      
      const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
      if (dist < minDist) {
        minDist = dist;
        closest = player;
      }
    }
    
    this.target = closest;
    
    if (closest) {
      const angle = Phaser.Math.Angle.Between(this.x, this.y, closest.x, closest.y);
      const body = this.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(
        Math.cos(angle) * speed,
        Math.sin(angle) * speed
      );
    }
  }

  private handleAttack(time: number, players: Player[]): void {
    if (time - this.lastAttackTime < this.attackCooldown) return;
    
    for (const player of players) {
      if (!player.active || player.isDead) continue;
      
      const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
      if (dist <= 50) {
        player.health.damage(this.damage);
        this.lastAttackTime = time;
        
        // Heavy hit flash
        this.scene.cameras.main.flash(50, 255, 50, 50);
        this.scene.cameras.main.shake(60, 0.008);
        
        this.scene.events.emit('playerHit', {
          sprite: player,
          damage: this.damage
        });
        break;
      }
    }
  }

  takeDamage(amount: number, playerId: number): boolean {
    if (this.shieldActive) {
      // Reduced damage when shielded
      amount *= 0.1;
      
      // Visual feedback
      this.setTintFill(PALETTE.FX_BUFF);
      this.scene.time.delayedCall(30, () => this.clearTint());
    }
    
    this.health.damage(amount);
    return this.health.current <= 0;
  }

  private onDamage(amount: number): void {
    // Flash
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(50, () => {
      if (this.bossState === BossState.ENRAGED) {
        this.setTint(0xff6666);
      } else {
        this.clearTint();
      }
    });
    
    this.scene.events.emit('enemyHit', {
      sprite: this,
      damage: amount,
      isCrit: false
    });
  }

  private onDeath(): void {
    this.bossState = BossState.DEAD;
    
    // BIGGEST VFX IN DEMO
    // Multiple explosion rings
    for (let i = 0; i < 3; i++) {
      this.scene.time.delayedCall(i * 100, () => {
        const ring = this.scene.add.circle(this.x, this.y, 20, PALETTE.ENEMY_BOSS, 0);
        ring.setStrokeStyle(6 - i * 2, PALETTE.ENEMY_BOSS);
        
        this.scene.tweens.add({
          targets: ring,
          radius: 150 + i * 50,
          alpha: 0,
          duration: 400,
          ease: 'Power2',
          onComplete: () => ring.destroy()
        });
      });
    }
    
    // Massive particle burst
    const particles = this.scene.add.particles(this.x, this.y, 'particle', {
      speed: { min: 150, max: 400 },
      scale: { start: 2, end: 0 },
      lifespan: 1000,
      quantity: 50,
      tint: [PALETTE.ENEMY_BOSS, 0xff0000, 0xffff00]
    });
    this.scene.time.delayedCall(1000, () => particles.destroy());
    
    // Long slow-mo
    this.scene.time.timeScale = 0.15;
    this.scene.time.delayedCall(300, () => {
      this.scene.time.timeScale = 1;
    });
    
    // Screen effects
    this.scene.cameras.main.flash(300, 255, 200, 100);
    this.scene.cameras.main.shake(400, 0.02);
    
    // Drop big XP
    this.scene.events.emit('dropXP', this.x, this.y, 100);
    
    // Emit death event
    this.scene.events.emit('bossDefeated', {
      x: this.x,
      y: this.y
    });
    
    // Cleanup
    this.glowTween?.stop();
    this.hpBar.destroy();
    this.nameText.destroy();
    this.shieldGraphics?.destroy();
    this.destroy();
  }

  private updateHPBar(): void {
    this.hpBar.clear();
    
    const barWidth = 60;
    const barHeight = 8;
    const x = this.x - barWidth / 2;
    const y = this.y - 40;
    
    // Background
    this.hpBar.fillStyle(0x000000, 0.7);
    this.hpBar.fillRect(x - 2, y - 2, barWidth + 4, barHeight + 4);
    
    // HP gradient
    const hpPercent = this.health.percentage;
    const color = hpPercent > 0.5 ? 0xff4444 : (hpPercent > 0.25 ? 0xff8800 : 0xff0000);
    this.hpBar.fillStyle(color);
    this.hpBar.fillRect(x, y, barWidth * hpPercent, barHeight);
    
    // Shield indicator
    if (this.shieldActive) {
      this.hpBar.fillStyle(PALETTE.FX_BUFF, 0.5);
      this.hpBar.fillRect(x, y, barWidth, barHeight);
    }
    
    // Border
    this.hpBar.lineStyle(2, 0xffffff);
    this.hpBar.strokeRect(x, y, barWidth, barHeight);
  }
}
