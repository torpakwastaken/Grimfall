import Phaser from 'phaser';
import { WeaponManager } from '../systems/WeaponManager';
import { UpgradeManager } from '../systems/UpgradeManager';
import { SynergyResolver } from '../systems/SynergyResolver';

/**
 * Test scene to verify weapon/upgrade system is working
 * Access via: Add 'WeaponTestScene' to your scene list and switch to it
 */
export class WeaponTestScene extends Phaser.Scene {
  private weaponManager!: WeaponManager;
  private upgradeManager!: UpgradeManager;
  private synergyResolver!: SynergyResolver;
  private infoText!: Phaser.GameObjects.Text;
  
  constructor() {
    super({ key: 'WeaponTestScene' });
  }
  
  create(): void {
    // Initialize systems
    this.weaponManager = new WeaponManager(this);
    this.upgradeManager = new UpgradeManager(this);
    this.synergyResolver = new SynergyResolver(this);
    
    // Background
    this.cameras.main.setBackgroundColor(0x1a1a2e);
    
    // Title
    this.add.text(400, 30, '⚔️ WEAPON SYSTEM TEST ⚔️', {
      fontSize: '28px',
      color: '#ffcc00',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    
    // Info display
    this.infoText = this.add.text(50, 80, '', {
      fontSize: '14px',
      color: '#ffffff',
      lineSpacing: 8
    });
    
    // Run tests and display results
    this.runTests();
    
    // Instructions
    this.add.text(400, 570, 'Press SPACE to regenerate upgrade offers | ESC to return to menu', {
      fontSize: '14px',
      color: '#888888'
    }).setOrigin(0.5);
    
    // Input handlers
    this.input.keyboard?.on('keydown-SPACE', () => this.runTests());
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('MenuScene'));
  }
  
  private runTests(): void {
    const lines: string[] = [];
    
    // Test 1: Weapon Definitions
    lines.push('📦 WEAPON DEFINITIONS LOADED:');
    const weapons = this.weaponManager.getAllDefinitions();
    weapons.forEach(w => {
      lines.push(`  ${w.icon} ${w.name} (${w.firePattern}) - ${w.damageType} damage`);
      lines.push(`     Base: ${w.baseDamage} dmg, ${w.baseFireRate}/s fire rate`);
      lines.push(`     Tags: ${w.synergyTags.join(', ')}`);
    });
    
    lines.push('');
    lines.push('─'.repeat(60));
    lines.push('');
    
    // Test 2: Create weapon instances
    lines.push('🎮 WEAPON INSTANCES CREATED:');
    const p1Weapon = this.weaponManager.createInstance('fire_thrower', 'player1');
    const p2Weapon = this.weaponManager.createInstance('arc_rifle', 'player2');
    
    if (p1Weapon) {
      lines.push(`  P1: ${this.weaponManager.getDefinition(p1Weapon.definitionId)?.name}`);
      lines.push(`     Stats: ${p1Weapon.currentStats.damage} dmg, ${p1Weapon.currentStats.fireRate}/s`);
    }
    if (p2Weapon) {
      lines.push(`  P2: ${this.weaponManager.getDefinition(p2Weapon.definitionId)?.name}`);
      lines.push(`     Stats: ${p2Weapon.currentStats.damage} dmg, ${p2Weapon.currentStats.fireRate}/s`);
    }
    
    lines.push('');
    lines.push('─'.repeat(60));
    lines.push('');
    
    // Test 3: Initialize players and add weapon tags
    this.upgradeManager.initializePlayer('player1');
    this.upgradeManager.initializePlayer('player2');
    
    if (p1Weapon) {
      this.upgradeManager.addPlayerTags('player1', Array.from(p1Weapon.currentTags));
    }
    if (p2Weapon) {
      this.upgradeManager.addPlayerTags('player2', Array.from(p2Weapon.currentTags));
    }
    
    // Test 4: Generate upgrade offers
    lines.push('🎲 UPGRADE OFFERS FOR PLAYER 1 (Level 5):');
    const p1Tags = this.upgradeManager.getPlayerTags('player1');
    const p2Tags = this.upgradeManager.getPlayerTags('player2');
    
    const offers = this.upgradeManager.generateUpgradeOffers('player1', 5, 3, p2Tags);
    offers.forEach((upgrade, i) => {
      lines.push(`  ${i + 1}. ${upgrade.icon} ${upgrade.name} [${upgrade.rarity}]`);
      lines.push(`     ${upgrade.description}`);
      lines.push(`     Category: ${upgrade.category} | Trigger: ${upgrade.trigger}`);
    });
    
    lines.push('');
    lines.push('─'.repeat(60));
    lines.push('');
    
    // Test 5: Add an upgrade and check stat modifiers
    lines.push('✅ UPGRADE ACQUISITION TEST:');
    const instance = this.upgradeManager.addUpgrade('player1', 'damage_1');
    if (instance) {
      lines.push(`  Added: damage_1 (stacks: ${instance.stacks})`);
      
      const modifiers = this.upgradeManager.calculateStatModifiers('player1');
      lines.push(`  Stat modifiers: ${JSON.stringify(modifiers)}`);
    }
    
    lines.push('');
    lines.push('─'.repeat(60));
    lines.push('');
    
    // Test 6: Show player tags
    lines.push('🏷️ PLAYER TAGS:');
    lines.push(`  P1: ${Array.from(this.upgradeManager.getPlayerTags('player1')).join(', ')}`);
    lines.push(`  P2: ${Array.from(this.upgradeManager.getPlayerTags('player2')).join(', ')}`);
    
    // Update display
    this.infoText.setText(lines.join('\n'));
  }
  
  update(time: number, delta: number): void {
    this.weaponManager.update(time, delta);
    this.synergyResolver.update(time, delta);
  }
  
  shutdown(): void {
    this.weaponManager.destroy();
    this.upgradeManager.destroy();
    this.synergyResolver.destroy();
  }
}
