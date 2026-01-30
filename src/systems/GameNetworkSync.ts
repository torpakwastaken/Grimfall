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
  private syncInterval: number = 66; // Send state every 66ms (15 times/sec) - balance between smoothness and performance
  
  // Guest state
  private pendingState: GameStateSync | null = null;
  private partnerInput: LocalInput = { moveX: 0, moveY: 0, aimAngle: 0, firing: false };
  private hasReceivedPartnerInput: boolean = false;
  
  // Entity tracking for guest
  private enemyMap: Map<string, Enemy> = new Map();
  private tempEnemyIdSet: Set<string> = new Set(); // Reusable set to avoid allocations
  
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
    const activeEnemies = enemies.filter(e => e.active).slice(0, 30); // Reduced from 50 to 30
    const enemyStates: EnemyStateSync[] = [];
    for (let i = 0; i < activeEnemies.length; i++) {
      const e = activeEnemies[i];
      enemyStates.push({
        id: e.enemyId || `e${i}`,
        type: e.enemyData?.id || 's',
        x: (e.x + 0.5) | 0, // Fast rounding
        y: (e.y + 0.5) | 0,
        health: (e.health?.current + 0.5) | 0 || 0
      });
    }
    
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
   * Heavily optimized to minimize CPU usage
   */
  applyState(
    state: GameStateSync,
    players: Player[],
    enemies: Phaser.GameObjects.Group,
    spawnSystem: any
  ): void {
    if (this.isHost) return;
    
    // Apply player states (fast - only 2 players)
    const p0 = state.players[0];
    const p1 = state.players[1];
    const player0 = players[0];
    const player1 = players[1];
    
    if (player0 && p0) {
      player0.x += (p0.x - player0.x) * 0.3;
      player0.y += (p0.y - player0.y) * 0.3;
      if (player0.health) player0.health.setCurrent(p0.health);
    }
    if (player1 && p1) {
      player1.x += (p1.x - player1.x) * 0.3;
      player1.y += (p1.y - player1.y) * 0.3;
      if (player1.health) player1.health.setCurrent(p1.health);
    }
    
    // Build set of active enemy IDs from state (reuse set)
    const stateEnemyIds = this.tempEnemyIdSet;
    stateEnemyIds.clear();
    const stateEnemyMap = new Map<string, EnemyStateSync>();
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      stateEnemyIds.add(e.id);
      stateEnemyMap.set(e.id, e);
    }
    
    // Get all current enemies once
    const currentEnemies = enemies.getChildren() as Enemy[];
    const inactivePool: Enemy[] = [];
    
    // Single pass: deactivate dead enemies, update existing, collect inactive
    for (let i = 0; i < currentEnemies.length; i++) {
      const enemy = currentEnemies[i];
      const enemyId = enemy.enemyId;
      
      if (!enemy.active) {
        inactivePool.push(enemy);
        continue;
      }
      
      if (!enemyId || !stateEnemyIds.has(enemyId)) {
        // Enemy not in state - deactivate
        enemy.setActive(false);
        enemy.setVisible(false);
        if (enemyId) this.enemyMap.delete(enemyId);
        inactivePool.push(enemy);
      } else {
        // Update existing enemy position
        const es = stateEnemyMap.get(enemyId)!;
        enemy.x += (es.x - enemy.x) * 0.3;
        enemy.y += (es.y - enemy.y) * 0.3;
        if (enemy.health) enemy.health.setCurrent(es.health);
        // Remove from state map so we don't spawn it
        stateEnemyMap.delete(enemyId);
      }
    }
    
    // Spawn only new enemies (ones left in stateEnemyMap)
    let poolIdx = 0;
    for (const [id, es] of stateEnemyMap) {
      if (poolIdx >= inactivePool.length) break;
      
      const enemy = inactivePool[poolIdx++];
      enemy.spawnSimple(es.type, es.x, es.y, es.health);
      enemy.enemyId = id;
      this.enemyMap.set(id, enemy);
    }
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
