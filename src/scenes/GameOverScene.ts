import Phaser from 'phaser';

export class GameOverScene extends Phaser.Scene {
  private survived!: number;
  private level!: number;

  constructor() {
    super('GameOverScene');
  }

  init(data: any): void {
    this.survived = data.survived || 0;
    this.level = data.level || 1;
  }

  create(): void {
    const cam = this.cameras.main;
    const centerX = cam.width / 2;
    const centerY = cam.height / 2;

    // Background
    this.add.rectangle(0, 0, cam.width, cam.height, 0x000000, 0.9).setOrigin(0);

    // Title
    this.add.text(centerX, centerY - 150, 'GAME OVER', {
      fontSize: '64px',
      color: '#ff0000',
      stroke: '#000000',
      strokeThickness: 8
    }).setOrigin(0.5);

    // Stats
    const minutes = Math.floor(this.survived / 60);
    const seconds = this.survived % 60;
    const timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    this.add.text(centerX, centerY - 50, `Time Survived: ${timeText}`, {
      fontSize: '32px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5);

    this.add.text(centerX, centerY, `Level Reached: ${this.level}`, {
      fontSize: '32px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5);

    // Restart button
    const restartButton = this.add.text(centerX, centerY + 100, 'Press SPACE to Restart', {
      fontSize: '24px',
      color: '#ffff00',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5);

    // Pulsing animation
    this.tweens.add({
      targets: restartButton,
      alpha: 0.5,
      duration: 800,
      yoyo: true,
      repeat: -1
    });

    // Menu button
    this.add.text(centerX, centerY + 150, 'Press ESC for Menu', {
      fontSize: '18px',
      color: '#cccccc',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);

    // Input
    this.input.keyboard?.once('keydown-SPACE', () => {
      this.scene.start('GameScene');
    });

    this.input.keyboard?.once('keydown-ESC', () => {
      this.scene.start('MenuScene');
    });
  }
}
