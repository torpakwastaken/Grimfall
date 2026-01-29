/**
 * GameNetworkSync - Handles real-time game state synchronization
 * 
 * Architecture:
 * - HOST: Runs the actual game, sends state every frame
 * - GUEST: Sends input, receives and applies state from host
 * 
 * What gets synced:
 * - Player positions, health, facing direction
 * - Enemy positions, health, types
 * - Wave number, score, timer
 * - Projectile positions (simplified)
 */

import Phaser from 'phaser';
import { network, PlayerId, PlayerInput, GameStateSync, PlayerState, EnemyStateSync } from './NetworkManager';
import { Player } from '@/entities/Player';
import { Enemy } from '@/entities/Enemy';

export interface LocalInput {
  moveX: number;
  moveY: number;
  aimAngle: number;
  firing: boolean;
}

export class GameNetworkSync {
  private scene: Phaser.Scene;
  private isHost: boolean;
  private playerId: PlayerId;
  
  // Sync timing
  private lastSyncTime: number = 0;
  private syncInterval: number = 50; // Send state every 50ms (20 times/sec)
  
  // Guest state
  private pendingState: GameStateSync | null = null;
  private partnerInput: LocalInput = { moveX: 0, moveY: 0, aimAngle: 0, firing: false };
  private hasReceivedPartnerInput: boolean = false;
  
  // Entity tracking for guest
  private enemyMap: Map<string, Enemy> = new Map();
  
  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.isHost = scene.registry.get('isHost') ?? true;
    this.playerId = scene.registry.get('playerId') ?? 'player1';
    
    this.setupNetworkHandlers();
    
    console.log(`[GameSync] Initialized as ${this.isHost ? 'HOST' : 'GUEST'} (${this.playerId})`);
  }
  
  private setupNetworkHandlers(): void {
    // Receive partner's input (host receives guest input)
    network.on('player_input', (msg: any) => {
      if (msg.type === 'player_input' && msg.input) {
        this.partnerInput = {
          moveX: msg.input.moveX,
          moveY: msg.input.moveY,
          aimAngle: msg.input.aimAngle,
          firing: msg.input.firing
        };
        this.hasReceivedPartnerInput = true;
      }
    });
    
    // Receive game state (guest receives from host)
    network.on('game_state', (msg: any) => {
      if (msg.type === 'game_state' && msg.state) {
        this.pendingState = msg.state;
      }
    });
  }
  
  /**
   * Called every frame by host to broadcast state
   */
  sendState(
    players: Player[],
    enemies: Enemy[],
    wave: number,
    score: number,
    elapsedTime: number
  ): void {
    if (!this.isHost) return;
    
    const now = Date.now();
    if (now - this.lastSyncTime < this.syncInterval) return;
    this.lastSyncTime = now;
    
    // Build player states
    const playerStates: PlayerState[] = players.map((p, i) => ({
      id: i === 0 ? 'player1' : 'player2',
      x: Math.round(p.x),
      y: Math.round(p.y),
      health: Math.round(p.health.current),
      velocityX: Math.round((p.body as Phaser.Physics.Arcade.Body)?.velocity.x || 0),
      velocityY: Math.round((p.body as Phaser.Physics.Arcade.Body)?.velocity.y || 0),
      aimAngle: 0, // Not used yet
      isFiring: false, // Auto-fire handles this
      weaponId: p.weapon?.config?.id || 'default'
    }));
    
    // Build enemy states (limit to prevent huge packets)
    const activeEnemies = enemies.filter(e => e.active).slice(0, 50);
    const enemyStates: EnemyStateSync[] = activeEnemies.map(e => ({
      id: e.enemyId || `enemy_${Math.round(e.x)}_${Math.round(e.y)}`,
      type: e.enemyData?.id || 'swarmer',
      x: Math.round(e.x),
      y: Math.round(e.y),
      health: Math.round(e.health?.current || 0)
    }));
    
    const state: GameStateSync = {
      timestamp: now,
      players: playerStates,
      enemies: enemyStates,
      projectiles: [], // Simplified - don't sync projectiles, let each client render their own
      wave,
      score
    };
    
    network.sendGameState(state);
  }
  
  /**
   * Called every frame by guest to send their input
   */
  sendInput(player: Player): void {
    if (this.isHost) return;
    
    const input = player.getInputState();
    
    // Convert to network format
    let moveX = 0;
    let moveY = 0;
    if (input.left) moveX -= 1;
    if (input.right) moveX += 1;
    if (input.up) moveY -= 1;
    if (input.down) moveY += 1;
    
    const playerInput: PlayerInput = {
      timestamp: Date.now(),
      moveX,
      moveY,
      aimAngle: 0,
      firing: input.firing,
      specialAbility: false
    };
    
    network.sendInput(playerInput);
  }
  
  /**
   * Get partner's input (host uses this to control P2)
   * Returns in key-press format for easier use
   */
  getPartnerInput(): { up: boolean; down: boolean; left: boolean; right: boolean; firing: boolean } | null {
    // Only return input if we've received at least one input packet from partner
    if (!this.hasReceivedPartnerInput) {
      return null;
    }
    
    return {
      up: this.partnerInput.moveY < 0,
      down: this.partnerInput.moveY > 0,
      left: this.partnerInput.moveX < 0,
      right: this.partnerInput.moveX > 0,
      firing: this.partnerInput.firing
    };
  }
  
  /**
   * Get pending state from host (guest uses this)
   */
  getPendingState(): GameStateSync | null {
    const state = this.pendingState;
    this.pendingState = null;
    return state;
  }
  
  /**
   * Apply received state to game entities (guest only)
   */
  applyState(
    state: GameStateSync,
    players: Player[],
    enemies: Phaser.GameObjects.Group,
    spawnSystem: any
  ): void {
    if (this.isHost) return;
    
    // Apply player states
    state.players.forEach((ps, i) => {
      const player = players[i];
      if (player) {
        // Interpolate position for smooth movement
        const lerpFactor = 0.3;
        player.x = Phaser.Math.Linear(player.x, ps.x, lerpFactor);
        player.y = Phaser.Math.Linear(player.y, ps.y, lerpFactor);
        
        // Set health using the new method
        if (player.health) {
          player.health.setCurrent(ps.health);
        }
      }
    });
    
    // Apply enemy states
    const currentEnemies = enemies.getChildren() as Enemy[];
    const stateEnemyIds = new Set(state.enemies.map(e => e.id));
    
    // Deactivate enemies not in state
    currentEnemies.forEach(enemy => {
      if (enemy.active && enemy.enemyId && !stateEnemyIds.has(enemy.enemyId)) {
        enemy.setActive(false);
        enemy.setVisible(false);
      }
    });
    
    // Update or spawn enemies from state
    state.enemies.forEach(es => {
      let enemy = this.enemyMap.get(es.id);
      
      if (!enemy || !enemy.active) {
        // Find inactive enemy to reuse
        enemy = currentEnemies.find(e => !e.active) as Enemy;
        if (enemy) {
          enemy.spawn(es.type, es.x, es.y, 1, es.health);
          enemy.enemyId = es.id;
          this.enemyMap.set(es.id, enemy);
        }
      } else {
        // Update existing enemy position
        const lerpFactor = 0.3;
        enemy.x = Phaser.Math.Linear(enemy.x, es.x, lerpFactor);
        enemy.y = Phaser.Math.Linear(enemy.y, es.y, lerpFactor);
        if (enemy.health) {
          enemy.health.setCurrent(es.health);
        }
      }
    });
  }
  
  isHostPlayer(): boolean {
    return this.isHost;
  }
  
  getPlayerId(): PlayerId {
    return this.playerId;
  }
  
  /**
   * Get which player index the local player controls
   * Host = Player 0 (index 0)
   * Guest = Player 1 (index 1)
   */
  getLocalPlayerIndex(): number {
    return this.isHost ? 0 : 1;
  }
  
  destroy(): void {
    this.enemyMap.clear();
  }
}
