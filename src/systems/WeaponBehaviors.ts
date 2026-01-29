import Phaser from 'phaser';
import { WeaponStats } from './WeaponManager';
import { DamageType } from '../types/WeaponTypes';

/**
 * WeaponBehaviors - Modular behavior components for weapons
 * 
 * Each behavior is a pure function that can be composed with others.
 * Behaviors modify projectiles, trigger effects, or process hits.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface BehaviorContext {
  scene: Phaser.Scene;
  ownerId: string;
  weaponStats: WeaponStats;
  damageType: DamageType;
  projectile?: Phaser.GameObjects.GameObject;
  target?: Phaser.GameObjects.GameObject;
  hitPosition?: { x: number; y: number };
  damage?: number;
}

export interface BehaviorParams {
  [key: string]: any;
}

export type BehaviorFunction = (context: BehaviorContext, params: BehaviorParams) => void;

// ============================================================================
// BEHAVIOR REGISTRY
// ============================================================================

const behaviorRegistry: Map<string, BehaviorFunction> = new Map();

/**
 * Register a behavior function
 */
export function registerBehavior(name: string, fn: BehaviorFunction): void {
  behaviorRegistry.set(name, fn);
}

/**
 * Get a behavior function by name
 */
export function getBehavior(name: string): BehaviorFunction | undefined {
  return behaviorRegistry.get(name);
}

/**
 * Execute a behavior by name
 */
export function executeBehavior(name: string, context: BehaviorContext, params: BehaviorParams = {}): void {
  const behavior = behaviorRegistry.get(name);
  if (behavior) {
    behavior(context, params);
  } else {
    console.warn(`[WeaponBehaviors] Unknown behavior: ${name}`);
  }
}

// ============================================================================
// STATUS EFFECT BEHAVIORS
// ============================================================================

/**
 * Apply burn (DoT fire damage)
 */
registerBehavior('apply_burn', (context, params) => {
  if (!context.target) return;
  
  const duration = params.duration || 3000;
  const tickDamage = params.tickDamage || context.weaponStats.dotDamage || 5;
  const tickInterval = params.tickInterval || 500;
  
  context.scene.events.emit('status:apply', {
    targetId: getEntityId(context.target),
    status: 'burning',
    appliedBy: context.ownerId,
    duration,
    tickDamage,
    tickInterval,
    damageType: 'fire'
  });
});

/**
 * Spread burn on kill
 */
registerBehavior('burn_spread_on_kill', (context, params) => {
  if (!context.hitPosition) return;
  
  const range = params.range || 120;
  const count = params.count || 3;
  
  context.scene.events.emit('status:spread', {
    status: 'burning',
    position: context.hitPosition,
    range,
    maxTargets: count,
    appliedBy: context.ownerId
  });
});

/**
 * Apply slow effect
 */
registerBehavior('apply_slow', (context, params) => {
  if (!context.target) return;
  
  const slowPercent = params.slowPercent || (0.3 * (1 + context.weaponStats.slowPotency));
  const duration = params.duration || 2000;
  
  context.scene.events.emit('status:apply', {
    targetId: getEntityId(context.target),
    status: 'slowed',
    appliedBy: context.ownerId,
    duration,
    slowPercent
  });
});

/**
 * Freeze on reaching slow stacks
 */
registerBehavior('freeze_on_stack', (context, params) => {
  if (!context.target) return;
  
  const requiredStacks = params.requiredStacks || 3;
  const freezeDuration = params.freezeDuration || 1500;
  
  context.scene.events.emit('status:check_stack_freeze', {
    targetId: getEntityId(context.target),
    requiredStacks,
    freezeDuration,
    appliedBy: context.ownerId
  });
});

/**
 * Shatter frozen enemies on death
 */
registerBehavior('shatter_on_death', (context, params) => {
  if (!context.hitPosition) return;
  
  const radius = params.radius || 100;
  const damageMultiplier = params.damageMultiplier || 2.0;
  
  context.scene.events.emit('behavior:shatter', {
    position: context.hitPosition,
    radius,
    damage: (context.damage || 0) * damageMultiplier,
    appliedBy: context.ownerId,
    condition: 'frozen'
  });
});

/**
 * Apply shock mark
 */
registerBehavior('apply_shock_mark', (context, params) => {
  if (!context.target) return;
  
  const duration = params.duration || 4000;
  
  context.scene.events.emit('status:apply', {
    targetId: getEntityId(context.target),
    status: 'shocked',
    appliedBy: context.ownerId,
    duration
  });
  
  context.scene.events.emit('status:apply', {
    targetId: getEntityId(context.target),
    status: 'marked',
    appliedBy: context.ownerId,
    duration
  });
});

/**
 * Apply poison with stacking
 */
registerBehavior('stacking_poison', (context, params) => {
  if (!context.target) return;
  
  const maxStacks = params.maxStacks || 5;
  const durationPerStack = params.durationPerStack || 2000;
  const damagePerStack = params.damagePerStack || 2;
  
  context.scene.events.emit('status:apply_stacking', {
    targetId: getEntityId(context.target),
    status: 'poisoned',
    appliedBy: context.ownerId,
    maxStacks,
    durationPerStack,
    damagePerStack
  });
});

/**
 * Weaken when at max poison stacks
 */
registerBehavior('weaken_on_max_stacks', (context, params) => {
  if (!context.target) return;
  
  const weakenDuration = params.weakenDuration || 3000;
  const damageAmp = params.damageAmp || 0.25;
  
  context.scene.events.emit('status:check_max_stacks_weaken', {
    targetId: getEntityId(context.target),
    status: 'poisoned',
    weakenDuration,
    damageAmp
  });
});

// ============================================================================
// PROJECTILE BEHAVIORS
// ============================================================================

/**
 * Ricochet between enemies
 */
registerBehavior('ricochet', (context, params) => {
  if (!context.projectile || !context.hitPosition) return;
  
  const bounceCount = params.count || 3;
  const damageRetention = params.damageRetention || 0.8;
  const maxRange = params.maxRange || 300;
  
  context.scene.events.emit('projectile:ricochet', {
    fromPosition: context.hitPosition,
    remainingBounces: bounceCount,
    damageRetention,
    maxRange,
    currentDamage: context.damage,
    ownerId: context.ownerId,
    damageType: context.damageType,
    excludeTarget: context.target
  });
});

/**
 * Bonus bounces near walls
 */
registerBehavior('wall_bounce_bonus', (context, params) => {
  if (!context.hitPosition) return;
  
  const wallCheckRange = params.wallCheckRange || 100;
  const bonusBounces = params.bonusBounces || 2;
  
  // Check proximity to arena walls
  const bounds = context.scene.physics.world.bounds;
  const pos = context.hitPosition;
  
  const nearWall = 
    pos.x < bounds.x + wallCheckRange ||
    pos.x > bounds.width - wallCheckRange ||
    pos.y < bounds.y + wallCheckRange ||
    pos.y > bounds.height - wallCheckRange;
  
  if (nearWall) {
    context.scene.events.emit('projectile:bonus_bounces', {
      projectile: context.projectile,
      bonusBounces
    });
  }
});

/**
 * Chain to marked targets
 */
registerBehavior('chain_to_marked', (context, params) => {
  if (!context.hitPosition) return;
  
  const chainRange = params.range || 150;
  const chainCount = params.count || (context.weaponStats.chainCount || 2);
  const damageMultiplier = params.damageMultiplier || 0.6;
  
  context.scene.events.emit('projectile:chain', {
    fromPosition: context.hitPosition,
    chainCount,
    chainRange,
    damageMultiplier,
    currentDamage: context.damage,
    ownerId: context.ownerId,
    damageType: context.damageType,
    preferStatus: 'marked'
  });
});

/**
 * Explosion on marked targets
 */
registerBehavior('marked_explosion', (context, params) => {
  if (!context.target || !context.hitPosition) return;
  
  const radius = params.radius || 80;
  const damageMultiplier = params.damageMultiplier || 1.5;
  
  context.scene.events.emit('behavior:conditional_explosion', {
    position: context.hitPosition,
    radius,
    damage: (context.damage || 0) * damageMultiplier,
    condition: 'marked',
    targetId: getEntityId(context.target),
    consumeStatus: params.consumeStatus || true
  });
});

/**
 * Split projectile on hit
 */
registerBehavior('split_on_hit', (context, params) => {
  if (!context.hitPosition) return;
  
  const count = params.count || 2;
  const damageMultiplier = params.damageMultiplier || 0.5;
  const spreadAngle = params.spreadAngle || 45;
  
  context.scene.events.emit('projectile:split', {
    position: context.hitPosition,
    count,
    damage: (context.damage || 0) * damageMultiplier,
    spreadAngle,
    ownerId: context.ownerId,
    damageType: context.damageType,
    speed: context.weaponStats.projectileSpeed * 0.8
  });
});

/**
 * Homing projectiles
 */
registerBehavior('homing', (context, params) => {
  if (!context.projectile) return;
  
  const turnRate = params.turnRate || 2.0;
  const seekRange = params.seekRange || 150;
  
  // Store homing data on projectile
  (context.projectile as any).homingData = {
    turnRate,
    seekRange,
    enabled: true
  };
});

// ============================================================================
// AoE BEHAVIORS
// ============================================================================

/**
 * Aura pulse damage
 */
registerBehavior('aura_pulse', (context, params) => {
  const radius = params.radius || context.weaponStats.range;
  const tickInterval = params.tickInterval || 250;
  
  context.scene.events.emit('aura:pulse', {
    ownerId: context.ownerId,
    radius,
    damage: context.weaponStats.damage,
    damageType: context.damageType,
    tickInterval
  });
});

/**
 * Create lingering damage zone
 */
registerBehavior('create_zone_on_hit', (context, params) => {
  if (!context.hitPosition) return;
  
  const duration = params.duration || 2000;
  const radius = params.radius || 40;
  const damageMultiplier = params.damageMultiplier || 0.2;
  
  context.scene.events.emit('zone:create', {
    position: context.hitPosition,
    radius,
    duration,
    damagePerTick: (context.damage || 0) * damageMultiplier,
    tickInterval: 500,
    ownerId: context.ownerId,
    damageType: context.damageType
  });
});

/**
 * Lingering poison cloud
 */
registerBehavior('lingering_cloud', (context, params) => {
  if (!context.hitPosition) return;
  
  const duration = params.duration || 4000;
  const radius = params.radius || 60;
  
  context.scene.events.emit('zone:create', {
    position: context.hitPosition,
    radius,
    duration,
    damagePerTick: context.weaponStats.dotDamage || 3,
    tickInterval: 500,
    ownerId: context.ownerId,
    damageType: 'poison',
    appliesStatus: 'poisoned',
    visual: 'poison_cloud'
  });
});

/**
 * Explode on hit
 */
registerBehavior('explode_on_hit', (context, params) => {
  if (!context.hitPosition) return;
  
  const radius = params.radius || 60;
  const damageMultiplier = params.damageMultiplier || 0.4;
  
  context.scene.events.emit('explosion:create', {
    position: context.hitPosition,
    radius,
    damage: (context.damage || 0) * damageMultiplier,
    ownerId: context.ownerId,
    damageType: context.damageType
  });
});

// ============================================================================
// SPECIAL BEHAVIORS
// ============================================================================

/**
 * Lifesteal
 */
registerBehavior('lifesteal', (context, params) => {
  const lifestealPercent = params.percent || context.weaponStats.lifesteal || 0.05;
  const healAmount = (context.damage || 0) * lifestealPercent;
  
  if (healAmount > 0) {
    context.scene.events.emit('player:heal', {
      playerId: context.ownerId,
      amount: healAmount,
      source: 'lifesteal'
    });
  }
});

/**
 * Bonus lifesteal at low HP
 */
registerBehavior('low_hp_bonus', (context, params) => {
  const hpThreshold = params.hpThreshold || 0.3;
  const bonusMultiplier = params.bonusMultiplier || 2.0;
  
  context.scene.events.emit('player:check_low_hp_bonus', {
    playerId: context.ownerId,
    hpThreshold,
    bonusMultiplier,
    stat: 'lifesteal'
  });
});

/**
 * Percent HP damage
 */
registerBehavior('percent_hp_damage', (context, params) => {
  if (!context.target) return;
  
  const percentDamage = params.percent || 0.02;
  
  context.scene.events.emit('damage:percent_hp', {
    targetId: getEntityId(context.target),
    percent: percentDamage,
    minDamage: context.weaponStats.damage,
    maxDamage: params.maxDamage || 50,
    ownerId: context.ownerId
  });
});

/**
 * Execute low HP enemies
 */
registerBehavior('execute_low_hp', (context, params) => {
  if (!context.target) return;
  
  const threshold = params.threshold || 0.15;
  
  context.scene.events.emit('damage:execute_check', {
    targetId: getEntityId(context.target),
    threshold,
    ownerId: context.ownerId
  });
});

/**
 * Orbital rotation
 */
registerBehavior('orbital_rotation', (context, params) => {
  const orbitSpeed = params.orbitSpeed || 2;
  const orbitDistance = params.orbitDistance || context.weaponStats.range;
  
  context.scene.events.emit('orbital:configure', {
    ownerId: context.ownerId,
    orbitSpeed,
    orbitDistance,
    projectileCount: params.projectileCount || 3
  });
});

/**
 * Continuous beam
 */
registerBehavior('continuous_beam', (context, params) => {
  const beamWidth = params.beamWidth || 10;
  const tickRate = params.tickRate || 50; // ms between damage ticks
  
  context.scene.events.emit('beam:configure', {
    ownerId: context.ownerId,
    beamWidth,
    tickRate,
    damage: context.weaponStats.damage,
    range: context.weaponStats.range
  });
});

/**
 * Bonus damage to elites
 */
registerBehavior('elite_bonus_damage', (context, params) => {
  if (!context.target) return;
  
  const bonusMultiplier = params.bonusMultiplier || 1.5;
  
  context.scene.events.emit('damage:elite_check', {
    targetId: getEntityId(context.target),
    bonusMultiplier,
    baseDamage: context.damage
  });
});

/**
 * Holy burst on kill
 */
registerBehavior('holy_burst_on_kill', (context, params) => {
  if (!context.hitPosition) return;
  
  const radius = params.radius || 60;
  const damageMultiplier = params.damageMultiplier || 0.5;
  
  context.scene.events.emit('explosion:create', {
    position: context.hitPosition,
    radius,
    damage: (context.damage || 0) * damageMultiplier,
    ownerId: context.ownerId,
    damageType: 'holy',
    visual: 'holy_burst'
  });
});

/**
 * Overkill damage chain
 */
registerBehavior('overkill_damage', (context, params) => {
  if (!context.hitPosition) return;
  
  const range = params.range || 100;
  const maxTargets = params.maxTargets || 3;
  
  context.scene.events.emit('overkill:chain', {
    position: context.hitPosition,
    overkillDamage: params.overkillDamage || 0,
    range,
    maxTargets,
    ownerId: context.ownerId
  });
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get entity ID from game object
 */
function getEntityId(entity: Phaser.GameObjects.GameObject): string {
  return (entity as any).id || (entity as any).name || `entity_${entity.constructor.name}`;
}

/**
 * Execute multiple behaviors in sequence
 */
export function executeBehaviors(
  behaviorNames: string[],
  context: BehaviorContext,
  paramsMap: Record<string, BehaviorParams> = {}
): void {
  for (const name of behaviorNames) {
    const params = paramsMap[name] || {};
    executeBehavior(name, context, params);
  }
}

/**
 * Create a behavior chain that executes on specific triggers
 */
export class BehaviorChain {
  private onHitBehaviors: string[] = [];
  private onKillBehaviors: string[] = [];
  private passiveBehaviors: string[] = [];
  private paramsMap: Record<string, BehaviorParams> = {};
  
  addOnHit(behavior: string, params: BehaviorParams = {}): this {
    this.onHitBehaviors.push(behavior);
    this.paramsMap[behavior] = params;
    return this;
  }
  
  addOnKill(behavior: string, params: BehaviorParams = {}): this {
    this.onKillBehaviors.push(behavior);
    this.paramsMap[behavior] = params;
    return this;
  }
  
  addPassive(behavior: string, params: BehaviorParams = {}): this {
    this.passiveBehaviors.push(behavior);
    this.paramsMap[behavior] = params;
    return this;
  }
  
  executeOnHit(context: BehaviorContext): void {
    executeBehaviors(this.onHitBehaviors, context, this.paramsMap);
  }
  
  executeOnKill(context: BehaviorContext): void {
    executeBehaviors(this.onKillBehaviors, context, this.paramsMap);
  }
  
  executePassive(context: BehaviorContext): void {
    executeBehaviors(this.passiveBehaviors, context, this.paramsMap);
  }
}
