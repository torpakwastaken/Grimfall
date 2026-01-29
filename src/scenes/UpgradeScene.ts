import Phaser from 'phaser';
import { UpgradeData } from '@/types/GameTypes';
import { network } from '@/systems/NetworkManager';

export class UpgradeScene extends Phaser.Scene {
  private upgradeChoices!: Array<{ playerId: number; upgrades: UpgradeData[] }>;
  private level!: number;
  private selectedUpgrades: Map<number, string> = new Map();
  private cards: Phaser.GameObjects.Container[] = [];
  private isHost: boolean = true;
  private localPlayerId: number = 0; // Host controls P1 (0), Guest controls P2 (1)
  private waitingText?: Phaser.GameObjects.Text;

  private upgradeSelectedHandler: ((msg: any) => void) | null = null;

  constructor() {
    super('UpgradeScene');
  }

  init(data: any): void {
    this.upgradeChoices = data.upgradeChoices;
    this.level = data.level;
    this.isHost = data.isHost ?? true;
    this.localPlayerId = this.isHost ? 0 : 1;
    this.selectedUpgrades.clear();
    this.cards = [];
    
    console.log(`[UpgradeScene] init: isHost=${this.isHost}, localPlayerId=${this.localPlayerId}`);
    
    // Clean up old handlers before setting up new ones
    this.cleanupNetworkHandlers();
    
    // Setup network handlers
    this.setupNetworkHandlers();
  }
  
  private cleanupNetworkHandlers(): void {
    if (this.upgradeSelectedHandler) {
      network.off('upgrade_selected', this.upgradeSelectedHandler);
      this.upgradeSelectedHandler = null;
    }
  }
  
  private setupNetworkHandlers(): void {
    // Receive partner's upgrade selection
    this.upgradeSelectedHandler = (msg: any) => {
      if (msg.playerId !== undefined && msg.upgradeId) {
        console.log(`[UpgradeScene] Partner selected upgrade: P${msg.playerId} -> ${msg.upgradeId}`);
        
        // Only process if we haven't already selected for this player
        if (this.selectedUpgrades.has(msg.playerId)) return;
        
        // Mark as selected visually
        this.selectedUpgrades.set(msg.playerId, msg.upgradeId);
        this.markPartnerSelection(msg.playerId, msg.upgradeId);
        
        // Check if both selected
        this.checkBothSelected();
      }
    };
    network.on('upgrade_selected', this.upgradeSelectedHandler);
  }
  
  private markPartnerSelection(playerId: number, upgradeId: string): void {
    // Find the card and mark it as selected
    for (const card of this.cards) {
      const cardPlayerId = (card as any).playerId;
      const cardUpgradeId = (card as any).upgradeId;
      
      if (cardPlayerId === playerId && cardUpgradeId === upgradeId) {
        const cardBg = card.getAt(0) as Phaser.GameObjects.Rectangle;
        if (cardBg) {
          cardBg.setFillStyle(0x004400);
          cardBg.setStrokeStyle(4, 0x00ff00);
        }
        // Disable other cards for this player
        this.disablePlayerCards(playerId, card);
        break;
      }
    }
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
    
    // Show which player this client controls
    const controlText = this.isHost ? 'You control: Player 1 (Red)' : 'You control: Player 2 (Blue)';
    this.add.text(centerX, 100, controlText, {
      fontSize: '18px',
      color: this.isHost ? '#ff6666' : '#6666ff',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);

    // Player 1 upgrades (top half) - centered
    // 3 cards with 320px spacing = 640px total width, so offset by 320
    this.createPlayerUpgradeSection(0, 140, centerX - 320);

    // Player 2 upgrades (bottom half) - centered
    this.createPlayerUpgradeSection(1, 440, centerX - 320);
  }

  private createPlayerUpgradeSection(playerId: number, startY: number, startX: number): void {
    const playerColor = playerId === 0 ? '#ff0000' : '#0000ff';
    const playerName = `Player ${playerId + 1}`;
    const cam = this.cameras.main;
    const centerX = cam.width / 2;
    
    // Indicate if this section is controlled by local player or partner
    const isLocalPlayer = playerId === this.localPlayerId;
    const headerSuffix = isLocalPlayer ? ' (You)' : ' (Partner)';

    // Player header - centered horizontally
    this.add.text(centerX, startY - 40, playerName + headerSuffix, {
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
      
      const card = this.createUpgradeCard(playerId, upgrade, cardX, cardY, isLocalPlayer);
      this.cards.push(card);
    });
    
    // If not local player, show "waiting for partner" text
    if (!isLocalPlayer) {
      this.waitingText = this.add.text(centerX, startY + 180, 'Waiting for partner to choose...', {
        fontSize: '16px',
        color: '#888888',
        fontStyle: 'italic'
      }).setOrigin(0.5);
    }
  }

  private createUpgradeCard(
    playerId: number,
    upgrade: UpgradeData,
    x: number,
    y: number,
    isInteractive: boolean = true
  ): Phaser.GameObjects.Container {
    const card = this.add.container(x, y);
    // Store playerId and upgradeId on the card for later reference
    (card as any).playerId = playerId;
    (card as any).upgradeId = upgrade.id;

    // Card background - dimmed if not interactive
    const cardBg = this.add.rectangle(0, 0, 280, 200, isInteractive ? 0x222222 : 0x181818);
    cardBg.setStrokeStyle(3, isInteractive ? 0x666666 : 0x444444);
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

    // Make interactive only for local player's section
    if (isInteractive) {
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
    } else {
      // Dim non-interactive cards
      card.setAlpha(0.7);
    }

    return card;
  }

  private selectUpgrade(playerId: number, upgradeId: string, card: Phaser.GameObjects.Container): void {
    console.log(`selectUpgrade called: playerId=${playerId}, upgradeId=${upgradeId}`);
    
    // Mark as selected
    this.selectedUpgrades.set(playerId, upgradeId);
    
    // Send selection to partner over network
    network.sendUpgradeSelection(playerId, upgradeId);

    // Visual feedback
    const cardBg = card.getAt(0) as Phaser.GameObjects.Rectangle;
    if (cardBg) {
      cardBg.setFillStyle(0x004400);
      cardBg.setStrokeStyle(4, 0x00ff00);
    }

    // Disable other cards for this player
    this.disablePlayerCards(playerId, card);
    
    // Hide waiting text if it exists
    if (this.waitingText) {
      this.waitingText.destroy();
      this.waitingText = undefined;
    }

    // Check if both players selected
    this.checkBothSelected();
  }
  
  private checkBothSelected(): void {
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
    
    // Build selections array
    const selections: { playerId: number; upgradeId: string }[] = [];
    for (const [playerId, upgradeId] of this.selectedUpgrades) {
      selections.push({ playerId, upgradeId });
    }
    
    // Host applies upgrades and syncs to guest
    if (this.isHost) {
      for (const sel of selections) {
        console.log(`Applying upgrade ${sel.upgradeId} to player ${sel.playerId}`);
        gameScene.upgradeSystem.applyUpgrade(sel.playerId, sel.upgradeId);
      }
      // Send confirmation to guest
      network.sendUpgradesApplied(selections);
    }
    // Guest waits for upgrades_applied message

    // Resume game and stop this scene
    console.log('Applying upgrades and resuming game...');
    this.cleanupNetworkHandlers();
    this.scene.resume('GameScene');
    console.log('GameScene resumed, stopping UpgradeScene...');
    this.scene.stop('UpgradeScene');
    console.log('UpgradeScene stopped');
  }
}
