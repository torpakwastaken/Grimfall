import Phaser from 'phaser';
import { Health } from '@/components/Health';
import { Weapon } from '@/components/Weapon';
import { BuffContainer } from '@/components/BuffContainer';
import { PlayerConfig, PlayerStats, WeaponConfig } from '@/types/GameTypes';

export class Player extends Phaser.Physics.Arcade.Sprite {
  public playerId: number;
  public health: Health;
  public weapon: Weapon;
  public heavyWeapon?: Weapon;
  public buffs: BuffContainer;
  public stats: PlayerStats;
  
  private directionIndicator: Phaser.GameObjects.Triangle;
  private hpBar: Phaser.GameObjects.Graphics;
  private keys: Map<string, Phaser.Input.Keyboard.Key>;
  
  private isDead: boolean = false;
  private reviveTime: number = 0;
  private invulnerable: boolean = false;
  private invulnerableUntil: number = 0;

  // Upgrades
  public hasMarkerRounds: boolean = false;
  public hasDetonateShot: boolean = false;
  public markedEnemies: Set<any> = new Set();

  constructor(
    scene: Phaser.Scene,
    config: PlayerConfig,
    weaponConfig: WeaponConfig
  ) {
    // Create visual representation as a circle texture first
    const graphics = scene.add.graphics();
    graphics.fillStyle(config.color);
    graphics.fillCircle(15, 15, 15);
    const textureKey = 'player_' + config.id;
    graphics.generateTexture(textureKey, 30, 30);
    graphics.destroy();

    // Now create the sprite with the texture
    super(scene, config.startX, config.startY, textureKey);
    
    this.playerId = config.id;
    
    // Initialize stats
    this.stats = {
      maxHp: 100,
      currentHp: 100,
      moveSpeed: 150,
      fireRate: 1,
      damage: 1,
      critChance: 0.1,
      critMultiplier: 2,
      damageReduction: 0,
      ammo: 5,
      maxAmmo: 5
    };

    // Direction indicator (wedge shape)
    this.directionIndicator = scene.add.triangle(
      0, -10, 
      0, 0, 
      -5, 10, 
      5, 10,
      config.color,
      0.7
    );

    // HP bar
    this.hpBar = scene.add.graphics();

    // Components
    this.health = new Health(
      this,
      this.stats.maxHp,
      () => this.onDeath(),
      (amount) => this.onDamage(amount)
    );

    this.weapon = new Weapon(scene, this, weaponConfig);
    this.buffs = new BuffContainer(scene);

    // Update HP bar after health component is initialized
    this.updateHPBar();

    // Input setup
    this.keys = new Map();
    Object.entries(config.keys).forEach(([action, key]) => {
      this.keys.set(action, scene.input.keyboard!.addKey(key));
    });

    // Physics
    if (this.body) {
      this.body.setCircle(15);
      this.body.setCollideWorldBounds(true);
      this.body.setBounce(0.2, 0.2);
    } else {
      // Ensure physics body exists
      scene.physics.add.existing(this);
      (this.body as Phaser.Physics.Arcade.Body).setCircle(15);
      (this.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);
      (this.body as Phaser.Physics.Arcade.Body).setBounce(0.2, 0.2);
    }
  }

  update(time: number, delta: number): void {
    if (this.isDead) {
      this.handleRevive(time);
      return;
    }

    // Update invulnerability
    if (this.invulnerable && time > this.invulnerableUntil) {
      this.invulnerable = false;
      this.setAlpha(1);
    }

    // Movement
    this.handleMovement(delta);

    // Auto-attack (always toward nearest enemy)
    this.handleAutoAttack();

    // Heavy weapon (manual input)
    this.handleHeavyWeapon();

    // Update HP bar and direction indicator positions
    this.updateHPBar();
    this.directionIndicator.setPosition(this.x, this.y - 10);
    
    // Update buffs
    this.buffs.update();

    // Apply stat buffs
    this.applyBuffs();
  }

  private handleMovement(delta: number): void {
    const velocity = { x: 0, y: 0 };
    const speed = this.stats.moveSpeed;

    if (this.keys.get('up')?.isDown) velocity.y -= 1;
    if (this.keys.get('down')?.isDown) velocity.y += 1;
    if (this.keys.get('left')?.isDown) velocity.x -= 1;
    if (this.keys.get('right')?.isDown) velocity.x += 1;

    // Normalize diagonal movement
    if (velocity.x !== 0 && velocity.y !== 0) {
      velocity.x *= 0.707;
      velocity.y *= 0.707;
    }

    const physicsBody = this.body as any;
    physicsBody.setVelocity(velocity.x * speed, velocity.y * speed);

    // Update direction indicator
    if (velocity.x !== 0 || velocity.y !== 0) {
      const angle = Math.atan2(velocity.y, velocity.x);
      this.directionIndicator.setRotation(angle + Math.PI / 2);
    }
  }

  private handleAutoAttack(): void {
    const nearestEnemy = this.findNearestEnemy();
    if (nearestEnemy) {
      this.weapon.fire(
        nearestEnemy.x,
        nearestEnemy.y,
        (projectileData: any) => this.scene.events.emit('createProjectile', projectileData)
      );
    }
  }

  private handleHeavyWeapon(): void {
    if (!this.heavyWeapon || this.stats.ammo <= 0) return;

    const heavyKey = this.keys.get('heavy');
    if (heavyKey?.isDown) {
      const nearestEnemy = this.findNearestEnemy();
      if (nearestEnemy) {
        const fired = this.heavyWeapon.fire(
          nearestEnemy.x,
          nearestEnemy.y,
          (projectileData: any) => {
            projectileData.heavy = true;
            this.scene.events.emit('createProjectile', projectileData);
          }
        );
        if (fired) {
          this.stats.ammo--;
        }
      }
    }
  }

  private findNearestEnemy(): any {
    // This will be populated by the combat system
    const enemies = (this.scene as any).enemies?.getChildren() || [];
    if (enemies.length === 0) return null;

    let nearest: any = null;
    let minDist = Infinity;

    for (const enemy of enemies) {
      if (!enemy.active || !(enemy as any).health?.isAlive) continue;
      
      const dist = Phaser.Math.Distance.Between(this.x, this.y, enemy.x, enemy.y);
      if (dist < minDist) {
        minDist = dist;
        nearest = enemy;
      }
    }

    return nearest;
  }

  private applyBuffs(): void {
    // Reset to base stats
    const fireRateBuff = 1 + this.buffs.getTotalBuffValue('fireRate');
    const damageReduction = this.buffs.getTotalBuffValue('damageReduction');
    
    this.weapon.updateFireRate(fireRateBuff * this.stats.fireRate);
    this.health.setDamageReduction(this.stats.damageReduction + damageReduction);
  }

  takeDamage(amount: number): void {
    if (this.isDead || this.invulnerable) return;
    
    this.health.damage(amount);
    this.stats.currentHp = this.health.current;

    // Visual feedback
    this.scene.cameras.main.shake(100, 0.005);
    this.setTint(0xff0000);
    this.scene.time.delayedCall(100, () => {
      this.clearTint();
    });
  }

  private onDeath(): void {
    this.isDead = true;
    this.reviveTime = this.scene.time.now + 8000; // 8 second revive timer
    this.setAlpha(0.3);
    this.scene.events.emit('playerDied', this.playerId);
  }

  private onDamage(amount: number): void {
    // Damage number feedback could be added here
  }

  private handleRevive(time: number): void {
    if (time >= this.reviveTime) {
      this.revive();
    }
  }

  revive(): void {
    this.isDead = false;
    this.health.revive(0.5);
    this.stats.currentHp = this.health.current;
    this.setAlpha(1);
    
    // 3 seconds invulnerability
    this.invulnerable = true;
    this.invulnerableUntil = this.scene.time.now + 3000;
    
    // Visual feedback
    this.scene.tweens.add({
      targets: this,
      alpha: { from: 0.5, to: 1 },
      duration: 200,
      repeat: 15,
      yoyo: true
    });

    this.scene.events.emit('playerRevived', this.playerId);
  }

  addXP(amount: number): void {
    this.scene.events.emit('addXP', amount);
  }

  applyUpgrade(upgradeId: string, upgradeData: any): void {
    const effect = upgradeData.effect;

    switch (effect.type) {
      case 'stat':
        this.applyStatUpgrade(effect);
        break;
      case 'onHit':
        if (upgradeId === 'marker_rounds') {
          this.hasMarkerRounds = true;
        }
        break;
      case 'onCrit':
        if (upgradeId === 'detonate_shot') {
          this.hasDetonateShot = true;
        }
        break;
    }
  }

  private applyStatUpgrade(effect: any): void {
    if (effect.stat === 'maxHp') {
      this.stats.maxHp += effect.value;
      this.health.setMax(this.stats.maxHp);
      this.health.heal(effect.value); // Heal when max HP increases
    } else if (effect.stat === 'moveSpeed') {
      this.stats.moveSpeed *= (1 + effect.value);
    } else if (effect.stat === 'fireRate') {
      this.stats.fireRate *= (1 + effect.value);
    } else if (effect.stat === 'damageReduction') {
      this.stats.damageReduction += effect.value;
    }

    if (effect.secondaryStat && effect.secondaryValue) {
      if (effect.secondaryStat === 'damageReduction') {
        this.stats.damageReduction += effect.secondaryValue;
      }
    }
  }

  private updateHPBar(): void {
    this.hpBar.clear();
    
    const barWidth = 40;
    const barHeight = 4;
    const x = this.x - barWidth / 2;
    const y = this.y - 30;

    // Background
    this.hpBar.fillStyle(0x000000, 0.5);
    this.hpBar.fillRect(x, y, barWidth, barHeight);

    // Current HP
    const hpPercentage = this.health.percentage;
    const color = hpPercentage > 0.5 ? 0x00ff00 : (hpPercentage > 0.25 ? 0xffff00 : 0xff0000);
    this.hpBar.fillStyle(color);
    this.hpBar.fillRect(x, y, barWidth * hpPercentage, barHeight);
  }

  destroy(fromScene?: boolean): void {
    this.keys.clear();
    this.buffs.clearAll();
    super.destroy(fromScene);
  }
}
