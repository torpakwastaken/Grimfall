import Phaser from 'phaser';
import { Player } from '@/entities/Player';
import upgradeDataJson from '@/data/upgrades.json';
import { UpgradeData } from '@/types/GameTypes';

export class UpgradeSystem {
  private scene: Phaser.Scene;
  private upgradeData: Map<string, UpgradeData> = new Map();
  
  // XP and leveling
  private totalXP: number = 0;
  private currentLevel: number = 1;
  private xpThresholds: number[] = [];
  private baseXPPerLevel: number = 100;
  private xpScaling: number = 1.5;
  
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
      const xpNeeded = Math.floor(this.baseXPPerLevel * Math.pow(this.xpScaling, i - 1));
      this.xpThresholds.push(this.xpThresholds[i - 1] + xpNeeded);
    }
  }

  addXP(amount: number): void {
    this.totalXP += amount;
    
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
    
    this.scene.events.emit('levelUp', this.currentLevel);
  }

  private generateUpgradeChoices(): Array<{ playerId: number; upgrades: UpgradeData[] }> {
    const choices: Array<{ playerId: number; upgrades: UpgradeData[] }> = [];
    
    // Generate 3 random upgrades for each player
    for (let playerId = 0; playerId < 2; playerId++) {
      const playerUpgradeSet = this.playerUpgrades.get(playerId)!;
      const availableUpgrades: UpgradeData[] = [];
      
      // Get all upgrades player doesn't have yet
      for (const [id, upgrade] of this.upgradeData) {
        if (!playerUpgradeSet.has(id)) {
          availableUpgrades.push(upgrade);
        }
      }
      
      // Shuffle and take 3
      Phaser.Utils.Array.Shuffle(availableUpgrades);
      const selected = availableUpgrades.slice(0, 3);
      
      choices.push({
        playerId: playerId,
        upgrades: selected
      });
    }
    
    return choices;
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
    
    this.scene.events.emit('upgradeApplied', playerId, upgradeId);
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
