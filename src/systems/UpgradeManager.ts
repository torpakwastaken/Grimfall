import Phaser from 'phaser';
import { UpgradeDefinition, UpgradeInstance, UpgradeCategory, UpgradeTrigger, SynergyTag, UpgradeRequirements, UpgradeStacking } from '../types/WeaponTypes';
import { StatModifier } from './WeaponManager';
import upgradesData from '../data/upgradesV2.json';

/**
 * UpgradeManager - Handles upgrade acquisition, stacking, and effect resolution
 * 
 * Responsibilities:
 * - Load upgrade definitions from JSON
 * - Track player upgrades with stacking
 * - Generate upgrade offers based on tags/level
 * - Calculate stat modifiers from upgrades
 * - Handle triggered effects (on_hit, on_kill, etc.)
 */
export class UpgradeManager {
  private scene: Phaser.Scene;
  private definitions: Map<string, UpgradeDefinition> = new Map();
  private playerUpgrades: Map<string, Map<string, UpgradeInstance>> = new Map(); // playerId -> upgradeId -> instance
  private playerTags: Map<string, Set<SynergyTag>> = new Map();
  
  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.loadDefinitions();
  }
  
  /**
   * Load all upgrade definitions from JSON
   */
  private loadDefinitions(): void {
    const data = upgradesData as { upgrades: Record<string, any> };
    
    for (const [id, def] of Object.entries(data.upgrades)) {
      const definition: UpgradeDefinition = {
        id: def.id,
        name: def.name,
        description: def.description,
        icon: def.icon,
        rarity: def.rarity,
        
        category: def.category as UpgradeCategory,
        trigger: def.trigger as UpgradeTrigger,
        
        effects: def.effects || [],
        requirements: def.requirements as UpgradeRequirements | undefined,
        stacking: (def.stacking || { maxStacks: 1, diminishing: 1.0 }) as UpgradeStacking,
        
        weight: def.weight || 50,
        grantsTags: (def.grantsTags || []) as SynergyTag[]
      };
      
      this.definitions.set(id, definition);
    }
    
    console.log(`[UpgradeManager] Loaded ${this.definitions.size} upgrade definitions`);
  }
  
  /**
   * Initialize tracking for a player
   */
  initializePlayer(playerId: string): void {
    if (!this.playerUpgrades.has(playerId)) {
      this.playerUpgrades.set(playerId, new Map());
      this.playerTags.set(playerId, new Set());
    }
  }
  
  /**
   * Get a player's current tags (from weapon + upgrades)
   */
  getPlayerTags(playerId: string): Set<SynergyTag> {
    return this.playerTags.get(playerId) || new Set();
  }
  
  /**
   * Add tags to a player (usually from weapon)
   */
  addPlayerTags(playerId: string, tags: SynergyTag[]): void {
    const playerTagSet = this.playerTags.get(playerId);
    if (playerTagSet) {
      tags.forEach(tag => playerTagSet.add(tag));
    }
  }
  
  /**
   * Check if player meets upgrade requirements
   */
  meetsRequirements(playerId: string, definition: UpgradeDefinition, playerLevel: number, partnerTags?: Set<SynergyTag>): boolean {
    const req = definition.requirements;
    if (!req) return true; // No requirements = always valid
    
    const playerTagSet = this.playerTags.get(playerId) || new Set();
    const playerUpgradeMap = this.playerUpgrades.get(playerId);
    
    // Level check
    if (req.minLevel && playerLevel < req.minLevel) {
      return false;
    }
    
    // Required tags check
    if (req.requiredTags && req.requiredTags.length > 0) {
      const hasAllTags = req.requiredTags.every((tag: string) => playerTagSet.has(tag as SynergyTag));
      if (!hasAllTags) return false;
    }
    
    // Excluded tags check
    if (req.excludeTags && req.excludeTags.length > 0) {
      const hasExcludedTag = req.excludeTags.some((tag: string) => playerTagSet.has(tag as SynergyTag));
      if (hasExcludedTag) return false;
    }
    
    // Required upgrade check
    if (req.hasUpgrade && req.hasUpgrade.length > 0) {
      const hasRequiredUpgrade = req.hasUpgrade.some((upgradeId: string) => 
        playerUpgradeMap?.has(upgradeId)
      );
      if (!hasRequiredUpgrade) return false;
    }
    
    // Partner tag check (for co-op upgrades)
    if (req.partnerHasTag && req.partnerHasTag.length > 0 && partnerTags) {
      const partnerHasTag = req.partnerHasTag.some((tag: string) => 
        partnerTags.has(tag as SynergyTag)
      );
      if (!partnerHasTag) return false;
    }
    
    return true;
  }
  
  /**
   * Check if upgrade can be stacked further
   */
  canStack(playerId: string, upgradeId: string): boolean {
    const definition = this.definitions.get(upgradeId);
    if (!definition) return false;
    
    const playerUpgradeMap = this.playerUpgrades.get(playerId);
    const existing = playerUpgradeMap?.get(upgradeId);
    
    if (!existing) return true;
    return (existing.stacks || 0) < definition.stacking.maxStacks;
  }
  
  /**
   * Add an upgrade to a player
   */
  addUpgrade(playerId: string, upgradeId: string): UpgradeInstance | null {
    const definition = this.definitions.get(upgradeId);
    if (!definition) {
      console.error(`[UpgradeManager] Unknown upgrade ID: ${upgradeId}`);
      return null;
    }
    
    let playerUpgradeMap = this.playerUpgrades.get(playerId);
    if (!playerUpgradeMap) {
      this.initializePlayer(playerId);
      playerUpgradeMap = this.playerUpgrades.get(playerId)!;
    }
    
    const existing = playerUpgradeMap.get(upgradeId);
    
    if (existing) {
      // Stack existing upgrade
      const currentStacks = existing.stacks || 0;
      if (currentStacks < definition.stacking.maxStacks) {
        existing.stacks = currentStacks + 1;
        existing.acquiredAt = Date.now();
        console.log(`[UpgradeManager] Stacked ${definition.name} (${existing.stacks}/${definition.stacking.maxStacks}) for ${playerId}`);
        return existing;
      } else {
        console.warn(`[UpgradeManager] ${definition.name} already at max stacks for ${playerId}`);
        return null;
      }
    } else {
      // New upgrade
      const instance: UpgradeInstance = {
        definitionId: upgradeId,
        stacks: 1,
        acquiredAt: Date.now()
      };
      
      playerUpgradeMap.set(upgradeId, instance);
      
      // Grant tags
      const playerTagSet = this.playerTags.get(playerId);
      if (playerTagSet && definition.grantsTags) {
        definition.grantsTags.forEach(tag => playerTagSet.add(tag));
      }
      
      console.log(`[UpgradeManager] Added ${definition.name} to ${playerId}`);
      
      // Emit event for other systems
      this.scene.events.emit('upgrade:acquired', {
        playerId,
        upgradeId,
        definition,
        instance
      });
      
      return instance;
    }
  }
  
  /**
   * Get all upgrades for a player
   */
  getPlayerUpgrades(playerId: string): UpgradeInstance[] {
    const playerUpgradeMap = this.playerUpgrades.get(playerId);
    return playerUpgradeMap ? Array.from(playerUpgradeMap.values()) : [];
  }
  
  /**
   * Calculate stat modifiers from all player upgrades
   */
  calculateStatModifiers(playerId: string): StatModifier[] {
    const modifiers: StatModifier[] = [];
    const playerUpgradeMap = this.playerUpgrades.get(playerId);
    
    if (!playerUpgradeMap) return modifiers;
    
    for (const [upgradeId, instance] of playerUpgradeMap) {
      const definition = this.definitions.get(upgradeId);
      if (!definition) continue;
      
      // Only process passive stat effects
      if (definition.trigger !== 'passive') continue;
      
      for (const effect of definition.effects) {
        if (effect.type === 'stat_add' || effect.type === 'stat_multiply') {
          const stacks = instance.stacks || 1;
          const effectValue = effect.value || 0;
          
          // Calculate effective value with stacking diminishing
          let effectiveValue = effectValue;
          if (stacks > 1) {
            const diminishing = definition.stacking.diminishing;
            for (let i = 1; i < stacks; i++) {
              effectiveValue += effectValue * Math.pow(diminishing, i);
            }
          }
          
          if (effect.stat) {
            modifiers.push({
              stat: effect.stat,
              type: effect.type === 'stat_add' ? 'add' : 'multiply',
              value: effect.type === 'stat_add' ? effectiveValue : 
                     (1 + (effectiveValue - 1) * stacks * Math.pow(definition.stacking.diminishing, stacks - 1))
            });
          }
        }
      }
    }
    
    return modifiers;
  }
  
  /**
   * Get triggered upgrades for a specific trigger type
   */
  getTriggeredUpgrades(playerId: string, trigger: UpgradeTrigger): Array<{definition: UpgradeDefinition, instance: UpgradeInstance}> {
    const results: Array<{definition: UpgradeDefinition, instance: UpgradeInstance}> = [];
    const playerUpgradeMap = this.playerUpgrades.get(playerId);
    
    if (!playerUpgradeMap) return results;
    
    for (const [upgradeId, instance] of playerUpgradeMap) {
      const definition = this.definitions.get(upgradeId);
      if (definition && definition.trigger === trigger) {
        results.push({ definition, instance });
      }
    }
    
    return results;
  }
  
  /**
   * Generate upgrade offers for a player
   */
  generateUpgradeOffers(
    playerId: string, 
    playerLevel: number, 
    count: number = 3,
    partnerTags?: Set<SynergyTag>
  ): UpgradeDefinition[] {
    const playerTags = this.playerTags.get(playerId) || new Set();
    const poolRules = (upgradesData as any).upgradePoolRules;
    
    // Build eligible pool
    const eligiblePool: Array<{definition: UpgradeDefinition, weight: number}> = [];
    
    for (const definition of this.definitions.values()) {
      // Check requirements
      if (!this.meetsRequirements(playerId, definition, playerLevel, partnerTags)) {
        continue;
      }
      
      // Check if can stack
      if (!this.canStack(playerId, definition.id)) {
        continue;
      }
      
      // Calculate weight
      let weight = definition.weight;
      
      // Rarity scaling with level
      const rarityWeights = (upgradesData as any).rarityWeights;
      const rarityMod = rarityWeights[definition.rarity];
      if (rarityMod) {
        weight = rarityMod.baseWeight + (rarityMod.levelScaling * playerLevel);
      }
      
      // Bonus for tag synergy
      const hasTagSynergy = definition.requirements?.requiredTags?.some(
        (tag: string) => playerTags.has(tag as SynergyTag)
      );
      if (hasTagSynergy) {
        weight *= poolRules.tagSynergyBonus || 1.5;
      }
      
      // Bonus for co-op upgrades when partner exists
      if ((definition.category as string) === 'coop' && partnerTags) {
        weight *= 1.3;
      }
      
      if (weight > 0) {
        eligiblePool.push({ definition, weight });
      }
    }
    
    // Check for guaranteed rare at certain levels
    const guaranteedRareLevels = poolRules.guaranteedRareAtLevel || [];
    const forceRare = guaranteedRareLevels.includes(playerLevel);
    
    // Weighted random selection
    const selected: UpgradeDefinition[] = [];
    const remaining = [...eligiblePool];
    
    while (selected.length < count && remaining.length > 0) {
      // If we need a rare and haven't picked one yet
      if (forceRare && selected.length === 0) {
        const rares = remaining.filter(e => 
          e.definition.rarity === 'rare' || 
          e.definition.rarity === 'epic' || 
          e.definition.rarity === 'legendary'
        );
        if (rares.length > 0) {
          const pick = this.weightedRandom(rares);
          selected.push(pick.definition);
          const idx = remaining.findIndex(e => e.definition.id === pick.definition.id);
          if (idx >= 0) remaining.splice(idx, 1);
          continue;
        }
      }
      
      const pick = this.weightedRandom(remaining);
      selected.push(pick.definition);
      
      // Remove from pool to avoid duplicates
      const idx = remaining.findIndex(e => e.definition.id === pick.definition.id);
      if (idx >= 0) remaining.splice(idx, 1);
    }
    
    return selected;
  }
  
  /**
   * Weighted random selection
   */
  private weightedRandom<T extends {weight: number}>(pool: T[]): T {
    const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const item of pool) {
      random -= item.weight;
      if (random <= 0) {
        return item;
      }
    }
    
    return pool[pool.length - 1];
  }
  
  /**
   * Get upgrade definition by ID
   */
  getDefinition(upgradeId: string): UpgradeDefinition | undefined {
    return this.definitions.get(upgradeId);
  }
  
  /**
   * Reset player upgrades (for new run)
   */
  resetPlayer(playerId: string): void {
    this.playerUpgrades.delete(playerId);
    this.playerTags.delete(playerId);
  }
  
  /**
   * Destroy and cleanup
   */
  destroy(): void {
    this.definitions.clear();
    this.playerUpgrades.clear();
    this.playerTags.clear();
  }
}
