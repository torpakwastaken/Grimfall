import Phaser from 'phaser';
import { NetworkManager, network, RoomInfo } from '../systems/NetworkManager';
import { RELAY_SERVER_URL } from '../config';

/**
 * LobbyScene - Room creation and joining
 * 
 * Flow:
 * 1. Player can CREATE a room (becomes host) or JOIN with a code
 * 2. Create → Get room code → Share link with friend
 * 3. Join → Enter code from link → Connect to host
 * 4. Both in room → Proceed to weapon selection
 */
export class LobbyScene extends Phaser.Scene {
  private roomCodeText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private copyButton!: Phaser.GameObjects.Text;
  private joinInput: string = '';
  private joinInputText!: Phaser.GameObjects.Text;
  private state: 'menu' | 'creating' | 'hosting' | 'joining' | 'joined' = 'menu';
  
  constructor() {
    super({ key: 'LobbyScene' });
  }
  
  init(): void {
    // Check URL for room code (joined via link)
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');
    if (roomFromUrl) {
      this.joinInput = roomFromUrl.toUpperCase();
      // Auto-join after scene is ready
      this.time.delayedCall(500, () => this.joinRoom());
    }
  }
  
  create(): void {
    const { width, height } = this.scale;
    
    // Background
    this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);
    
    // Title
    this.add.text(width / 2, 80, 'GRIMFALL', {
      fontSize: '64px',
      fontFamily: 'Arial Black',
      color: '#ff4757'
    }).setOrigin(0.5);
    
    this.add.text(width / 2, 130, 'Co-op Survival', {
      fontSize: '24px',
      fontFamily: 'Arial',
      color: '#ffffff'
    }).setOrigin(0.5);
    
    // Main panel
    const panelX = width / 2;
    const panelY = height / 2;
    this.add.rectangle(panelX, panelY, 500, 400, 0x2a2a4e, 0.9)
      .setStrokeStyle(2, 0x4a4a6e);
    
    // Status text (changes based on state)
    this.statusText = this.add.text(panelX, panelY - 150, '', {
      fontSize: '20px',
      fontFamily: 'Arial',
      color: '#aaaaaa',
      align: 'center'
    }).setOrigin(0.5);
    
    // Room code display (shown when hosting)
    this.roomCodeText = this.add.text(panelX, panelY - 50, '', {
      fontSize: '48px',
      fontFamily: 'Courier New',
      color: '#00ff88',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    
    // Copy link button
    this.copyButton = this.add.text(panelX, panelY + 20, '📋 Copy Invite Link', {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: '#4a90d9',
      backgroundColor: '#2a2a4e',
      padding: { x: 15, y: 8 }
    })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setVisible(false)
      .on('pointerover', () => this.copyButton.setColor('#6ab0f9'))
      .on('pointerout', () => this.copyButton.setColor('#4a90d9'))
      .on('pointerdown', () => this.copyRoomLink());
    
    // Join input display
    this.joinInputText = this.add.text(panelX, panelY - 50, '', {
      fontSize: '48px',
      fontFamily: 'Courier New',
      color: '#4a90d9',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    
    // Create/Join buttons (menu state)
    this.createMenuButtons(panelX, panelY);
    
    // Instructions
    this.add.text(panelX, panelY + 160, 'Share the room code with a friend to play together!', {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: '#888888',
      align: 'center'
    }).setOrigin(0.5);
    
    // Network event handlers
    this.setupNetworkHandlers();
    
    // Keyboard input for join code
    this.input.keyboard?.on('keydown', this.handleKeyInput, this);
    
    // Initialize network with server URL from config
    // If RELAY_SERVER_URL is empty, runs in offline mode
    network.init(RELAY_SERVER_URL || undefined);
    
    // Show initial state
    this.showMenuState();
  }
  
  private createMenuButtons(panelX: number, panelY: number): void {
    // Create Room button
    const createBtn = this.add.text(panelX, panelY - 30, '🎮  CREATE ROOM', {
      fontSize: '24px',
      fontFamily: 'Arial Black',
      color: '#ffffff',
      backgroundColor: '#e74c3c',
      padding: { x: 30, y: 15 }
    })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setName('createBtn')
      .on('pointerover', () => createBtn.setStyle({ backgroundColor: '#ff6b5b' }))
      .on('pointerout', () => createBtn.setStyle({ backgroundColor: '#e74c3c' }))
      .on('pointerdown', () => this.createRoom());
    
    // Join Room button
    const joinBtn = this.add.text(panelX, panelY + 50, '🔗  JOIN ROOM', {
      fontSize: '24px',
      fontFamily: 'Arial Black',
      color: '#ffffff',
      backgroundColor: '#3498db',
      padding: { x: 40, y: 15 }
    })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setName('joinBtn')
      .on('pointerover', () => joinBtn.setStyle({ backgroundColor: '#5dade2' }))
      .on('pointerout', () => joinBtn.setStyle({ backgroundColor: '#3498db' }))
      .on('pointerdown', () => this.showJoinState());
    
    // Solo/Practice mode (offline testing)
    const soloBtn = this.add.text(panelX, panelY + 120, 'Solo Practice (Offline)', {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: '#888888'
    })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setName('soloBtn')
      .on('pointerover', () => soloBtn.setColor('#aaaaaa'))
      .on('pointerout', () => soloBtn.setColor('#888888'))
      .on('pointerdown', () => this.startSoloMode());
  }
  
  private showMenuState(): void {
    this.state = 'menu';
    this.statusText.setText('Play with a friend online!');
    this.roomCodeText.setVisible(false);
    this.copyButton.setVisible(false);
    this.joinInputText.setVisible(false);
    
    // Show menu buttons
    const createBtn = this.children.getByName('createBtn') as Phaser.GameObjects.Text;
    const joinBtn = this.children.getByName('joinBtn') as Phaser.GameObjects.Text;
    const soloBtn = this.children.getByName('soloBtn') as Phaser.GameObjects.Text;
    if (createBtn) createBtn.setVisible(true);
    if (joinBtn) joinBtn.setVisible(true);
    if (soloBtn) soloBtn.setVisible(true);
  }
  
  private hideMenuButtons(): void {
    const createBtn = this.children.getByName('createBtn') as Phaser.GameObjects.Text;
    const joinBtn = this.children.getByName('joinBtn') as Phaser.GameObjects.Text;
    const soloBtn = this.children.getByName('soloBtn') as Phaser.GameObjects.Text;
    if (createBtn) createBtn.setVisible(false);
    if (joinBtn) joinBtn.setVisible(false);
    if (soloBtn) soloBtn.setVisible(false);
  }
  
  private async createRoom(): Promise<void> {
    this.state = 'creating';
    this.hideMenuButtons();
    this.statusText.setText('Connecting to server...');
    
    try {
      // Connect to WebSocket server first
      const connected = await network.connect();
      if (!connected) {
        throw new Error('Failed to connect to server');
      }
      
      this.statusText.setText('Creating room...');
      const roomCode = await network.createRoom();
      this.showHostingState(roomCode);
    } catch (e) {
      this.statusText.setText('Failed to create room. Try again.');
      this.showMenuState();
    }
  }
  
  private showHostingState(roomCode: string): void {
    this.state = 'hosting';
    this.statusText.setText('Room Created! Share this code:');
    this.roomCodeText.setText(roomCode).setVisible(true);
    this.copyButton.setVisible(true);
    
    // Add waiting indicator
    const { width, height } = this.scale;
    const waitingText = this.add.text(width / 2, height / 2 + 80, '⏳ Waiting for player 2...', {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: '#ffcc00'
    }).setOrigin(0.5).setName('waitingText');
    
    // Pulsing animation
    this.tweens.add({
      targets: waitingText,
      alpha: 0.5,
      duration: 800,
      yoyo: true,
      repeat: -1
    });
    
    // Back button
    this.createBackButton();
  }
  
  private showJoinState(): void {
    this.state = 'joining';
    this.hideMenuButtons();
    this.statusText.setText('Enter room code:');
    this.joinInput = '';
    this.updateJoinInput();
    this.joinInputText.setVisible(true);
    
    // Instructions
    const { width, height } = this.scale;
    this.add.text(width / 2, height / 2 + 40, 'Type the 6-letter code, then press ENTER', {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: '#888888'
    }).setOrigin(0.5).setName('joinInstructions');
    
    this.createBackButton();
  }
  
  private createBackButton(): void {
    const { width, height } = this.scale;
    const backBtn = this.add.text(width / 2, height / 2 + 150, '← Back', {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: '#888888'
    })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setName('backBtn')
      .on('pointerover', () => backBtn.setColor('#aaaaaa'))
      .on('pointerout', () => backBtn.setColor('#888888'))
      .on('pointerdown', () => {
        network.disconnect();
        this.clearDynamicElements();
        this.showMenuState();
      });
  }
  
  private clearDynamicElements(): void {
    ['waitingText', 'joinInstructions', 'backBtn', 'p2JoinedText'].forEach(name => {
      const obj = this.children.getByName(name);
      if (obj) obj.destroy();
    });
  }
  
  private handleKeyInput(event: KeyboardEvent): void {
    if (this.state !== 'joining') return;
    
    if (event.key === 'Backspace') {
      this.joinInput = this.joinInput.slice(0, -1);
      this.updateJoinInput();
    } else if (event.key === 'Enter' && this.joinInput.length === 6) {
      this.joinRoom();
    } else if (/^[A-Za-z0-9]$/.test(event.key) && this.joinInput.length < 6) {
      this.joinInput += event.key.toUpperCase();
      this.updateJoinInput();
    }
  }
  
  private updateJoinInput(): void {
    // Show input with placeholder underscores
    const display = this.joinInput.padEnd(6, '_').split('').join(' ');
    this.joinInputText.setText(display);
  }
  
  private async joinRoom(): Promise<void> {
    if (this.joinInput.length !== 6) return;
    
    this.statusText.setText('Connecting to server...');
    
    try {
      // Connect to WebSocket server first
      const connected = await network.connect();
      if (!connected) {
        throw new Error('Failed to connect to server');
      }
      
      this.statusText.setText('Joining room...');
      const roomInfo = await network.joinRoom(this.joinInput);
      this.showJoinedState(roomInfo);
    } catch (e) {
      this.statusText.setText('Room not found. Check the code.');
    }
  }
  
  private showJoinedState(roomInfo: RoomInfo): void {
    this.state = 'joined';
    const { width, height } = this.scale;
    
    this.statusText.setText('Connected to room!');
    this.joinInputText.setVisible(false);
    this.roomCodeText.setText(roomInfo.roomCode).setVisible(true);
    
    // Clear join instructions
    const instructions = this.children.getByName('joinInstructions');
    if (instructions) instructions.destroy();
    
    // Show waiting for host
    this.add.text(width / 2, height / 2 + 40, '✓ Connected! Waiting for host to start...', {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: '#00ff88'
    }).setOrigin(0.5).setName('waitingText');
  }
  
  private setupNetworkHandlers(): void {
    // Player joined (host receives this)
    network.on('player_joined', () => {
      if (this.state === 'hosting') {
        const waitingText = this.children.getByName('waitingText') as Phaser.GameObjects.Text;
        if (waitingText) {
          this.tweens.killTweensOf(waitingText);
          waitingText.setText('✓ Player 2 connected!').setColor('#00ff88');
        }
        
        // Show start button for host
        const { width, height } = this.scale;
        const startBtn = this.add.text(width / 2, height / 2 + 120, '▶ START GAME', {
          fontSize: '24px',
          fontFamily: 'Arial Black',
          color: '#ffffff',
          backgroundColor: '#27ae60',
          padding: { x: 30, y: 12 }
        })
          .setOrigin(0.5)
          .setInteractive({ useHandCursor: true })
          .setName('startBtn')
          .on('pointerover', () => startBtn.setStyle({ backgroundColor: '#2ecc71' }))
          .on('pointerout', () => startBtn.setStyle({ backgroundColor: '#27ae60' }))
          .on('pointerdown', () => this.proceedToWeaponSelect());
      }
    });
    
    // Game starting (guest receives this from host)
    network.on('game_start', () => {
      this.proceedToWeaponSelect();
    });
    
    // Player left
    network.on('player_left', () => {
      this.statusText.setText('Other player disconnected');
      this.clearDynamicElements();
      this.time.delayedCall(2000, () => this.showMenuState());
    });
  }
  
  private proceedToWeaponSelect(): void {
    // If host, tell the guest to also proceed
    if (network.isHost()) {
      network.startGame();
    }
    
    // Store network state in registry for other scenes
    this.registry.set('isHost', network.isHost());
    this.registry.set('playerId', network.getLocalPlayerId());
    this.registry.set('roomCode', network.getRoomCode());
    
    this.scene.start('WeaponSelectScene');
  }
  
  private startSoloMode(): void {
    // Solo mode - goes straight to single player game
    this.registry.set('isHost', true);
    this.registry.set('playerId', 'player1');
    this.registry.set('soloMode', true);
    this.scene.start('WeaponSelectScene');
  }
  
  private copyRoomLink(): void {
    const url = network.getRoomUrl();
    
    // Use clipboard API
    navigator.clipboard.writeText(url).then(() => {
      const originalText = this.copyButton.text;
      this.copyButton.setText('✓ Copied!').setColor('#00ff88');
      this.time.delayedCall(2000, () => {
        this.copyButton.setText(originalText).setColor('#4a90d9');
      });
    }).catch(() => {
      // Fallback - show URL
      this.copyButton.setText(url).setColor('#ffcc00');
    });
  }
  
  update(): void {
    // Update latency display if needed
  }
}
