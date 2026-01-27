import Phaser from 'phaser';
import { PooledObject } from '@/types/GameTypes';

export class Projectile extends Phaser.Physics.Arcade.Sprite implements PooledObject {
  public active: boolean = false;
  public damage: number = 0;
  public pierce: number = 0;
  public ownerId: number = 0;
  public heavy: boolean = false;
  
  private pierceCount: number = 0;
  private lifetime: number = 3000; // 3 seconds
  private spawnTime: number = 0;
  private velocity: Phaser.Math.Vector2 = new Phaser.Math.Vector2();

  constructor(scene: Phaser.Scene) {
    // Create texture first before calling super
    const textureKey = 'projectile';
    if (!scene.textures.exists(textureKey)) {
      const graphics = scene.make.graphics({ x: 0, y: 0, add: false });
      graphics.fillStyle(0xffffff);
      graphics.fillCircle(4, 4, 4);
      graphics.generateTexture(textureKey, 8, 8);
      graphics.destroy();
    }
    
    super(scene, 0, 0, textureKey);
    this.setActive(false);
    this.setVisible(false);
    scene.add.existing(this);
    scene.physics.add.existing(this);
  }

  activate(data: {
    x: number;
    y: number;
    angle: number;
    speed: number;
    damage: number;
    size: number;
    pierce: number;
    color: number;
    ownerId: number;
    heavy?: boolean;
  }): void {
    this.active = true;
    this.setActive(true);
    this.setVisible(true);
    
    this.setPosition(data.x, data.y);
    this.setScale(data.size / 4); // Scale relative to the 8x8 texture
    this.setTint(data.color);
    
    this.damage = data.damage;
    this.pierce = data.pierce;
    this.pierceCount = 0;
    this.ownerId = data.ownerId;
    this.heavy = data.heavy || false;
    
    this.velocity.setToPolar(data.angle, data.speed);
    
    this.body.setVelocity(this.velocity.x, this.velocity.y);
    this.body.setCircle(data.size);
    
    this.spawnTime = this.scene.time.now;

    // Heavy weapons have trails
    if (this.heavy) {
      this.setAlpha(0.8);
      this.setScale(1.5);
    } else {
      this.setAlpha(1);
      this.setScale(1);
    }
  }

  reset(): void {
    this.active = false;
    this.setActive(false);
    this.setVisible(false);
    this.pierceCount = 0;
    
    this.body.setVelocity(0, 0);
  }

  deactivate(): void {
    this.reset();
  }

  update(time: number): void {
    if (!this.active) return;

    // Check lifetime
    if (time - this.spawnTime > this.lifetime) {
      this.deactivate();
      return;
    }

    // Check bounds (wraparound handled by scene)
    const cam = this.scene.cameras.main;
    const buffer = 100;
    if (
      this.x < cam.scrollX - buffer ||
      this.x > cam.scrollX + cam.width + buffer ||
      this.y < cam.scrollY - buffer ||
      this.y > cam.scrollY + cam.height + buffer
    ) {
      this.deactivate();
    }
  }

  onHit(): boolean {
    this.pierceCount++;
    
    if (this.pierceCount > this.pierce) {
      this.deactivate();
      return true; // Projectile destroyed
    }
    
    return false; // Projectile continues
  }

  createHitEffect(): void {
    const particles = this.scene.add.particles(this.x, this.y, 'particle', {
      speed: { min: 50, max: 100 },
      scale: { start: 0.5, end: 0 },
      lifespan: 300,
      quantity: this.heavy ? 10 : 5,
      tint: this.fillColor
    });

    this.scene.time.delayedCall(300, () => particles.destroy());
  }
}
