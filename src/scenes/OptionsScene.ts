import Phaser from 'phaser';
import { NetworkManager } from '@/systems/NetworkManager';

export class OptionsScene extends Phaser.Scene {
  constructor() {
    super('OptionsScene');
  }
  
  private sendResume(): void {
    const network = NetworkManager.getInstance();
    if (network && network.isOnline()) {
      network.sendResume();
    }
  }

  create(): void {
    const cam = this.cameras.main;
    const centerX = cam.width / 2;
    const centerY = cam.height / 2;

    // Background
    this.add.rectangle(0, 0, cam.width, cam.height, 0x000000, 0.85).setOrigin(0);

    // Title
    this.add.text(centerX, centerY - 120, 'OPTIONS', {
      fontSize: '48px',
      color: '#ffff00',
      stroke: '#000000',
      strokeThickness: 6
    }).setOrigin(0.5);

    // Resume button
    const resumeBtn = this.add.text(centerX, centerY, 'Resume', {
      fontSize: '32px',
      color: '#00ff00',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    resumeBtn.on('pointerdown', () => {
      this.sendResume();
      this.scene.stop('OptionsScene');
      this.scene.resume('GameScene');
    });

    // Quit button
    const quitBtn = this.add.text(centerX, centerY + 60, 'Quit to Menu', {
      fontSize: '32px',
      color: '#ff4444',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    quitBtn.on('pointerdown', () => {
      this.scene.stop('OptionsScene');
      this.scene.stop('GameScene');
      this.scene.start('MenuScene');
    });

    // ESC key to resume
    this.input.keyboard?.on('keydown-ESC', () => {
      this.sendResume();
      this.scene.stop('OptionsScene');
      this.scene.resume('GameScene');
    });
  }
}
