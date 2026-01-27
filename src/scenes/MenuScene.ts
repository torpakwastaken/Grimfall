import Phaser from 'phaser';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create(): void {
    const cam = this.cameras.main;
    const centerX = cam.width / 2;
    const centerY = cam.height / 2;

    // Background
    this.add.rectangle(0, 0, cam.width, cam.height, 0x0a0a0a).setOrigin(0);

    // Title
    this.add.text(centerX, centerY - 200, 'DUO HORDE', {
      fontSize: '72px',
      color: '#ff0000',
      stroke: '#000000',
      strokeThickness: 10,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.add.text(centerX, centerY - 140, 'SURVIVOR', {
      fontSize: '72px',
      color: '#0000ff',
      stroke: '#000000',
      strokeThickness: 10,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Subtitle
    this.add.text(centerX, centerY - 80, 'Grimdark Sci-Fi Co-op Chaos', {
      fontSize: '20px',
      color: '#888888',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);

    // Start button
    const startButton = this.add.text(centerX, centerY + 20, 'Press SPACE to Start', {
      fontSize: '32px',
      color: '#ffff00',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5);

    // Pulsing animation
    this.tweens.add({
      targets: startButton,
      scale: 1.1,
      duration: 800,
      yoyo: true,
      repeat: -1
    });

    // Controls info
    const controlsY = centerY + 100;
    this.add.text(centerX - 250, controlsY, 'Player 1 Controls:', {
      fontSize: '18px',
      color: '#ff0000',
      stroke: '#000000',
      strokeThickness: 3
    });

    this.add.text(centerX - 250, controlsY + 30, 'WASD - Move', {
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2
    });

    this.add.text(centerX - 250, controlsY + 55, 'SHIFT - Heavy Weapon', {
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2
    });

    this.add.text(centerX + 50, controlsY, 'Player 2 Controls:', {
      fontSize: '18px',
      color: '#0000ff',
      stroke: '#000000',
      strokeThickness: 3
    });

    this.add.text(centerX + 50, controlsY + 30, 'Arrow Keys - Move', {
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2
    });

    this.add.text(centerX + 50, controlsY + 55, 'SPACE - Heavy Weapon', {
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2
    });

    // Game info
    this.add.text(centerX, cam.height - 80, 'Survive waves of enemies', {
      fontSize: '16px',
      color: '#cccccc',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5);

    this.add.text(centerX, cam.height - 55, 'Work together to unlock powerful synergies', {
      fontSize: '16px',
      color: '#cccccc',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5);

    this.add.text(centerX, cam.height - 30, 'Both players must survive or it\'s GAME OVER', {
      fontSize: '16px',
      color: '#ff8888',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5);

    // Input
    this.input.keyboard?.once('keydown-SPACE', () => {
      this.scene.start('GameScene');
    });
  }
}
