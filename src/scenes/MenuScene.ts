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
    this.add.text(centerX, centerY - 200, 'GRIMFALL', {
      fontSize: '80px',
      color: '#ff4757',
      stroke: '#000000',
      strokeThickness: 10,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.add.text(centerX, centerY - 130, 'CO-OP SURVIVOR', {
      fontSize: '36px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 6,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Subtitle
    this.add.text(centerX, centerY - 80, 'Play together online with a friend', {
      fontSize: '20px',
      color: '#888888',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);

    // Start button
    const startButton = this.add.text(centerX, centerY + 20, '🎮  PLAY ONLINE', {
      fontSize: '36px',
      color: '#ffff00',
      stroke: '#000000',
      strokeThickness: 4,
      fontStyle: 'bold'
    }).setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => startButton.setScale(1.1))
      .on('pointerout', () => startButton.setScale(1))
      .on('pointerdown', () => this.scene.start('LobbyScene'));

    // Pulsing animation
    this.tweens.add({
      targets: startButton,
      scale: 1.05,
      duration: 800,
      yoyo: true,
      repeat: -1
    });

    this.add.text(centerX, centerY + 70, 'Press SPACE or click to continue', {
      fontSize: '16px',
      color: '#666666'
    }).setOrigin(0.5);

    // How it works
    const infoY = centerY + 130;
    this.add.text(centerX, infoY, 'How to Play:', {
      fontSize: '18px',
      color: '#4ecdc4',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    const steps = [
      '1. Create a room or join with a friend\'s code',
      '2. Each player picks their weapon',
      '3. Survive waves of enemies together',
      '4. Combine abilities for powerful synergies!'
    ];
    
    steps.forEach((step, i) => {
      this.add.text(centerX, infoY + 30 + i * 22, step, {
        fontSize: '14px',
        color: '#aaaaaa'
      }).setOrigin(0.5);
    });

    // Footer
    this.add.text(centerX, cam.height - 30, 'Share the room code with a friend to play together!', {
      fontSize: '14px',
      color: '#ff8888',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5);

    // Input - go to lobby (online multiplayer)
    this.input.keyboard?.once('keydown-SPACE', () => {
      this.scene.start('LobbyScene');
    });
    
    // Also allow mouse click
    this.input.once('pointerdown', () => {
      this.scene.start('LobbyScene');
    });
  }
}
