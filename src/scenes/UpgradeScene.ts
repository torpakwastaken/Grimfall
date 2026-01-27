import Phaser from 'phaser';
import { UpgradeData } from '@/types/GameTypes';

export class UpgradeScene extends Phaser.Scene {
  private upgradeChoices!: Array<{ playerId: number; upgrades: UpgradeData[] }>;
  private level!: number;
  private selectedUpgrades: Map<number, string> = new Map();
  private cards: Phaser.GameObjects.Container[] = [];

  constructor() {
    super('UpgradeScene');
  }

  init(data: any): void {
    this.upgradeChoices = data.upgradeChoices;
    this.level = data.level;
    this.selectedUpgrades.clear();
  }

  create(): void {
    const cam = this.cameras.main;
    const centerX = cam.width / 2;

    // Semi-transparent background
    const bg = this.add.rectangle(0, 0, cam.width, cam.height, 0x000000, 0.8);
    bg.setOrigin(0);

    // Title
    this.add.text(centerX, 20, `LEVEL ${this.level}`, {
      fontSize: '48px',
      color: '#ffff00',
      stroke: '#000000',
      strokeThickness: 6
    }).setOrigin(0.5);

    this.add.text(centerX, 70, 'Choose Your Upgrades', {
      fontSize: '24px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5);

    // Player 1 upgrades (top half) - centered
    // 3 cards with 320px spacing = 640px total width, so offset by 320
    this.createPlayerUpgradeSection(0, 120, centerX - 320);

    // Player 2 upgrades (bottom half) - centered
    this.createPlayerUpgradeSection(1, 420, centerX - 320);
  }

  private createPlayerUpgradeSection(playerId: number, startY: number, startX: number): void {
    const playerColor = playerId === 0 ? '#ff0000' : '#0000ff';
    const playerName = `Player ${playerId + 1}`;
    const cam = this.cameras.main;
    const centerX = cam.width / 2;

    // Player header - centered horizontally
    this.add.text(centerX, startY - 40, playerName, {
      fontSize: '32px',
      color: playerColor,
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5);

    // Get upgrades for this player
    const playerChoice = this.upgradeChoices.find(c => c.playerId === playerId);
    if (!playerChoice) return;

    // Create 3 upgrade cards - horizontally spread
    const cardSpacing = 320;
    playerChoice.upgrades.forEach((upgrade, index) => {
      const cardX = startX + index * cardSpacing;
      const cardY = startY + 80;
      
      const card = this.createUpgradeCard(playerId, upgrade, cardX, cardY);
      this.cards.push(card);
    });
  }

  private createUpgradeCard(
    playerId: number,
    upgrade: UpgradeData,
    x: number,
    y: number
  ): Phaser.GameObjects.Container {
    const card = this.add.container(x, y);
    // Store playerId on the card for later reference
    (card as any).playerId = playerId;

    // Card background
    const cardBg = this.add.rectangle(0, 0, 280, 200, 0x222222);
    cardBg.setStrokeStyle(3, 0x666666);
    card.add(cardBg);

    // Icon
    const icon = this.add.text(0, -60, upgrade.icon, {
      fontSize: '48px'
    }).setOrigin(0.5);
    card.add(icon);

    // Name
    const name = this.add.text(0, -10, upgrade.name, {
      fontSize: '18px',
      color: '#ffffff',
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: 260 }
    }).setOrigin(0.5);
    card.add(name);

    // Description
    const desc = this.add.text(0, 30, upgrade.description, {
      fontSize: '14px',
      color: '#cccccc',
      align: 'center',
      wordWrap: { width: 260 }
    }).setOrigin(0.5);
    card.add(desc);

    // Synergy bonus
    if (upgrade.synergyBonus) {
      const synergy = this.add.text(0, 80, `SYNERGY: ${upgrade.synergyBonus}`, {
        fontSize: '11px',
        color: '#ffaa00',
        align: 'center',
        wordWrap: { width: 260 }
      }).setOrigin(0.5);
      card.add(synergy);
    }

    // Make interactive
    cardBg.setInteractive({ useHandCursor: true });
    
    cardBg.on('pointerover', () => {
      cardBg.setFillStyle(0x333333);
      cardBg.setStrokeStyle(4, 0xffff00);
    });

    cardBg.on('pointerout', () => {
      if (!this.selectedUpgrades.has(playerId)) {
        cardBg.setFillStyle(0x222222);
        cardBg.setStrokeStyle(3, 0x666666);
      }
    });

    cardBg.on('pointerdown', () => {
      this.selectUpgrade(playerId, upgrade.id, card);
    });

    return card;
  }

  private selectUpgrade(playerId: number, upgradeId: string, card: Phaser.GameObjects.Container): void {
    console.log(`selectUpgrade called: playerId=${playerId}, upgradeId=${upgradeId}`);
    
    // Mark as selected
    this.selectedUpgrades.set(playerId, upgradeId);

    // Visual feedback
    const cardBg = card.getAt(0) as Phaser.GameObjects.Rectangle;
    if (cardBg) {
      cardBg.setFillStyle(0x004400);
      cardBg.setStrokeStyle(4, 0x00ff00);
    }

    // Disable other cards for this player
    this.disablePlayerCards(playerId, card);

    // Check if both players selected
    if (this.selectedUpgrades.size === 2) {
      this.time.delayedCall(500, () => {
        this.applyUpgrades();
      });
    }
  }

  private disablePlayerCards(playerId: number, selectedCard: Phaser.GameObjects.Container): void {
    for (const card of this.cards) {
      if (!card) {
        console.log('Skipping undefined card');
        continue;
      }
      
      // Only disable other cards for the same player
      const cardPlayerId = (card as any).playerId;
      console.log(`Card playerId: ${cardPlayerId}, target playerId: ${playerId}, isSelected: ${card === selectedCard}`);
      
      if (cardPlayerId === playerId && card !== selectedCard) {
        const children = card.getAll();
        console.log(`Card has ${children.length} children`);
        
        const cardBg = card.getAt(0) as Phaser.GameObjects.Rectangle;
        console.log(`cardBg is ${cardBg ? 'defined' : 'undefined'}`);
        
        if (cardBg) {
          cardBg.disableInteractive();
          cardBg.setFillStyle(0x111111);
          cardBg.setStrokeStyle(2, 0x333333);
          card.setAlpha(0.5);
        }
      }
    }
  }

  private applyUpgrades(): void {
    console.log('applyUpgrades called, selectedUpgrades size:', this.selectedUpgrades.size);
    
    const gameScene = this.scene.get('GameScene') as any;
    if (!gameScene) {
      console.error('GameScene not found!');
      return;
    }

    for (const [playerId, upgradeId] of this.selectedUpgrades) {
      console.log(`Applying upgrade ${upgradeId} to player ${playerId}`);
      gameScene.upgradeSystem.applyUpgrade(playerId, upgradeId);
    }

    // Resume game and stop this scene
    console.log('Applying upgrades and resuming game...');
    this.scene.resume('GameScene');
    console.log('GameScene resumed, stopping UpgradeScene...');
    this.scene.stop('UpgradeScene');
    console.log('UpgradeScene stopped');
  }
}
