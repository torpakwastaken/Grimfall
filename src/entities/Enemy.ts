import Phaser from 'phaser';
import { Health } from '@/components/Health';
import { EnemyData } from '@/types/GameTypes';
import { PooledObject } from '@/types/GameTypes';
import { createEnemySprite, PALETTE } from '@/systems/AnimationSystem';

export class Enemy extends Phaser.Physics.Arcade.Sprite implements PooledObject {
  public active: boolean = false;
  public health!: Health;
  public enemyData!: EnemyData;
  
  // Network sync properties
  public enemyId: string = '';
  
  private bodyShape!: Phaser.GameObjects.Shape;
  private hpBar!: Phaser.GameObjects.Graphics;
  private target: { x: number; y: number } | null = null;
  private lastAttackTime: number = 0;
  private markedUntil: number = 0;
  private brokenUntil: number = 0;
  private baseColor: number = 0xffffff;
  
  // Aggro system for threat split
  public aggroTarget: number = -1; // -1 = nearest, 0 = P1, 1 = P2
  public aggroType: 'nearest' | 'dps' | 'fixed' = 'nearest';

  // Shieldbearer specific
  private facingAngle: number = 0;

  // Sniper specific
  private laserLine?: Phaser.GameObjects.Line;
  private chargingLaser: boolean = false;
  private laserChargeStart: number = 0;

  constructor(scene: Phaser.Scene) {
    // Create a default texture first
    const textureKey = 'enemy_default';
    if (!scene.textures.exists(textureKey)) {
      const graphics = scene.add.graphics();
      graphics.fillStyle(0xffffff);
      graphics.fillCircle(15, 15, 15);
      graphics.generateTexture(textureKey, 30, 30);
      graphics.destroy();
    }
    super(scene, 0, 0, textureKey);
    scene.add.existing(this);
  }

  activate(data: EnemyData, x: number, y: number): void {
    this.active = true;
    this.setActive(true);
    this.setVisible(true);
    this.setPosition(x, y);
    
    this.enemyData = data;
    
    // Get palette color based on enemy type
    const paletteColors: Record<string, number> = {
      'swarmer': PALETTE.ENEMY_SWARMER,
      'shambler': PALETTE.ENEMY_SHAMBLER,
      'shieldbearer': PALETTE.ENEMY_SHIELDBEARER,
      'sniper': PALETTE.ENEMY_SNIPER
    };
    this.baseColor = paletteColors[data.id] || parseInt(data.color);
    
    // Create shape-based sprite (silhouette > detail)
    // Use size from data for proper scaling
    const spriteSize = Math.max(24, data.size * 2);
    const textureKey = createEnemySprite(this.scene, data.id, spriteSize);
    this.setTexture(textureKey);
    
    // Scale to match actual enemy size
    const scale = (data.size * 2) / spriteSize;
    this.setScale(scale);
    
    // Apply elite tint if this is an elite enemy
    if ((data as any).isElite) {
      this.setTint(PALETTE.ENEMY_ELITE);
    } else {
      this.clearTint();
    }

    // Store shape info for later rendering if needed
    if (!this.bodyShape) {
      this.bodyShape = this.scene.add.circle(0, 0, data.size, this.baseColor);
      this.bodyShape.setVisible(false); // Hide the old circle
      this.hpBar = this.scene.add.graphics();
    } else {
      this.updateBodyShape(data);
    }

    // Initialize health
    this.health = new Health(
      this,
      data.hp,
      () => this.onDeath(),
      () => this.onDamage()
    );

    // Physics
    if (!this.body) {
      this.scene.physics.add.existing(this);
    }
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setCircle(data.size);
      body.setCollideWorldBounds(true);
      body.setBounce(0.2, 0.2);
    }

    this.updateHPBar();
  }

  reset(): void {
    this.active = false;
    this.setActive(false);
    this.setVisible(false);
    this.target = null;
    this.lastAttackTime = 0;
    this.markedUntil = 0;
    this.brokenUntil = 0;
    this.aggroTarget = -1;
    this.aggroType = 'nearest';
    this.chargingLaser = false;
    
    // Clear health bar
    if (this.hpBar) {
      this.hpBar.clear();
    }
    
    if (this.laserLine) {
      this.laserLine.destroy();
      this.laserLine = undefined;
    }

    const physicsBody = this.body as Phaser.Physics.Arcade.Body;
    if (physicsBody) {
      physicsBody.setVelocity(0, 0);
    }
  }

  deactivate(): void {
    this.reset();
  }

  /**
   * Simple spawn for network sync - minimal setup, reuses existing texture
   * Much faster than full spawn() for guest clients
   */
  spawnSimple(type: string, x: number, y: number, health: number): void {
    this.active = true;
    this.setActive(true);
    this.setVisible(true);
    this.setPosition(x, y);
    
    // Only create texture if we don't have one for this type
    const textureKey = `enemy_${type}`;
    if (this.scene.textures.exists(textureKey)) {
      this.setTexture(textureKey);
    } else {
      // Fallback - create basic texture once
      const spriteSize = 30;
      const key = createEnemySprite(this.scene, type, spriteSize);
      this.setTexture(key);
    }
    
    // Initialize or update health
    if (!this.health) {
      this.health = new Health(this, health, () => this.onDeath(), () => this.onDamage());
    } else {
      this.health.setCurrent(health);
    }
    
    // Physics - only add if needed
    if (!this.body) {
      this.scene.physics.add.existing(this);
    }
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (body) {
      body.setCircle(15);
      body.setCollideWorldBounds(true);
    }
    
    // Create hp bar only if needed
    if (!this.hpBar) {
      this.hpBar = this.scene.add.graphics();
    }
  }

  /**
   * Network spawn - simplified activation for guest clients
   * Spawns an enemy based on minimal state from host
   */
  spawn(type: string, x: number, y: number, scale: number = 1, health: number = 100): void {
    // Try to get data for this type, or use a default
    const enemyDataJson = (this.scene as any).cache?.json?.get('enemies') || {};
    const data = enemyDataJson[type] || {
      id: type,
      type: 'basic',
      hp: health,
      damage: 10,
      speed: 80,
      size: 15,
      color: '0xff0000'
    };
    
    this.active = true;
    this.setActive(true);
    this.setVisible(true);
    this.setPosition(x, y);
    
    this.enemyData = data;
    
    // Get palette color
    const paletteColors: Record<string, number> = {
      'swarmer': PALETTE.ENEMY_SWARMER,
      'shambler': PALETTE.ENEMY_SHAMBLER,
      'shieldbearer': PALETTE.ENEMY_SHIELDBEARER,
      'sniper': PALETTE.ENEMY_SNIPER
    };
    this.baseColor = paletteColors[data.id] || parseInt(data.color);
    
    // Create texture
    const spriteSize = Math.max(24, data.size * 2);
    const textureKey = createEnemySprite(this.scene, data.id, spriteSize);
    this.setTexture(textureKey);
    this.setScale(scale);
    
    // Initialize health
    this.health = new Health(
      this,
      health,
      () => this.onDeath(),
      () => this.onDamage()
    );
    
    // Physics
    if (!this.body) {
      this.scene.physics.add.existing(this);
    }
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setCircle(data.size);
      body.setCollideWorldBounds(true);
    }
    
    // Create hp bar if needed
    if (!this.hpBar) {
      this.hpBar = this.scene.add.graphics();
    }
    this.updateHPBar();
  }

  private updateBodyShape(data: EnemyData): void {
    const color = parseInt(data.color);
    if (this.bodyShape) {
      this.bodyShape.setFillStyle(color);
    }
    // Size updates handled by shape type
  }

  update(time: number, delta: number, players: any[]): void {
    if (!this.active || !this.health.isAlive || !players) return;

    // Update marked status
    if (time > this.markedUntil && this.isMarked()) {
      this.clearTint();
    }

    // Find nearest player as target
    this.target = this.findNearestPlayer(players);
    if (!this.target) return;

    // Behavior based on enemy type
    if (this.enemyData.stationary) {
      this.handleSniperBehavior(time);
    } else {
      this.handleMovement();
      this.handleAttack(time, players);
    }

    this.updateHPBar();
  }

  private findNearestPlayer(players: any[]): { x: number; y: number } | null {
    if (!players || !Array.isArray(players)) {
      return null;
    }
    
    // AGGRO SPLIT: If this enemy has a fixed target, go for that player
    if (this.aggroType === 'fixed' && this.aggroTarget >= 0) {
      const targetPlayer = players.find(p => p.playerId === this.aggroTarget);
      if (targetPlayer && targetPlayer.active && !targetPlayer.isDead) {
        return targetPlayer;
      }
    }
    
    // Default: Find nearest player
    let nearest: any = null;
    let minDist = Infinity;

    for (const player of players) {
      if (!player.active || player.isDead) continue;
      
      const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
      if (dist < minDist) {
        minDist = dist;
        nearest = player;
      }
    }

    return nearest;
  }

  private handleMovement(): void {
    if (!this.target || this.enemyData.stationary) return;
    if (!this.body) return;

    const angle = Phaser.Math.Angle.Between(this.x, this.y, this.target.x, this.target.y);
    this.facingAngle = angle;
    
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(
      Math.cos(angle) * this.enemyData.speed,
      Math.sin(angle) * this.enemyData.speed
    );

    // Rotate triangle to face movement direction
    if (this.enemyData.shape === 'triangle') {
      this.setRotation(angle + Math.PI / 2);
    }
  }

  private handleAttack(time: number, players: any[]): void {
    if (time - this.lastAttackTime < this.enemyData.attackCooldown) return;

    for (const player of players) {
      if (!player.active || player.isDead) continue;
      
      const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
      if (dist <= this.enemyData.attackRange) {
        this.attack(player);
        this.lastAttackTime = time;
        break;
      }
    }
  }

  private handleSniperBehavior(time: number): void {
    if (!this.target) return;

    if (!this.chargingLaser) {
      // Start charging
      this.chargingLaser = true;
      this.laserChargeStart = time;
      
      // Create laser line
      this.laserLine = this.scene.add.line(
        this.x, this.y, this.x, this.y,
        this.target.x,
        this.target.y,
        0xff0000
      );
      this.laserLine.setLineWidth(2);
      this.laserLine.setAlpha(0.3);
    } else {
      // Update laser line to track target
      if (this.laserLine && this.target) {
        this.laserLine.setTo(
          0, 0,
          this.target.x - this.x,
          this.target.y - this.y
        );

        const chargeProgress = (time - this.laserChargeStart) / this.enemyData.laserWindup!;
        this.laserLine.setAlpha(0.3 + chargeProgress * 0.7);
        this.laserLine.setLineWidth(2 + chargeProgress * 2);
      }

      // Fire laser
      if (time - this.laserChargeStart >= this.enemyData.laserWindup!) {
        this.fireLaser();
        this.chargingLaser = false;
        if (this.laserLine) {
          this.laserLine.destroy();
          this.laserLine = undefined;
        }
        this.lastAttackTime = time;
      }
    }
  }

  private attack(player: any): void {
    // Check shield angle for shieldbearers
    if (this.enemyData.frontShield && this.isAttackBlocked(player)) {
      // Attack blocked by shield
      this.scene.events.emit('shieldBlock', this, player);
      return;
    }

    player.takeDamage(this.enemyData.damage);
    
    // Emit damage event for debug overlay
    this.scene.events.emit('playerDamaged', {
      playerId: player.playerId,
      amount: this.enemyData.damage,
      source: this.enemyData.id
    });
    
    // Visual feedback
    this.scene.cameras.main.flash(50, 255, 100, 100);
  }

  private fireLaser(): void {
    if (!this.target) return;

    // Create laser projectile
    const angle = Phaser.Math.Angle.Between(this.x, this.y, this.target.x, this.target.y);
    
    this.scene.events.emit('createProjectile', {
      x: this.x,
      y: this.y,
      angle: angle,
      speed: 600,
      damage: this.enemyData.damage,
      size: 8,
      pierce: 0,
      color: 0xff0000,
      ownerId: -1, // Enemy projectile
      heavy: true
    });
  }

  private isAttackBlocked(player: any): boolean {
    if (!this.enemyData.frontShield) return false;

    // Calculate if player is attacking from behind (180° arc)
    const angleToPlayer = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
    const angleDiff = Phaser.Math.Angle.Wrap(angleToPlayer - this.facingAngle);
    
    return Math.abs(angleDiff) < Math.PI / 2; // Front 180° arc
  }

  takeDamage(amount: number, fromPlayer: any): number {
    if (!this.health.isAlive) return 0;

    let finalDamage = amount;
    const playerId = fromPlayer?.playerId ?? -1;
    const isBreaker = playerId === 0;
    const isAmplifier = playerId === 1;

    // Shield reduction for shieldbearers
    if (this.enemyData.frontShield && this.isAttackBlocked(fromPlayer)) {
      finalDamage *= (1 - this.enemyData.shieldReduction!);
      this.scene.events.emit('shieldHit', this);
    }

    // === ROLE SYNERGY DAMAGE ===
    
    // Amplifier does 2.5x damage to BROKEN enemies
    if (isAmplifier && this.isBroken()) {
      finalDamage *= 2.5;
      
      // SYNERGY: Break → Detonate explosion!
      this.scene.events.emit('synergyTriggered', {
        type: 'break_detonate',
        x: this.x,
        y: this.y,
        damage: 40,
        radius: 60
      });
    }
    
    // Breaker does 1.5x damage to MARKED enemies + spreads mark
    if (isBreaker && this.isMarked()) {
      finalDamage *= 1.5;
      
      // SYNERGY: Spread mark to nearby enemies
      this.scene.events.emit('synergyTriggered', {
        type: 'marked_shatter',
        x: this.x,
        y: this.y,
        spreadRadius: 80
      });
    }

    const actualDamage = this.health.damage(finalDamage);
    
    // Visual feedback - show state colors
    this.setTint(0xff0000);
    this.scene.time.delayedCall(100, () => {
      this.updateStateTint();
    });

    return actualDamage;
  }

  // === STATE MANAGEMENT ===
  
  /** Breaker applies BROKEN state - enemies take 2.5x from Amplifier */
  applyBroken(duration: number): void {
    this.brokenUntil = this.scene.time.now + duration;
    this.updateStateTint();
    
    // Visual pulse effect
    this.scene.tweens.add({
      targets: this,
      scaleX: this.scaleX * 1.2,
      scaleY: this.scaleY * 1.2,
      duration: 100,
      yoyo: true,
      ease: 'Power2'
    });
    
    this.scene.events.emit('enemyBroken', { enemy: this, x: this.x, y: this.y });
  }
  
  isBroken(): boolean {
    return this.scene.time.now < this.brokenUntil;
  }

  /** Amplifier applies MARKED state - enemies take 1.5x from Breaker */
  mark(duration: number): void {
    this.markedUntil = this.scene.time.now + duration;
    this.updateStateTint();
  }

  isMarked(): boolean {
    return this.scene.time.now < this.markedUntil;
  }
  
  private updateStateTint(): void {
    if (!this.active) return;
    
    if (this.isBroken() && this.isMarked()) {
      // Both states = purple (synergy ready!)
      this.setTint(0xff00ff);
    } else if (this.isBroken()) {
      // Broken = orange (Amplifier bonus)
      this.setTint(0xffaa00);
    } else if (this.isMarked()) {
      // Marked = cyan (Breaker bonus)
      this.setTint(0x00ffff);
    } else {
      this.clearTint();
    }
  }

  /** Apply knockback from Breaker hits */
  applyKnockback(fromX: number, fromY: number, force: number): void {
    const angle = Phaser.Math.Angle.Between(fromX, fromY, this.x, this.y);
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setVelocity(
        Math.cos(angle) * force,
        Math.sin(angle) * force
      );
    }
  }

  private onDeath(): void {
    const isElite = (this as any).isElite || false;
    
    // Emit detailed kill event for debug overlay
    this.scene.events.emit('enemyKilled', {
      id: (this as any).enemyId,
      isElite: isElite,
      hp: this.enemyData.hp,
      type: this.enemyData.id
    });
    
    // Emit VFX event for death particles
    if (isElite) {
      this.scene.events.emit('eliteDeath', { x: this.x, y: this.y, color: this.baseColor });
    } else {
      this.scene.events.emit('enemyDeath', { x: this.x, y: this.y, color: this.baseColor });
    }
    
    // Drop XP
    this.scene.events.emit('dropXP', this.x, this.y, this.enemyData.xpValue);
    
    this.deactivate();
  }

  private onDamage(): void {
    // Damage number could be shown here
  }

  private createDeathEffect(): void {
    // Simple particle burst
    const particles = this.scene.add.particles(this.x, this.y, 'particle', {
      speed: { min: 100, max: 200 },
      scale: { start: 1, end: 0 },
      lifespan: 500,
      quantity: 8,
      tint: this.baseColor
    });

    this.scene.time.delayedCall(500, () => particles.destroy());
  }

  private updateHPBar(): void {
    if (!this.hpBar) return;
    
    this.hpBar.clear();
    
    const barWidth = this.enemyData.size * 2;
    const barHeight = 3;
    const x = this.x - barWidth / 2;
    const y = this.y - this.enemyData.size - 8;

    // Background
    this.hpBar.fillStyle(0x000000, 0.5);
    this.hpBar.fillRect(x, y, barWidth, barHeight);

    // Current HP
    const hpPercentage = this.health.percentage;
    this.hpBar.fillStyle(0xff0000);
    this.hpBar.fillRect(x, y, barWidth * hpPercentage, barHeight);
  }
}
