import Phaser from 'phaser';
import { Player } from '@/entities/Player';
import upgradeDataJson from '@/data/upgrades.json';
import { UpgradeData } from '@/types/GameTypes';
import { runtimeConfig } from './RuntimeConfig';

export class UpgradeSystem {
  private scene: Phaser.Scene;
  private upgradeData: Map<string, UpgradeData> = new Map();
  
  // XP and leveling
  private totalXP: number = 0;
  private currentLevel: number = 1;
  private xpThresholds: number[] = [];
  private baseXPPerLevel: number = 50; // First level-up in ~15 seconds
  private xpScaling: number = 1.35; // Flatter curve for duo play
  
  // Tier unlock levels
  private tierUnlockLevels: number[] = [1, 5, 10, 15];
  
  // Tier rarity weights based on current unlock state
  private tierWeights: number[][] = [
    [100, 0, 0, 0],     // Only tier 1
    [70, 30, 0, 0],     // Tier 1-2 unlocked
    [50, 35, 15, 0],    // Tier 1-3 unlocked
    [40, 30, 20, 10]    // All tiers unlocked
  ];
  
  // Track player upgrades
  private playerUpgrades: Map<number, Set<string>> = new Map();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    
    // Load upgrade data
    Object.entries(upgradeDataJson).forEach(([key, data]) => {
      this.upgradeData.set(key, data as UpgradeData);
    });
    
    // Generate XP thresholds for 20 levels
    this.generateXPThresholds(20);
    
    // Initialize player upgrade tracking
    this.playerUpgrades.set(0, new Set());
    this.playerUpgrades.set(1, new Set());
  }

  private generateXPThresholds(maxLevel: number): void {
    this.xpThresholds = [0]; // Level 1 starts at 0 XP
    
    for (let i = 1; i <= maxLevel; i++) {
      let xpNeeded = Math.floor(this.baseXPPerLevel * Math.pow(this.xpScaling, i - 1));
      
      // Late-game XP discount to prevent stagnation (levels 15+)
      if (i >= 15) {
        xpNeeded = Math.floor(xpNeeded * 0.9);
      }
      
      this.xpThresholds.push(this.xpThresholds[i - 1] + xpNeeded);
    }
  }

  addXP(amount: number): void {
    // Apply runtime XP multiplier
    const rtXpMult = runtimeConfig.get('xpGainMultiplier');
    const actualAmount = Math.floor(amount * rtXpMult);
    
    this.totalXP += actualAmount;
    
    // Check for level up
    if (this.currentLevel < this.xpThresholds.length - 1) {
      if (this.totalXP >= this.xpThresholds[this.currentLevel]) {
        this.levelUp();
      }
    }
    
    this.scene.events.emit('xpChanged', this.totalXP, this.getXPProgress());
  }

  private levelUp(): void {
    this.currentLevel++;
    console.log(`Level up! Now level ${this.currentLevel}`);
    
    // Pause game and show upgrade selection
    this.scene.scene.pause('GameScene');
    this.scene.scene.launch('UpgradeScene', {
      level: this.currentLevel,
      upgradeChoices: this.generateUpgradeChoices()
    });
    
    // Emit for both GameScene HUD and debug overlay
    this.scene.events.emit('levelUp', { level: this.currentLevel });
  }

  private generateUpgradeChoices(): Array<{ playerId: number; upgrades: UpgradeData[] }> {
    const choices: Array<{ playerId: number; upgrades: UpgradeData[] }> = [];
    
    // Determine which tiers are unlocked
    const unlockedTierIndex = this.getUnlockedTierIndex();
    const weights = this.tierWeights[unlockedTierIndex];
    
    // Generate 3 random upgrades for each player
    for (let playerId = 0; playerId < 2; playerId++) {
      const playerUpgradeSet = this.playerUpgrades.get(playerId)!;
      const partnerUpgradeSet = this.playerUpgrades.get(playerId === 0 ? 1 : 0)!;
      
      // Group available upgrades by tier
      const upgradesByTier: UpgradeData[][] = [[], [], [], []];
      
      for (const [id, upgrade] of this.upgradeData) {
        if (!playerUpgradeSet.has(id)) {
          const tierIndex = Math.min(upgrade.tier - 1, 3);
          if (tierIndex <= unlockedTierIndex) {
            upgradesByTier[tierIndex].push(upgrade);
          }
        }
      }
      
      // Select 3 upgrades using weighted random selection
      const selected: UpgradeData[] = [];
      const maxAttempts = 50;
      let attempts = 0;
      
      while (selected.length < 3 && attempts < maxAttempts) {
        attempts++;
        
        // Pick a tier based on weights
        const tierIndex = this.weightedRandomTier(weights);
        const tierUpgrades = upgradesByTier[tierIndex];
        
        if (tierUpgrades.length === 0) continue;
        
        // Apply synergy bonus: +20% weight for upgrades that synergize with partner
        const weightedUpgrades = tierUpgrades.map(u => {
          let weight = 1;
          if (u.synergyWith && partnerUpgradeSet.has(u.synergyWith)) {
            weight = 1.2; // 20% bonus for synergy potential
          }
          return { upgrade: u, weight };
        });
        
        // Weighted random selection from tier
        const totalWeight = weightedUpgrades.reduce((sum, u) => sum + u.weight, 0);
        let random = Math.random() * totalWeight;
        let chosen: UpgradeData | null = null;
        
        for (const { upgrade, weight } of weightedUpgrades) {
          random -= weight;
          if (random <= 0) {
            chosen = upgrade;
            break;
          }
        }
        
        if (chosen && !selected.some(s => s.id === chosen!.id)) {
          selected.push(chosen);
          // Remove from tier pool
          const idx = tierUpgrades.findIndex(u => u.id === chosen!.id);
          if (idx !== -1) tierUpgrades.splice(idx, 1);
        }
      }
      
      // Fallback: if we couldn't get 3, just grab any available
      if (selected.length < 3) {
        const allAvailable = upgradesByTier.flat().filter(u => !selected.some(s => s.id === u.id));
        Phaser.Utils.Array.Shuffle(allAvailable);
        while (selected.length < 3 && allAvailable.length > 0) {
          selected.push(allAvailable.pop()!);
        }
      }
      
      choices.push({
        playerId: playerId,
        upgrades: selected
      });
    }
    
    return choices;
  }
  
  private getUnlockedTierIndex(): number {
    for (let i = this.tierUnlockLevels.length - 1; i >= 0; i--) {
      if (this.currentLevel >= this.tierUnlockLevels[i]) {
        return i;
      }
    }
    return 0;
  }
  
  private weightedRandomTier(weights: number[]): number {
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let random = Math.random() * totalWeight;
    
    for (let i = 0; i < weights.length; i++) {
      random -= weights[i];
      if (random <= 0) return i;
    }
    return 0;
  }

  applyUpgrade(playerId: number, upgradeId: string): void {
    const upgrade = this.upgradeData.get(upgradeId);
    if (!upgrade) {
      console.warn(`Upgrade ${upgradeId} not found`);
      return;
    }
    
    // Track upgrade
    const playerUpgradeSet = this.playerUpgrades.get(playerId)!;
    playerUpgradeSet.add(upgradeId);
    
    // Apply to player
    const players = (this.scene as any).players.getChildren() as Player[];
    const player = players.find(p => p.playerId === playerId);
    
    if (player) {
      player.applyUpgrade(upgradeId, upgrade);
      
      // Check for synergies
      this.checkSynergies(playerId, upgradeId);
    }
    
    // Emit for debug overlay (object format)
    this.scene.events.emit('upgradeApplied', { playerId, upgradeId });
  }

  private checkSynergies(playerId: number, upgradeId: string): void {
    const upgrade = this.upgradeData.get(upgradeId);
    if (!upgrade || !upgrade.synergyWith) return;
    
    // Check if partner has the synergy upgrade
    const partnerId = playerId === 0 ? 1 : 0;
    const partnerUpgrades = this.playerUpgrades.get(partnerId)!;
    
    if (partnerUpgrades.has(upgrade.synergyWith)) {
      this.activateSynergy(playerId, upgradeId, upgrade.synergyWith);
    }
  }

  private activateSynergy(playerId: number, upgradeId: string, partnerUpgradeId: string): void {
    console.log(`Synergy activated: ${upgradeId} + ${partnerUpgradeId}`);
    
    // Show synergy notification
    this.scene.events.emit('synergyActivated', {
      playerId,
      upgradeId,
      partnerUpgradeId
    });
    
    // Synergy effects are handled in CombatSystem
    // This just triggers the notification
  }

  getXPProgress(): number {
    if (this.currentLevel >= this.xpThresholds.length - 1) return 1;
    
    const currentLevelXP = this.xpThresholds[this.currentLevel - 1];
    const nextLevelXP = this.xpThresholds[this.currentLevel];
    const progress = (this.totalXP - currentLevelXP) / (nextLevelXP - currentLevelXP);
    
    return Phaser.Math.Clamp(progress, 0, 1);
  }

  getCurrentLevel(): number {
    return this.currentLevel;
  }

  getTotalXP(): number {
    return this.totalXP;
  }

  getXPForNextLevel(): number {
    if (this.currentLevel >= this.xpThresholds.length - 1) return 0;
    return this.xpThresholds[this.currentLevel] - this.totalXP;
  }

  reset(): void {
    this.totalXP = 0;
    this.currentLevel = 1;
    this.playerUpgrades.get(0)!.clear();
    this.playerUpgrades.get(1)!.clear();
  }
}
