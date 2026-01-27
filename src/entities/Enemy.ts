import Phaser from 'phaser';
import { Health } from '@/components/Health';
import { EnemyData } from '@/types/GameTypes';
import { PooledObject } from '@/types/GameTypes';

export class Enemy extends Phaser.Physics.Arcade.Sprite implements PooledObject {
  public active: boolean = false;
  public health!: Health;
  public enemyData!: EnemyData;
  
  private bodyShape!: Phaser.GameObjects.Shape;
  private hpBar!: Phaser.GameObjects.Graphics;
  private target: { x: number; y: number } | null = null;
  private lastAttackTime: number = 0;
  private markedUntil: number = 0;
  private baseColor: number = 0xffffff;

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
      const graphics = scene.make.graphics({ x: 0, y: 0, add: false });
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
    this.baseColor = parseInt(data.color);
    
    // Create a sprite texture with the enemy shape if not already done
    const textureKey = `enemy_${data.id}`;
    if (!this.scene.textures.exists(textureKey)) {
      const graphics = this.scene.add.graphics();
      graphics.fillStyle(this.baseColor);
      graphics.fillCircle(data.size, data.size, data.size);
      graphics.generateTexture(textureKey, data.size * 2, data.size * 2);
      graphics.destroy();
    }
    this.setTexture(textureKey);

    // Store shape info for later rendering if needed
    if (!this.bodyShape) {
      this.bodyShape = this.scene.add.circle(0, 0, data.size, this.baseColor);
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
    if (this.body) {
      this.body.setCircle(data.size);
      this.body.setCollideWorldBounds(true);
      this.body.setBounce(0.2, 0.2);
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
    
    this.body.setVelocity(
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

    // Shield reduction for shieldbearers
    if (this.enemyData.frontShield && this.isAttackBlocked(fromPlayer)) {
      finalDamage *= (1 - this.enemyData.shieldReduction!);
      this.scene.events.emit('shieldHit', this);
    }

    const actualDamage = this.health.damage(finalDamage);
    
    // Visual feedback
    this.setTint(0xff0000);
    this.scene.time.delayedCall(100, () => {
      this.clearTint();
      if (this.isMarked()) {
        this.setTint(0xffff00);
      }
    });

    return actualDamage;
  }

  mark(duration: number): void {
    this.markedUntil = this.scene.time.now + duration;
    this.setTint(0xffff00);
  }

  isMarked(): boolean {
    return this.scene.time.now < this.markedUntil;
  }

  private onDeath(): void {
    this.scene.events.emit('enemyKilled', this);
    
    // Drop XP
    this.scene.events.emit('dropXP', this.x, this.y, this.enemyData.xpValue);
    
    // Death effect
    this.createDeathEffect();
    
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
