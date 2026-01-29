import Phaser from 'phaser';
import { WeaponManager } from '../systems/WeaponManager';
import { WeaponDefinition } from '../types/WeaponTypes';
import { network, PlayerId } from '../systems/NetworkManager';
import weaponsData from '../data/weapons.json';

/**
 * Online Weapon Selection Scene
 * 
 * Each player only sees and controls their OWN selection.
 * Partner's selection is synced via network.
 * 
 * Controls: Arrow keys / WASD to navigate, ENTER/E/SPACE to confirm
 */
export class WeaponSelectScene extends Phaser.Scene {
  private weaponManager!: WeaponManager;
  private weapons: WeaponDefinition[] = [];
  
  // Local player state
  private myIndex: number = 0;
  private mySelected: boolean = false;
  private myWeaponId: string = '';
  
  // Partner state (received via network)
  private partnerSelected: boolean = false;
  private partnerWeaponId: string = '';
  
  // Mode flags
  private isHost: boolean = true;
  private isSoloMode: boolean = false;
  private playerId: PlayerId = 'player1';
  
  // UI elements
  private weaponCards: Phaser.GameObjects.Container[] = [];
  private cursor!: Phaser.GameObjects.Rectangle;
  private infoPanel!: Phaser.GameObjects.Container;
  private partnerPanel!: Phaser.GameObjects.Container;
  private statusText!: Phaser.GameObjects.Text;
  private synergyText!: Phaser.GameObjects.Text;
  private startPrompt!: Phaser.GameObjects.Text;
  
  constructor() {
    super({ key: 'WeaponSelectScene' });
  }
  
  create(): void {
    // Get mode from registry (set by LobbyScene)
    this.isHost = this.registry.get('isHost') ?? true;
    this.isSoloMode = this.registry.get('soloMode') ?? false;
    this.playerId = this.registry.get('playerId') ?? 'player1';
    
    // Initialize weapon manager
    this.weaponManager = new WeaponManager(this);
    this.weapons = this.weaponManager.getUnlockedWeapons();
    
    // Reset state
    this.myIndex = 0;
    this.mySelected = false;
    this.myWeaponId = '';
    this.partnerSelected = false;
    this.partnerWeaponId = '';
    
    this.cameras.main.setBackgroundColor(0x0a0a1a);
    
    this.createUI();
    this.setupInput();
    this.setupNetworkHandlers();
    this.updateDisplay();
    
    // Entrance animation
    this.cameras.main.fadeIn(300);
    
    // In solo mode, auto-select for "partner" (AI or second player later)
    if (this.isSoloMode) {
      this.partnerSelected = true;
      this.partnerWeaponId = this.weapons[Math.floor(Math.random() * this.weapons.length)].id;
    }
  }
  
  private createUI(): void {
    const { width, height } = this.scale;
    const isP1 = this.playerId === 'player1';
    const myColor = isP1 ? 0xff6b6b : 0x4ecdc4;
    const partnerColor = isP1 ? 0x4ecdc4 : 0xff6b6b;
    
    // Title
    this.add.text(width / 2, 30, 'CHOOSE YOUR WEAPON', {
      fontSize: '32px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    
    // Player indicator
    const playerLabel = isP1 ? '🔴 You are Player 1 (Host)' : '🔵 You are Player 2 (Guest)';
    this.add.text(width / 2, 65, playerLabel, {
      fontSize: '16px',
      color: isP1 ? '#ff6b6b' : '#4ecdc4'
    }).setOrigin(0.5);
    
    // Room code display
    const roomCode = this.registry.get('roomCode') || 'SOLO';
    this.add.text(width - 20, 20, `Room: ${roomCode}`, {
      fontSize: '14px',
      color: '#666666'
    }).setOrigin(1, 0);
    
    // Control hints
    this.add.text(width / 2, 90, 'Use ARROW KEYS or WASD to navigate • Press ENTER or SPACE to confirm', {
      fontSize: '14px',
      color: '#888888'
    }).setOrigin(0.5);
    
    // Create weapon grid (centered, larger cards)
    this.createWeaponGrid();
    
    // Selection cursor
    this.cursor = this.add.rectangle(0, 0, 195, 95, myColor, 0)
      .setStrokeStyle(4, myColor);
    
    // My weapon info panel (left side)
    this.infoPanel = this.createInfoPanel(170, 550, 'YOUR SELECTION', myColor);
    
    // Partner weapon info panel (right side)  
    this.partnerPanel = this.createInfoPanel(width - 170, 550, 'PARTNER\'S WEAPON', partnerColor);
    this.updatePartnerPanel();
    
    // Synergy indicator (center)
    this.synergyText = this.add.text(width / 2, 510, '', {
      fontSize: '18px',
      color: '#ffcc00',
      fontStyle: 'bold',
      align: 'center'
    }).setOrigin(0.5);
    
    // Status text
    this.statusText = this.add.text(width / 2, 620, '', {
      fontSize: '16px',
      color: '#aaaaaa'
    }).setOrigin(0.5);
    
    // Start prompt
    this.startPrompt = this.add.text(width / 2, 680, '', {
      fontSize: '22px',
      color: '#00ff00',
      fontStyle: 'bold'
    }).setOrigin(0.5).setAlpha(0);
  }
  
  private createWeaponGrid(): void {
    const { width } = this.scale;
    const cardWidth = 190;
    const cardHeight = 90;
    const cols = 4;
    const rows = 2;
    const gapX = 200;
    const gapY = 100;
    
    // Calculate grid position to center it
    const gridWidth = cols * gapX - (gapX - cardWidth);
    const startX = (width - gridWidth) / 2 + cardWidth / 2;
    const startY = 180;
    
    this.weapons.forEach((weapon, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const x = startX + col * gapX;
      const y = startY + row * gapY;
      
      const card = this.createWeaponCard(x, y, weapon, cardWidth, cardHeight);
      this.weaponCards.push(card);
    });
  }
  
  private createWeaponCard(x: number, y: number, weapon: WeaponDefinition, w: number, h: number): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    
    // Background
    const bg = this.add.rectangle(0, 0, w, h, 0x1a1a2e, 0.95)
      .setStrokeStyle(1, 0x333355);
    
    // Icon
    const icon = this.add.text(-w/2 + 35, 0, weapon.icon, {
      fontSize: '36px'
    }).setOrigin(0.5);
    
    // Name
    const name = this.add.text(-w/2 + 70, -20, weapon.name, {
      fontSize: '16px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0, 0.5);
    
    // Damage type
    const typeColor = this.getDamageTypeColor(weapon.damageType);
    const typeText = this.add.text(-w/2 + 70, 2, weapon.damageType.toUpperCase(), {
      fontSize: '11px',
      color: typeColor
    }).setOrigin(0, 0.5);
    
    // Fire pattern
    const pattern = this.add.text(-w/2 + 70, 22, weapon.firePattern, {
      fontSize: '10px',
      color: '#666666'
    }).setOrigin(0, 0.5);
    
    // Stats preview
    const stats = this.add.text(w/2 - 10, 0, `⚔${weapon.baseDamage}`, {
      fontSize: '12px',
      color: '#88ff88'
    }).setOrigin(1, 0.5);
    
    container.add([bg, icon, name, typeText, pattern, stats]);
    container.setData('weapon', weapon);
    
    // Make interactive for mouse/touch
    bg.setInteractive({ useHandCursor: true })
      .on('pointerover', () => {
        if (!this.mySelected) {
          this.myIndex = this.weaponCards.indexOf(container);
          this.updateDisplay();
        }
      })
      .on('pointerdown', () => this.confirmSelection());
    
    return container;
  }
  
  private createInfoPanel(x: number, y: number, title: string, color: number): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    
    const bg = this.add.rectangle(0, 0, 300, 160, 0x1a1a2e, 0.95)
      .setStrokeStyle(2, color);
    
    const header = this.add.text(0, -65, title, {
      fontSize: '12px',
      color: Phaser.Display.Color.IntegerToColor(color).rgba
    }).setOrigin(0.5).setName('header');
    
    const weaponName = this.add.text(0, -40, '', {
      fontSize: '20px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5).setName('name');
    
    const desc = this.add.text(0, -5, '', {
      fontSize: '12px',
      color: '#aaaaaa',
      wordWrap: { width: 270 },
      align: 'center'
    }).setOrigin(0.5).setName('desc');
    
    const statsText = this.add.text(0, 35, '', {
      fontSize: '12px',
      color: '#88ff88',
      align: 'center'
    }).setOrigin(0.5).setName('stats');
    
    const tags = this.add.text(0, 60, '', {
      fontSize: '10px',
      color: '#ffcc00'
    }).setOrigin(0.5).setName('tags');
    
    container.add([bg, header, weaponName, desc, statsText, tags]);
    return container;
  }
  
  private setupInput(): void {
    const keyboard = this.input.keyboard!;
    
    // Navigation - support both WASD and arrow keys
    keyboard.on('keydown-UP', () => this.moveSelection(-4));
    keyboard.on('keydown-W', () => this.moveSelection(-4));
    keyboard.on('keydown-DOWN', () => this.moveSelection(4));
    keyboard.on('keydown-S', () => this.moveSelection(4));
    keyboard.on('keydown-LEFT', () => this.moveSelection(-1));
    keyboard.on('keydown-A', () => this.moveSelection(-1));
    keyboard.on('keydown-RIGHT', () => this.moveSelection(1));
    keyboard.on('keydown-D', () => this.moveSelection(1));
    
    // Selection - multiple keys for convenience
    keyboard.on('keydown-ENTER', () => this.confirmSelection());
    keyboard.on('keydown-SPACE', () => this.confirmSelection());
    keyboard.on('keydown-E', () => this.confirmSelection());
  }
  
  private setupNetworkHandlers(): void {
    if (this.isSoloMode) return;
    
    // Receive partner's weapon selection
    network.on('weapon_selected', (msg: any) => {
      if (msg.type === 'weapon_selected') {
        this.partnerWeaponId = msg.weaponId;
        this.updatePartnerPanel();
        this.updateSynergyDisplay();
      }
    });
    
    // Receive partner ready state
    network.on('player_ready', (msg: any) => {
      if (msg.type === 'player_ready') {
        this.partnerSelected = msg.ready;
        this.checkBothReady();
        this.updateStatus();
      }
    });
    
    // Game starting (from host)
    network.on('game_start', () => {
      this.startGame();
    });
  }
  
  private moveSelection(delta: number): void {
    if (this.mySelected) return;
    
    const newIndex = this.myIndex + delta;
    if (newIndex >= 0 && newIndex < this.weapons.length) {
      this.myIndex = newIndex;
      this.updateDisplay();
      
      // Broadcast preview to partner
      const weapon = this.weapons[this.myIndex];
      if (!this.isSoloMode) {
        network.selectWeapon(weapon.id);
      }
    }
  }
  
  private confirmSelection(): void {
    if (this.mySelected) {
      // Deselect
      this.mySelected = false;
      this.myWeaponId = '';
      network.setReady(false);
    } else {
      // Select
      this.mySelected = true;
      this.myWeaponId = this.weapons[this.myIndex].id;
      network.setReady(true);
      network.selectWeapon(this.myWeaponId);
    }
    
    this.updateDisplay();
    this.checkBothReady();
  }
  
  private updateDisplay(): void {
    // Update cursor position
    if (this.weaponCards[this.myIndex]) {
      const card = this.weaponCards[this.myIndex];
      this.cursor.setPosition(card.x, card.y);
      this.cursor.setStrokeStyle(4, this.mySelected ? 0x00ff00 : (this.playerId === 'player1' ? 0xff6b6b : 0x4ecdc4));
    }
    
    // Update my info panel
    const weapon = this.weapons[this.myIndex];
    this.updateInfoPanelContent(this.infoPanel, weapon, this.mySelected);
    
    // Update card highlights
    this.weaponCards.forEach((card, i) => {
      const bg = card.getAt(0) as Phaser.GameObjects.Rectangle;
      if (i === this.myIndex) {
        bg.setFillStyle(0x2a2a4e, 1);
        if (this.mySelected) {
          bg.setFillStyle(0x1a3a1a, 1);
        }
      } else {
        bg.setFillStyle(0x1a1a2e, 0.95);
      }
    });
    
    this.updateSynergyDisplay();
    this.updateStatus();
  }
  
  private updateInfoPanelContent(panel: Phaser.GameObjects.Container, weapon: WeaponDefinition | null, selected: boolean): void {
    const nameText = panel.getByName('name') as Phaser.GameObjects.Text;
    const desc = panel.getByName('desc') as Phaser.GameObjects.Text;
    const stats = panel.getByName('stats') as Phaser.GameObjects.Text;
    const tags = panel.getByName('tags') as Phaser.GameObjects.Text;
    
    if (!weapon) {
      nameText.setText('Waiting...');
      desc.setText('');
      stats.setText('');
      tags.setText('');
      return;
    }
    
    nameText.setText(`${weapon.icon} ${weapon.name}${selected ? ' ✓' : ''}`);
    nameText.setColor(selected ? '#00ff00' : '#ffffff');
    desc.setText(weapon.description);
    stats.setText(`DMG: ${weapon.baseDamage}  •  RATE: ${weapon.baseFireRate}/s  •  RANGE: ${weapon.baseRange}`);
    tags.setText(weapon.synergyTags.slice(0, 4).join(' • '));
  }
  
  private updatePartnerPanel(): void {
    let partnerWeapon: WeaponDefinition | null = null;
    
    if (this.partnerWeaponId) {
      partnerWeapon = this.weapons.find(w => w.id === this.partnerWeaponId) || null;
    }
    
    this.updateInfoPanelContent(this.partnerPanel, partnerWeapon, this.partnerSelected);
    
    const header = this.partnerPanel.getByName('header') as Phaser.GameObjects.Text;
    if (this.partnerSelected) {
      header.setText('PARTNER READY ✓');
    } else if (this.partnerWeaponId) {
      header.setText('PARTNER PREVIEWING...');
    } else if (this.isSoloMode) {
      header.setText('AI PARTNER');
    } else {
      header.setText('WAITING FOR PARTNER...');
    }
  }
  
  private updateSynergyDisplay(): void {
    const myWeapon = this.weapons[this.myIndex];
    const partnerWeapon = this.partnerWeaponId 
      ? this.weapons.find(w => w.id === this.partnerWeaponId)
      : null;
    
    if (!partnerWeapon) {
      this.synergyText.setText('');
      return;
    }
    
    // Check tag synergies
    const myTags = new Set(myWeapon.synergyTags);
    const partnerTags = new Set(partnerWeapon.synergyTags);
    
    const synergies: string[] = [];
    
    // Prime + Detonate
    if ((myTags.has('prime') || myTags.has('mark')) && (partnerTags.has('detonate') || partnerTags.has('crit'))) {
      synergies.push('🎯 PRIME → DETONATE');
    }
    if ((partnerTags.has('prime') || partnerTags.has('mark')) && (myTags.has('detonate') || myTags.has('crit'))) {
      synergies.push('🎯 DETONATE → PRIME');
    }
    
    // Elemental combos
    if ((myTags.has('burn') && partnerTags.has('shock')) || (partnerTags.has('burn') && myTags.has('shock'))) {
      synergies.push('⚡🔥 ELEMENTAL STORM');
    }
    
    if ((myTags.has('freeze') && partnerTags.has('single_target')) || (partnerTags.has('freeze') && myTags.has('single_target'))) {
      synergies.push('❄️💥 SHATTER COMBO');
    }
    
    // Range coverage
    if ((myTags.has('melee') && partnerTags.has('ranged')) || (partnerTags.has('melee') && myTags.has('ranged'))) {
      synergies.push('⚔️🏹 RANGE COVERAGE');
    }
    
    // AoE + Single target balance
    if ((myTags.has('aoe') && partnerTags.has('single_target')) || (partnerTags.has('aoe') && myTags.has('single_target'))) {
      synergies.push('🌊🎯 TACTICAL BALANCE');
    }
    
    if (synergies.length > 0) {
      this.synergyText.setText('✨ SYNERGY: ' + [...new Set(synergies)].slice(0, 2).join(' + '));
      this.synergyText.setColor('#ffcc00');
    } else {
      this.synergyText.setText('— No special synergy —');
      this.synergyText.setColor('#666666');
    }
  }
  
  private updateStatus(): void {
    if (this.mySelected && this.partnerSelected) {
      this.statusText.setText('');
    } else if (this.mySelected) {
      this.statusText.setText('✓ You are ready! Waiting for partner...');
    } else if (this.partnerSelected) {
      this.statusText.setText('Partner is ready! Press ENTER to confirm your selection.');
    } else {
      this.statusText.setText('Select your weapon and press ENTER to lock in.');
    }
  }
  
  private checkBothReady(): void {
    const bothReady = this.mySelected && this.partnerSelected;
    
    if (bothReady) {
      if (this.isHost || this.isSoloMode) {
        // Host shows start button
        this.startPrompt.setText('🎮 PRESS SPACE TO START THE GAME');
        this.startPrompt.setAlpha(1);
        
        this.tweens.add({
          targets: this.startPrompt,
          alpha: 0.6,
          duration: 400,
          yoyo: true,
          repeat: -1
        });
        
        this.input.keyboard?.once('keydown-SPACE', () => {
          if (!this.isSoloMode) {
            network.startGame();
          }
          this.startGame();
        });
      } else {
        // Guest waits for host
        this.startPrompt.setText('⏳ Waiting for host to start...');
        this.startPrompt.setAlpha(1);
      }
    } else {
      this.startPrompt.setAlpha(0);
      this.tweens.killTweensOf(this.startPrompt);
    }
  }
  
  private startGame(): void {
    // Store selections for GameScene
    // Format: local player is always stored as their role
    if (this.playerId === 'player1') {
      this.registry.set('p1Weapon', this.myWeaponId);
      this.registry.set('p2Weapon', this.partnerWeaponId);
    } else {
      this.registry.set('p1Weapon', this.partnerWeaponId);
      this.registry.set('p2Weapon', this.myWeaponId);
    }
    
    console.log(`[WeaponSelect] Starting game - P1: ${this.registry.get('p1Weapon')}, P2: ${this.registry.get('p2Weapon')}`);
    
    // Transition to game
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('GameScene');
    });
  }
  
  private getDamageTypeColor(type: string): string {
    const colors: Record<string, string> = {
      fire: '#ff6600',
      ice: '#00ccff',
      lightning: '#ffff00',
      poison: '#00ff00',
      void: '#9900ff',
      holy: '#ffffcc',
      physical: '#cccccc',
      explosive: '#ff3300'
    };
    return colors[type] || '#ffffff';
  }
  
  shutdown(): void {
    this.weaponManager.destroy();
  }
}
