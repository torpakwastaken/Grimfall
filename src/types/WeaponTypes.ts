/**
 * WeaponTypes.ts - Core type definitions for the weapon system
 * 
 * ARCHITECTURE PRINCIPLES:
 * 1. Data-driven: Weapons defined in JSON, behaviors are composable
 * 2. Tag-based: Synergies resolved via tag matching, not hardcoded checks
 * 3. Event-driven: Combat events flow through a central bus
 * 4. Pooled: All projectiles/effects use object pools
 */

// ============================================
// WEAPON DEFINITIONS
// ============================================

/** How the weapon fires */
export type FirePattern = 
  | 'projectile'    // Single shot toward target
  | 'spread'        // Multiple projectiles in arc
  | 'burst'         // Rapid sequential shots
  | 'beam'          // Continuous line damage
  | 'aura'          // AoE around player
  | 'chain'         // Bounces between enemies
  | 'pulse'         // Expanding ring
  | 'orbital'       // Circles around player
  | 'mine'          // Placed on ground
  | 'summon';       // Spawns entity

/** What type of damage it deals */
export type DamageType = 
  | 'physical'      // Direct damage
  | 'fire'          // Burn DoT
  | 'ice'           // Slow + shatter
  | 'lightning'     // Chain + mark
  | 'poison'        // Stacking DoT
  | 'void'          // % max HP
  | 'holy'          // Bonus vs elites
  | 'explosive';    // AoE on impact

/** Tags for synergy matching */
export type SynergyTag = 
  | 'burn' | 'freeze' | 'shock' | 'poison' | 'bleed'  // Debuffs
  | 'mark' | 'weaken' | 'expose' | 'root'              // Control
  | 'aoe' | 'single_target' | 'dot' | 'burst'          // Damage profile
  | 'melee' | 'ranged' | 'summon'                      // Range
  | 'lifesteal' | 'shield' | 'regen'                   // Sustain
  | 'knockback' | 'pull' | 'group'                     // Crowd control
  | 'crit' | 'execute' | 'detonate'                    // Finishers
  | 'prime' | 'combo';                                 // Co-op triggers

/** Base weapon definition (JSON-serializable) */
export interface WeaponDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  
  // Core stats
  baseDamage: number;
  baseFireRate: number;       // Attacks per second
  baseRange: number;          // Pixels
  basePierce: number;         // Enemies hit before despawn
  baseProjectileSpeed: number;
  baseProjectileSize: number;
  
  // Behavior
  firePattern: FirePattern;
  damageType: DamageType;
  
  // Visual
  projectileColor: number;
  muzzleFlash: boolean;
  trailEffect?: string;
  
  // Synergy system
  synergyTags: SynergyTag[];
  scalingRules: ScalingRule[];
  
  // Special behaviors (component IDs)
  behaviors: string[];
  
  // Unlocks
  unlockedByDefault: boolean;
  unlockCondition?: string;
}

/** How an upgrade affects a weapon stat */
export interface ScalingRule {
  stat: WeaponStat;
  baseMultiplier: number;     // How much 1 point of upgrade affects this
  softCap: number;            // Diminishing returns threshold
  hardCap: number;            // Maximum value
}

export type WeaponStat = 
  | 'damage' | 'fireRate' | 'range' | 'pierce' 
  | 'projectileSpeed' | 'projectileSize' | 'projectileCount'
  | 'critChance' | 'critMultiplier' | 'lifesteal'
  | 'aoeRadius' | 'dotDuration' | 'dotDamage'
  | 'chainCount' | 'bounceCount';


// ============================================
// UPGRADE DEFINITIONS
// ============================================

/** Category of upgrade */
export type UpgradeCategory = 
  | 'stat'          // Direct stat modifications
  | 'behavior'      // Changes how weapon works
  | 'conditional'   // On specific conditions
  | 'scaling'       // Scales over time/kills
  | 'coop'          // Co-op specific
  | 'tradeoff';     // Has downsides

/** When the upgrade effect triggers */
export type UpgradeTrigger = 
  | 'passive'       // Always active
  | 'on_hit'        // When damaging enemy
  | 'on_kill'       // When killing enemy
  | 'on_crit'       // When landing critical
  | 'on_take_damage'// When taking damage
  | 'on_down'       // When downed
  | 'partner_hit'   // When partner damages same target
  | 'partner_kill'  // When partner kills
  | 'combo';        // When combo meter threshold reached

/** Single upgrade effect */
export interface UpgradeEffect {
  type: string;     // Flexible type for various effects
  stat?: string;    // Stat to modify
  value?: number;   // Effect value
  duration?: number;
  condition?: string;
  threshold?: number;
  damageMultiplier?: number;
  radius?: number;
  behavior?: string;
  params?: Record<string, any>;
  [key: string]: any; // Allow additional properties
}

/** Upgrade stacking config */
export interface UpgradeStacking {
  maxStacks: number;
  diminishing: number; // Multiplier for each additional stack (0.8 = 80%)
}

/** Upgrade requirements */
export interface UpgradeRequirements {
  minLevel?: number;
  requiredTags?: string[];
  excludeTags?: string[];
  hasUpgrade?: string[];
  partnerHasTag?: string[];
}

/** Full upgrade definition */
export interface UpgradeDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  
  // Categorization
  category: UpgradeCategory;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  
  // Trigger
  trigger: UpgradeTrigger;
  
  // Effects
  effects: UpgradeEffect[];
  
  // Requirements
  requirements?: UpgradeRequirements;
  
  // Stacking
  stacking: UpgradeStacking;
  
  // Weight for random selection
  weight: number;
  
  // Tags this upgrade grants
  grantsTags?: SynergyTag[];
}


// ============================================
// SYNERGY DEFINITIONS
// ============================================

/** Cross-player synergy combo */
export interface SynergyDefinition {
  id: string;
  name: string;
  description: string;
  
  // Trigger condition
  trigger: {
    type: string;
    window?: number;
    requiredTags?: Record<string, string[]>;
    targetStatus?: string;
    damageThreshold?: number;
    status1?: string;
    status2?: string;
    [key: string]: any;
  };
  
  // Effects when synergy activates
  effect: {
    type: string;
    baseDamage?: number;
    damageMultiplier?: number;
    radius?: number;
    chainRange?: number;
    maxChains?: number;
    damageDecay?: number;
    [key: string]: any;
  };
  
  // Visual/audio
  visualEffect?: string;
  soundEffect?: string | null;
}

export type SynergyTrigger = 
  | 'both_hit_same_target'          // Within time window
  | 'proximity'                     // Players close together
  | 'sequential_debuff'             // P1 debuff → P2 hits
  | 'combo_meter_full'              // Combo threshold reached
  | 'simultaneous_kill'             // Both kill within window
  | 'one_primes_one_detonates';     // Classic prime/detonate

export interface SynergyEffect {
  type: SynergyEffectType;
  value: number;
  duration?: number;
  radius?: number;
  target: 'enemy' | 'both_players' | 'area';
}

export type SynergyEffectType = 
  | 'explosion' | 'chain_lightning' | 'heal_both' | 'damage_amp'
  | 'slow_field' | 'pull_enemies' | 'shield_both' | 'execute'
  | 'spawn_orbitals' | 'reset_cooldowns' | 'xp_burst' | 'time_slow';


// ============================================
// RUNTIME STATE
// ============================================

/** Computed weapon stats */
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

/** Active weapon buff */
export interface WeaponBuff {
  stat: string;
  type: 'add' | 'multiply';
  value: number;
  expiresAt: number;
  source: string;
}

/** Active weapon instance on a player */
export interface WeaponInstance {
  definitionId: string;
  ownerId: string;
  level: number;
  experience: number;
  
  // Current computed stats
  currentStats: WeaponStats;
  
  // Active behaviors (string array for JSON serialization)
  activeBehaviors: string[];
  
  // Active temporary buffs
  activeBuffs: WeaponBuff[];
  
  // Current tags (base + from upgrades)
  currentTags: Set<SynergyTag>;
  
  // Cooldown tracking
  lastFiredAt: number;
  
  // Ammo (if applicable)
  currentAmmo?: number;
  maxAmmo?: number;
  reloadTime?: number;
}

/** Active upgrade on a player */
export interface UpgradeInstance {
  definitionId: string;
  stacks: number;
  acquiredAt: number;
  lastTriggerTime?: number;
}

/** Player's full loadout */
export interface PlayerLoadout {
  playerId: number;
  weapon: WeaponInstance;
  upgrades: UpgradeInstance[];
  
  // Aggregated tags from weapon + all upgrades
  allTags: Set<SynergyTag>;
  
  // Stats modified by upgrades
  globalDamageMultiplier: number;
  globalFireRateMultiplier: number;
  globalRangeMultiplier: number;
}


// ============================================
// COMBAT EVENTS
// ============================================

/** All combat events flow through this interface */
export interface CombatEvent {
  type: CombatEventType;
  timestamp?: number;
  
  // Source info
  sourceId?: string;
  sourceWeaponId?: string;
  
  // Target info
  targetId?: string;
  position?: { x: number; y: number };
  
  // Damage info
  damage?: number;
  damageType?: DamageType;
  isCritical?: boolean;
  
  // Result
  killed?: boolean;
  overkill?: number;
  targetsHit?: number;
  healAmount?: number;
  
  // Debuffs applied
  appliedDebuffs?: SynergyTag[];
}

export type CombatEventType = 
  | 'damage' | 'aoe_damage' | 'dot_damage'
  | 'heal' | 'shield'
  | 'status_applied' | 'status_removed'
  | 'enemy_killed' | 'elite_killed' | 'boss_killed'
  | 'synergy_trigger' | 'combo'
  | 'projectile_fired' | 'projectile_hit';
