import Phaser from 'phaser';
import { WeaponConfig } from '@/types/GameTypes';

export class Weapon {
  private scene: Phaser.Scene;
  private owner: Phaser.GameObjects.GameObject & { x: number; y: number };
  public config: WeaponConfig;
  private lastFireTime: number = 0;
  private fireInterval: number;
  
  // Stats can be modified by upgrades
  public damageMultiplier: number = 1;
  public fireRateMultiplier: number = 1;
  public pierceBonus: number = 0;

  constructor(
    scene: Phaser.Scene,
    owner: Phaser.GameObjects.GameObject & { x: number; y: number },
    config: WeaponConfig
  ) {
    this.scene = scene;
    this.owner = owner;
    this.config = config;
    this.fireInterval = 1000 / config.fireRate;
  }

  canFire(): boolean {
    const now = this.scene.time.now;
    const adjustedInterval = this.fireInterval / this.fireRateMultiplier;
    return now - this.lastFireTime >= adjustedInterval;
  }

  fire(targetX: number, targetY: number, onProjectileCreate: (projectile: any) => void): boolean {
    if (!this.canFire()) return false;

    this.lastFireTime = this.scene.time.now;

    const angle = Phaser.Math.Angle.Between(
      this.owner.x,
      this.owner.y,
      targetX,
      targetY
    );

    if (this.config.type === 'auto') {
      if (this.config.pellets && this.config.spread) {
        // Shotgun pattern
        this.fireShotgun(angle, onProjectileCreate);
      } else {
        // Single bullet
        this.fireSingle(angle, onProjectileCreate);
      }
    } else {
      // Heavy weapon - single powerful shot
      this.fireSingle(angle, onProjectileCreate);
    }

    return true;
  }

  private fireSingle(angle: number, onProjectileCreate: (projectile: any) => void): void {
    const projectileData = {
      x: this.owner.x,
      y: this.owner.y,
      angle: angle,
      speed: this.config.projectileSpeed,
      damage: this.config.damage * this.damageMultiplier,
      size: this.config.projectileSize,
      pierce: this.config.pierce + this.pierceBonus,
      color: this.config.color,
      ownerId: (this.owner as any).playerId || 0
    };

    onProjectileCreate(projectileData);
  }

  private fireShotgun(angle: number, onProjectileCreate: (projectile: any) => void): void {
    const pellets = this.config.pellets!;
    const spread = this.config.spread!;
    const spreadRad = Phaser.Math.DegToRad(spread);
    
    for (let i = 0; i < pellets; i++) {
      const offset = spreadRad * ((i / (pellets - 1)) - 0.5);
      const pelletAngle = angle + offset;
      
      const projectileData = {
        x: this.owner.x,
        y: this.owner.y,
        angle: pelletAngle,
        speed: this.config.projectileSpeed,
        damage: (this.config.damage * this.damageMultiplier) / pellets, // Divide damage among pellets
        size: this.config.projectileSize * 0.7,
        pierce: Math.floor((this.config.pierce + this.pierceBonus) / 2), // Reduced pierce for pellets
        color: this.config.color,
        ownerId: (this.owner as any).playerId || 0
      };

      onProjectileCreate(projectileData);
    }
  }

  updateFireRate(multiplier: number): void {
    this.fireRateMultiplier = multiplier;
  }

  updateDamage(multiplier: number): void {
    this.damageMultiplier = multiplier;
  }

  addPierce(amount: number): void {
    this.pierceBonus += amount;
  }
}
