import Phaser from 'phaser';
import { WeaponDefinition, WeaponInstance, FirePattern, DamageType, SynergyTag } from '../types/WeaponTypes';
import weaponsData from '../data/weapons.json';

/**
 * WeaponManager - Handles weapon instantiation, stat calculation, and firing
 * 
 * Responsibilities:
 * - Load weapon definitions from JSON
 * - Create weapon instances for players
 * - Calculate effective stats with upgrades and buffs
 * - Handle firing patterns and projectile creation
 * - Manage weapon behaviors
 */
export class WeaponManager {
  private scene: Phaser.Scene;
  private definitions: Map<string, WeaponDefinition> = new Map();
  private instances: Map<string, WeaponInstance> = new Map();
  
  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.loadDefinitions();
  }
  
  /**
   * Load all weapon definitions from JSON
   */
  private loadDefinitions(): void {
    const data = weaponsData as { weapons: Record<string, any> };
    
    for (const [id, def] of Object.entries(data.weapons)) {
      const definition: WeaponDefinition = {
        id: def.id,
        name: def.name,
        description: def.description,
        icon: def.icon,
        
        baseDamage: def.baseDamage,
        baseFireRate: def.baseFireRate,
        baseRange: def.baseRange,
        basePierce: def.basePierce,
        baseProjectileSpeed: def.baseProjectileSpeed,
        baseProjectileSize: def.baseProjectileSize,
        
        firePattern: def.firePattern as FirePattern,
        damageType: def.damageType as DamageType,
        
        projectileColor: parseInt(def.projectileColor, 16),
        muzzleFlash: def.muzzleFlash,
        trailEffect: def.trailEffect,
        
        synergyTags: def.synergyTags as SynergyTag[],
        scalingRules: def.scalingRules || [],
        behaviors: def.behaviors || [],
        
        unlockedByDefault: def.unlockedByDefault ?? true,
        unlockCondition: def.unlockCondition
      };
      
      this.definitions.set(id, definition);
    }
    
    console.log(`[WeaponManager] Loaded ${this.definitions.size} weapon definitions`);
  }
  
  /**
   * Get a weapon definition by ID
   */
  getDefinition(weaponId: string): WeaponDefinition | undefined {
    return this.definitions.get(weaponId);
  }
  
  /**
   * Get all available weapon definitions
   */
  getAllDefinitions(): WeaponDefinition[] {
    return Array.from(this.definitions.values());
  }
  
  /**
   * Get unlocked weapons for weapon selection
   */
  getUnlockedWeapons(unlockedIds?: string[]): WeaponDefinition[] {
    return this.getAllDefinitions().filter(def => {
      if (def.unlockedByDefault) return true;
      if (unlockedIds && unlockedIds.includes(def.id)) return true;
      return false;
    });
  }
  
  /**
   * Create a weapon instance for a player
   */
  createInstance(weaponId: string, ownerId: string): WeaponInstance | null {
    const definition = this.definitions.get(weaponId);
    if (!definition) {
      console.error(`[WeaponManager] Unknown weapon ID: ${weaponId}`);
      return null;
    }
    
    const instance: WeaponInstance = {
      definitionId: weaponId,
      ownerId,
      level: 1,
      experience: 0,
      
      currentStats: {
        damage: definition.baseDamage,
        fireRate: definition.baseFireRate,
        range: definition.baseRange,
        pierce: definition.basePierce,
        projectileSpeed: definition.baseProjectileSpeed,
        projectileSize: definition.baseProjectileSize,
        critChance: 0.05,
        critDamage: 1.5,
        lifesteal: 0,
        aoeRadius: 0,
        chainCount: 0,
        dotDamage: 0,
        dotDuration: 0,
        slowPotency: 0
      },
      
      activeBehaviors: [...definition.behaviors],
      activeBuffs: [],
      currentTags: new Set(definition.synergyTags),
      lastFiredAt: 0
    };
    
    const instanceKey = `${ownerId}_${weaponId}`;
    this.instances.set(instanceKey, instance);
    
    console.log(`[WeaponManager] Created weapon instance: ${definition.name} for ${ownerId}`);
    return instance;
  }
  
  /**
   * Get a weapon instance
   */
  getInstance(ownerId: string, weaponId: string): WeaponInstance | undefined {
    return this.instances.get(`${ownerId}_${weaponId}`);
  }
  
  /**
   * Calculate effective stats with all modifiers applied
   */
  calculateEffectiveStats(instance: WeaponInstance, upgradeModifiers: StatModifier[] = []): WeaponStats {
    const definition = this.definitions.get(instance.definitionId);
    if (!definition) {
      return instance.currentStats;
    }
    
    // Start with base stats
    const stats = { ...instance.currentStats };
    
    // Apply upgrade modifiers
    for (const modifier of upgradeModifiers) {
      this.applyModifier(stats, modifier);
    }
    
    // Apply active buffs
    const now = Date.now();
    for (const buff of instance.activeBuffs) {
      if (buff.expiresAt > now) {
        this.applyModifier(stats, {
          stat: buff.stat,
          type: buff.type,
          value: buff.value
        });
      }
    }
    
    // Apply soft caps
    for (const rule of definition.scalingRules) {
      const statValue = stats[rule.stat as keyof WeaponStats];
      if (typeof statValue === 'number' && rule.softCap) {
        if (statValue > rule.softCap) {
          const excess = statValue - rule.softCap;
          const diminishedExcess = excess * 0.5; // 50% effectiveness past soft cap
          (stats as any)[rule.stat] = rule.softCap + diminishedExcess;
          
          // Hard cap
          if (rule.hardCap && (stats as any)[rule.stat] > rule.hardCap) {
            (stats as any)[rule.stat] = rule.hardCap;
          }
        }
      }
    }
    
    return stats;
  }
  
  /**
   * Apply a single stat modifier
   */
  private applyModifier(stats: WeaponStats, modifier: StatModifier): void {
    const currentValue = stats[modifier.stat as keyof WeaponStats];
    if (typeof currentValue !== 'number') return;
    
    switch (modifier.type) {
      case 'add':
        (stats as any)[modifier.stat] = currentValue + modifier.value;
        break;
      case 'multiply':
        (stats as any)[modifier.stat] = currentValue * modifier.value;
        break;
      case 'set':
        (stats as any)[modifier.stat] = modifier.value;
        break;
    }
  }
  
  /**
   * Add a temporary buff to a weapon instance
   */
  addBuff(ownerId: string, weaponId: string, buff: WeaponBuff): void {
    const instance = this.getInstance(ownerId, weaponId);
    if (!instance) return;
    
    // Check for existing buff of same type
    const existingIndex = instance.activeBuffs.findIndex(
      b => b.stat === buff.stat && b.source === buff.source
    );
    
    if (existingIndex >= 0) {
      // Refresh duration
      instance.activeBuffs[existingIndex].expiresAt = buff.expiresAt;
    } else {
      instance.activeBuffs.push(buff);
    }
  }
  
  /**
   * Check if weapon can fire (cooldown check)
   */
  canFire(instance: WeaponInstance, effectiveStats: WeaponStats): boolean {
    const now = Date.now();
    const cooldownMs = 1000 / effectiveStats.fireRate;
    return now - instance.lastFiredAt >= cooldownMs;
  }
  
  /**
   * Mark weapon as fired
   */
  markFired(instance: WeaponInstance): void {
    instance.lastFiredAt = Date.now();
  }
  
  /**
   * Clean up expired buffs
   */
  cleanupBuffs(): void {
    const now = Date.now();
    for (const instance of this.instances.values()) {
      instance.activeBuffs = instance.activeBuffs.filter(buff => buff.expiresAt > now);
    }
  }
  
  /**
   * Update loop - call from scene update
   */
  update(time: number, delta: number): void {
    // Periodic buff cleanup
    if (Math.floor(time / 1000) !== Math.floor((time - delta) / 1000)) {
      this.cleanupBuffs();
    }
  }
  
  /**
   * Get fire pattern handler
   */
  getFirePatternConfig(pattern: FirePattern): FirePatternConfig {
    switch (pattern) {
      case 'projectile':
        return { projectileCount: 1, spread: 0, burstCount: 1, burstDelay: 0 };
      case 'spread':
        return { projectileCount: 5, spread: 30, burstCount: 1, burstDelay: 0 };
      case 'burst':
        return { projectileCount: 1, spread: 5, burstCount: 3, burstDelay: 100 };
      case 'beam':
        return { projectileCount: 1, spread: 0, burstCount: 1, burstDelay: 0, isBeam: true };
      case 'aura':
        return { projectileCount: 0, spread: 360, burstCount: 1, burstDelay: 0, isAura: true };
      case 'chain':
        return { projectileCount: 1, spread: 0, burstCount: 1, burstDelay: 0, isChain: true };
      case 'pulse':
        return { projectileCount: 8, spread: 360, burstCount: 1, burstDelay: 0 };
      case 'orbital':
        return { projectileCount: 3, spread: 360, burstCount: 1, burstDelay: 0, isOrbital: true };
      case 'mine':
        return { projectileCount: 1, spread: 0, burstCount: 1, burstDelay: 0, isMine: true };
      case 'summon':
        return { projectileCount: 1, spread: 0, burstCount: 1, burstDelay: 0, isSummon: true };
      default:
        return { projectileCount: 1, spread: 0, burstCount: 1, burstDelay: 0 };
    }
  }
  
  /**
   * Destroy and cleanup
   */
  destroy(): void {
    this.definitions.clear();
    this.instances.clear();
  }
}

// Supporting types
export interface WeaponStats {
  damage: number;
  fireRate: number;
  range: number;
  pierce: number;
  projectileSpeed: number;
  projectileSize: number;
  critChance: number;
  critDamage: number;
  lifesteal: number;
  aoeRadius: number;
  chainCount: number;
  dotDamage: number;
  dotDuration: number;
  slowPotency: number;
}

export interface StatModifier {
  stat: string;
  type: 'add' | 'multiply' | 'set';
  value: number;
}

export interface WeaponBuff {
  stat: string;
  type: 'add' | 'multiply';
  value: number;
  expiresAt: number;
  source: string;
}

export interface FirePatternConfig {
  projectileCount: number;
  spread: number;
  burstCount: number;
  burstDelay: number;
  isBeam?: boolean;
  isAura?: boolean;
  isChain?: boolean;
  isOrbital?: boolean;
  isMine?: boolean;
  isSummon?: boolean;
}
