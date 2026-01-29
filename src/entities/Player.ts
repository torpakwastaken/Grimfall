import Phaser from 'phaser';
import { Health } from '@/components/Health';
import { Weapon } from '@/components/Weapon';
import { BuffContainer } from '@/components/BuffContainer';
import { PlayerConfig, PlayerStats, WeaponConfig } from '@/types/GameTypes';
import { createPlayerSprite, PALETTE } from '@/systems/AnimationSystem';
import balanceConfig from '@/data/balance.json';

// Precomputed soft cap lookup tables (0-200% in 1% increments)
// Avoids expensive Math.exp() calls every frame
const SOFT_CAP_TABLES: Map<string, number[]> = new Map();

function buildSoftCapTable(softCap: number, hardCap: number): number[] {
  const table: number[] = [];
  for (let i = 0; i <= 200; i++) {
    const raw = i / 100; // 0.00 to 2.00
    const effective = softCap * (1 - Math.exp(-raw / softCap));
    table.push(Math.min(effective, hardCap));
  }
  return table;
}

// Build tables once at module load
function initSoftCapTables() {
  const caps = balanceConfig.statCaps.softCaps;
  SOFT_CAP_TABLES.set('fireRate', buildSoftCapTable(caps.fireRate.cap, caps.fireRate.hardCap));
  SOFT_CAP_TABLES.set('moveSpeed', buildSoftCapTable(caps.moveSpeed.cap, caps.moveSpeed.hardCap));
  SOFT_CAP_TABLES.set('damageReduction', buildSoftCapTable(caps.damageReduction.cap, caps.damageReduction.hardCap));
  SOFT_CAP_TABLES.set('critChance', buildSoftCapTable(caps.critChance.cap, caps.critChance.hardCap));
  SOFT_CAP_TABLES.set('lifeSteal', buildSoftCapTable(caps.lifeSteal.cap, caps.lifeSteal.hardCap));
}
initSoftCapTables();

export class Player extends Phaser.Physics.Arcade.Sprite {
  public playerId: number;
  public health: Health;
  public weapon: Weapon;
  public heavyWeapon?: Weapon;
  public buffs: BuffContainer;
  public stats: PlayerStats;
  
  // Raw stats before caps (for upgrade stacking)
  private rawStats: Partial<PlayerStats> = {};
  // Base stats at game start (for soft cap calculations)
  private baseStats!: PlayerStats;
  
  private directionIndicator: Phaser.GameObjects.Triangle;
  private hpBar: Phaser.GameObjects.Graphics;
  private keys: Map<string, Phaser.Input.Keyboard.Key>;
  
  public isDead: boolean = false;
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
    // Create visual representation using palette-based sprite with outline
    const textureKey = createPlayerSprite(scene, config.id, 32);

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
    
    // Store base stats for soft cap calculations
    this.baseStats = { ...this.stats };

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

    // Physics - ensure body exists
    scene.physics.add.existing(this);
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setCircle(15);
      body.setCollideWorldBounds(true);
      body.setBounce(0.2, 0.2);
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

  // Apply soft cap using precomputed lookup table (O(1) instead of Math.exp)
  private applySoftCapFromTable(stat: string, raw: number): number {
    const table = SOFT_CAP_TABLES.get(stat);
    if (!table) return raw; // Fallback if no table
    
    // Clamp to table range (0-200%)
    const index = Math.min(Math.max(Math.round(raw * 100), 0), 200);
    return table[index];
  }

  private applyStatUpgrade(effect: any): void {
    const softCaps = balanceConfig.statCaps.softCaps;
    const hardCaps = balanceConfig.statCaps.hardCaps;

    if (effect.stat === 'maxHp') {
      // Max HP has no soft cap, just add directly
      this.stats.maxHp += effect.value;
      this.health.setMax(this.stats.maxHp);
      this.health.heal(effect.value); // Heal when max HP increases
    } else if (effect.stat === 'moveSpeed') {
      // Track raw bonus and apply soft cap via lookup
      this.rawStats.moveSpeed = (this.rawStats.moveSpeed || 0) + effect.value;
      const cappedMoveSpeed = this.applySoftCapFromTable('moveSpeed', this.rawStats.moveSpeed || 0);
      // Apply as multiplier from base (assuming base is 1.0 multiplier)
      this.stats.moveSpeed = this.baseStats.moveSpeed * (1 + cappedMoveSpeed);
    } else if (effect.stat === 'fireRate') {
      // Track raw bonus and apply soft cap via lookup
      this.rawStats.fireRate = (this.rawStats.fireRate || 0) + effect.value;
      const cappedFireRate = this.applySoftCapFromTable('fireRate', this.rawStats.fireRate || 0);
      // Apply as multiplier from base
      this.stats.fireRate = this.baseStats.fireRate * (1 + cappedFireRate);
    } else if (effect.stat === 'damageReduction') {
      // Track raw value and apply soft cap via lookup
      this.rawStats.damageReduction = (this.rawStats.damageReduction || 0) + effect.value;
      this.stats.damageReduction = this.applySoftCapFromTable('damageReduction', this.rawStats.damageReduction || 0);
    } else if (effect.stat === 'critChance') {
      this.rawStats.critChance = (this.rawStats.critChance || 0) + effect.value;
      this.stats.critChance = this.applySoftCapFromTable('critChance', this.rawStats.critChance || 0);
    } else if (effect.stat === 'lifeSteal') {
      this.rawStats.lifeSteal = (this.rawStats.lifeSteal || 0) + effect.value;
      this.stats.lifeSteal = this.applySoftCapFromTable('lifeSteal', this.rawStats.lifeSteal || 0);
    } else if (effect.stat === 'projectileCount') {
      // Hard cap only
      this.stats.projectileCount = Math.min(
        (this.stats.projectileCount || 1) + effect.value,
        hardCaps.projectileCount
      );
    } else if (effect.stat === 'pierce') {
      this.stats.pierce = Math.min(
        (this.stats.pierce || 0) + effect.value,
        hardCaps.pierce
      );
    }

    if (effect.secondaryStat && effect.secondaryValue) {
      // Recursively apply secondary stat with same capping logic
      this.applyStatUpgrade({ stat: effect.secondaryStat, value: effect.secondaryValue });
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
