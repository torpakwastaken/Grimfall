import Phaser from 'phaser';
import { PooledObject } from '@/types/GameTypes';
import { createProjectileSprite, PALETTE } from '@/systems/AnimationSystem';

export class Projectile extends Phaser.Physics.Arcade.Sprite implements PooledObject {
  public active: boolean = false;
  public damage: number = 0;
  public pierce: number = 0;
  public ownerId: number = 0;
  public heavy: boolean = false;
  public projectileColor: number = 0xffffff;
  
  private pierceCount: number = 0;
  private lifetime: number = 3000; // 3 seconds
  private spawnTime: number = 0;
  private velocity: Phaser.Math.Vector2 = new Phaser.Math.Vector2();

  constructor(scene: Phaser.Scene) {
    // Create texture first before calling super
    const textureKey = 'projectile';
    if (!scene.textures.exists(textureKey)) {
      const graphics = scene.add.graphics();
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
    projectileType?: 'damage' | 'support' | 'explosive' | 'enemy';
  }): void {
    this.active = true;
    this.setActive(true);
    this.setVisible(true);
    
    this.setPosition(data.x, data.y);
    
    // Use palette-based projectile sprite (color = function)
    const projType = data.projectileType || (data.heavy ? 'explosive' : 'damage');
    const textureKey = createProjectileSprite(this.scene, projType, Math.max(8, data.size * 2));
    this.setTexture(textureKey);
    this.setScale(data.size / 4);
    
    // Apply color tint based on owner
    const ownerColors = [PALETTE.P1_PRIMARY, PALETTE.P2_PRIMARY];
    if (data.ownerId >= 0 && data.ownerId < 2) {
      this.setTint(ownerColors[data.ownerId]);
    } else {
      this.setTint(PALETTE.PROJ_ENEMY);
    }
    
    this.damage = data.damage;
    this.pierce = data.pierce;
    this.pierceCount = 0;
    this.ownerId = data.ownerId;
    this.heavy = data.heavy || false;
    
    this.velocity.setToPolar(data.angle, data.speed);
    this.projectileColor = data.color;
    
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(this.velocity.x, this.velocity.y);
    body.setCircle(data.size);
    
    this.spawnTime = this.scene.time.now;

    // Heavy weapons have trails and larger size
    if (this.heavy) {
      this.setAlpha(0.9);
      this.setScale(data.size / 3);
      this.setTint(PALETTE.PROJ_EXPLOSIVE);
    } else {
      this.setAlpha(1);
    }
  }

  reset(): void {
    this.active = false;
    this.setActive(false);
    this.setVisible(false);
    this.pierceCount = 0;
    
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) body.setVelocity(0, 0);
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
      tint: this.projectileColor
    });

    this.scene.time.delayedCall(300, () => particles.destroy());
  }
}
