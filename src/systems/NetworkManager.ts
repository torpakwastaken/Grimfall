/**
 * NetworkManager - Handles online multiplayer connections
 * 
 * Architecture:
 * - WebSocket connection to relay server
 * - Room-based matchmaking (shareable links)
 * - State synchronization between players
 * - Handles disconnection/reconnection
 */

export type PlayerId = 'player1' | 'player2';
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'in_room' | 'in_game';

export interface RoomInfo {
  roomCode: string;
  hostId: string;
  guestId?: string;
  hostReady: boolean;
  guestReady: boolean;
  hostWeapon?: string;
  guestWeapon?: string;
}

export interface PlayerState {
  id: PlayerId;
  x: number;
  y: number;
  health: number;
  velocityX: number;
  velocityY: number;
  aimAngle: number;
  isFiring: boolean;
  weaponId: string;
}

export interface GameStateSync {
  timestamp: number;
  players: PlayerState[];
  enemies: EnemyStateSync[];
  projectiles: ProjectileStateSync[];
  wave: number;
  score: number;
}

export interface EnemyStateSync {
  id: string;
  type: string;
  x: number;
  y: number;
  health: number;
}

export interface ProjectileStateSync {
  id: string;
  ownerId: PlayerId;
  x: number;
  y: number;
  angle: number;
}

// Message types for WebSocket communication
export type NetworkMessage = 
  | { type: 'create_room' }
  | { type: 'join_room'; roomCode: string }
  | { type: 'room_created'; roomCode: string }
  | { type: 'room_joined'; roomInfo: RoomInfo }
  | { type: 'player_joined'; playerId: string }
  | { type: 'player_left'; playerId: string }
  | { type: 'weapon_selected'; weaponId: string }
  | { type: 'player_ready'; ready: boolean }
  | { type: 'proceed_to_weapons' }
  | { type: 'game_start' }
  | { type: 'player_input'; input: PlayerInput }
  | { type: 'game_state'; state: GameStateSync }
  | { type: 'enemy_spawned'; enemy: EnemyStateSync }
  | { type: 'enemy_died'; enemyId: string; killerId: PlayerId }
  | { type: 'player_damaged'; playerId: PlayerId; damage: number; newHealth: number }
  | { type: 'player_died'; playerId: PlayerId }
  | { type: 'wave_complete'; wave: number }
  | { type: 'game_over'; finalScore: number }
  | { type: 'level_up'; level: number; upgradeChoices: any[] }
  | { type: 'upgrade_selected'; playerId: number; upgradeId: string }
  | { type: 'upgrades_applied'; selections: { playerId: number; upgradeId: string }[] }
  | { type: 'ping' }
  | { type: 'pong'; latency: number }
  | { type: 'error'; message: string };

export interface PlayerInput {
  timestamp: number;
  moveX: number;      // -1, 0, 1
  moveY: number;      // -1, 0, 1
  aimAngle: number;   // Radians
  firing: boolean;
  specialAbility: boolean;
}

type MessageHandler = (message: NetworkMessage) => void;

export class NetworkManager {
  private static instance: NetworkManager;
  
  private socket: WebSocket | null = null;
  private serverUrl: string = '';
  private connectionState: ConnectionState = 'disconnected';
  private messageHandlers: Map<string, MessageHandler[]> = new Map();
  
  // Room state
  private roomCode: string = '';
  private localPlayerId: PlayerId | null = null;
  private roomInfo: RoomInfo | null = null;
  
  // Latency tracking
  private lastPingTime: number = 0;
  private latency: number = 0;
  private pingInterval: number | null = null;
  
  // Offline/local mode for testing
  private isOfflineMode: boolean = true;
  
  private constructor() {}
  
  static getInstance(): NetworkManager {
    if (!NetworkManager.instance) {
      NetworkManager.instance = new NetworkManager();
    }
    return NetworkManager.instance;
  }
  
  /**
   * Initialize with server URL
   * If no URL provided, runs in offline mode for local testing
   */
  init(serverUrl?: string): void {
    if (serverUrl) {
      this.serverUrl = serverUrl;
      this.isOfflineMode = false;
    } else {
      this.isOfflineMode = true;
      console.log('[Network] Running in offline mode - local testing only');
    }
  }
  
  /**
   * Connect to the relay server
   */
  async connect(): Promise<boolean> {
    if (this.isOfflineMode) {
      this.connectionState = 'connected';
      return true;
    }
    
    return new Promise((resolve) => {
      this.connectionState = 'connecting';
      
      try {
        this.socket = new WebSocket(this.serverUrl);
        
        this.socket.onopen = () => {
          console.log('[Network] Connected to server');
          this.connectionState = 'connected';
          this.startPingLoop();
          resolve(true);
        };
        
        this.socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as NetworkMessage;
            this.handleMessage(message);
          } catch (e) {
            console.error('[Network] Failed to parse message:', e);
          }
        };
        
        this.socket.onclose = () => {
          console.log('[Network] Disconnected from server');
          this.connectionState = 'disconnected';
          this.stopPingLoop();
          this.emit({ type: 'error', message: 'Connection lost' });
        };
        
        this.socket.onerror = (error) => {
          console.error('[Network] WebSocket error:', error);
          this.connectionState = 'disconnected';
          resolve(false);
        };
      } catch (e) {
        console.error('[Network] Failed to connect:', e);
        resolve(false);
      }
    });
  }
  
  /**
   * Create a new room (host)
   */
  async createRoom(): Promise<string> {
    if (this.isOfflineMode) {
      // Generate local room code for testing
      this.roomCode = this.generateRoomCode();
      this.localPlayerId = 'player1';
      this.roomInfo = {
        roomCode: this.roomCode,
        hostId: 'local_host',
        hostReady: false,
        guestReady: false
      };
      this.connectionState = 'in_room';
      console.log(`[Network] Created offline room: ${this.roomCode}`);
      return this.roomCode;
    }
    
    return new Promise((resolve, reject) => {
      const handler = (msg: NetworkMessage) => {
        if (msg.type === 'room_created') {
          this.roomCode = msg.roomCode;
          this.localPlayerId = 'player1';
          this.connectionState = 'in_room';
          this.off('room_created', handler);
          resolve(msg.roomCode);
        } else if (msg.type === 'error') {
          this.off('error', handler);
          reject(new Error(msg.message));
        }
      };
      
      this.on('room_created', handler);
      this.on('error', handler);
      this.send({ type: 'create_room' });
    });
  }
  
  /**
   * Join an existing room (guest)
   */
  async joinRoom(roomCode: string): Promise<RoomInfo> {
    if (this.isOfflineMode) {
      // Simulate joining for local testing
      this.roomCode = roomCode;
      this.localPlayerId = 'player2';
      this.roomInfo = {
        roomCode: roomCode,
        hostId: 'local_host',
        guestId: 'local_guest',
        hostReady: false,
        guestReady: false
      };
      this.connectionState = 'in_room';
      
      // Simulate host notification
      setTimeout(() => {
        this.emit({ type: 'player_joined', playerId: 'local_guest' });
      }, 100);
      
      return this.roomInfo;
    }
    
    return new Promise((resolve, reject) => {
      const handler = (msg: NetworkMessage) => {
        if (msg.type === 'room_joined') {
          this.roomCode = roomCode;
          this.localPlayerId = 'player2';
          this.roomInfo = msg.roomInfo;
          this.connectionState = 'in_room';
          this.off('room_joined', handler);
          resolve(msg.roomInfo);
        } else if (msg.type === 'error') {
          this.off('error', handler);
          reject(new Error(msg.message));
        }
      };
      
      this.on('room_joined', handler);
      this.on('error', handler);
      this.send({ type: 'join_room', roomCode });
    });
  }
  
  /**
   * Select weapon (broadcasts to other player)
   */
  selectWeapon(weaponId: string): void {
    if (this.roomInfo) {
      if (this.localPlayerId === 'player1') {
        this.roomInfo.hostWeapon = weaponId;
      } else {
        this.roomInfo.guestWeapon = weaponId;
      }
    }
    
    this.send({ type: 'weapon_selected', weaponId });
    
    if (this.isOfflineMode) {
      // Echo back for local testing
      this.emit({ type: 'weapon_selected', weaponId });
    }
  }
  
  /**
   * Set ready state
   */
  setReady(ready: boolean): void {
    if (this.roomInfo) {
      if (this.localPlayerId === 'player1') {
        this.roomInfo.hostReady = ready;
      } else {
        this.roomInfo.guestReady = ready;
      }
    }
    
    this.send({ type: 'player_ready', ready });
    
    if (this.isOfflineMode) {
      this.emit({ type: 'player_ready', ready });
    }
  }
  
  /**
   * Send player input (called every frame by local player)
   */
  sendInput(input: PlayerInput): void {
    this.send({ type: 'player_input', input });
  }
  
  /**
   * Send game state (host only, authoritative)
   */
  sendGameState(state: GameStateSync): void {
    if (this.localPlayerId === 'player1') {
      this.send({ type: 'game_state', state });
    }
  }
  
  /**
   * Proceed from lobby to weapon select (host only)
   */
  proceedToWeaponSelect(): void {
    if (this.localPlayerId === 'player1') {
      this.send({ type: 'proceed_to_weapons' });
      
      if (this.isOfflineMode) {
        this.emit({ type: 'proceed_to_weapons' });
      }
    }
  }
  
  /**
   * Start the actual game from weapon select (host only)
   */
  startGame(): void {
    if (this.localPlayerId === 'player1') {
      this.connectionState = 'in_game';
      this.send({ type: 'game_start' });
      
      if (this.isOfflineMode) {
        this.emit({ type: 'game_start' });
      }
    }
  }
  
  /**
   * Send level up data with upgrade choices (host only)
   */
  sendLevelUp(level: number, upgradeChoices: any[]): void {
    if (this.localPlayerId === 'player1') {
      this.send({ type: 'level_up', level, upgradeChoices });
    }
  }
  
  /**
   * Send upgrade selection (from local player)
   */
  sendUpgradeSelection(playerId: number, upgradeId: string): void {
    this.send({ type: 'upgrade_selected', playerId, upgradeId });
  }
  
  /**
   * Send applied upgrades (host only, after both selected)
   */
  sendUpgradesApplied(selections: { playerId: number; upgradeId: string }[]): void {
    if (this.localPlayerId === 'player1') {
      this.send({ type: 'upgrades_applied', selections });
    }
  }
  
  /**
   * Subscribe to network messages
   */
  on(messageType: string, handler: MessageHandler): void {
    if (!this.messageHandlers.has(messageType)) {
      this.messageHandlers.set(messageType, []);
    }
    this.messageHandlers.get(messageType)!.push(handler);
  }
  
  /**
   * Unsubscribe from network messages
   */
  off(messageType: string, handler: MessageHandler): void {
    const handlers = this.messageHandlers.get(messageType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index >= 0) {
        handlers.splice(index, 1);
      }
    }
  }
  
  /**
   * Send message to server
   */
  private send(message: NetworkMessage): void {
    if (this.isOfflineMode) {
      // In offline mode, messages are handled locally
      return;
    }
    
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }
  
  /**
   * Emit message to local handlers (also used for offline mode)
   */
  private emit(message: NetworkMessage): void {
    this.handleMessage(message);
  }
  
  /**
   * Handle incoming message
   */
  private handleMessage(message: NetworkMessage): void {
    // Handle pong specially for latency calculation
    if (message.type === 'pong') {
      this.latency = Date.now() - this.lastPingTime;
      return;
    }
    
    // Notify all handlers for this message type
    const handlers = this.messageHandlers.get(message.type);
    if (handlers) {
      handlers.forEach(handler => handler(message));
    }
    
    // Also notify 'all' handlers
    const allHandlers = this.messageHandlers.get('all');
    if (allHandlers) {
      allHandlers.forEach(handler => handler(message));
    }
  }
  
  /**
   * Start ping loop to measure latency
   */
  private startPingLoop(): void {
    this.pingInterval = window.setInterval(() => {
      this.lastPingTime = Date.now();
      this.send({ type: 'ping' });
    }, 2000);
  }
  
  /**
   * Stop ping loop
   */
  private stopPingLoop(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
  
  /**
   * Generate a random room code
   */
  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
  
  /**
   * Get shareable room URL
   */
  getRoomUrl(): string {
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}?room=${this.roomCode}`;
  }
  
  // Getters
  getConnectionState(): ConnectionState { return this.connectionState; }
  getRoomCode(): string { return this.roomCode; }
  getLocalPlayerId(): PlayerId | null { return this.localPlayerId; }
  getRoomInfo(): RoomInfo | null { return this.roomInfo; }
  getLatency(): number { return this.latency; }
  isHost(): boolean { return this.localPlayerId === 'player1'; }
  isOffline(): boolean { return this.isOfflineMode; }
  
  /**
   * Check if both players are ready
   */
  areBothReady(): boolean {
    if (!this.roomInfo) return false;
    return this.roomInfo.hostReady && this.roomInfo.guestReady;
  }
  
  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    this.stopPingLoop();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.connectionState = 'disconnected';
    this.roomCode = '';
    this.localPlayerId = null;
    this.roomInfo = null;
  }
}

// Export singleton
export const network = NetworkManager.getInstance();
