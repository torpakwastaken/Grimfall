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
import { network, PlayerId, PlayerInput, GameStateSync, PlayerState, EnemyStateSync, ProjectileStateSync } from './NetworkManager';
import { Player } from '@/entities/Player';
import { Enemy } from '@/entities/Enemy';
import { Projectile } from '@/entities/Projectile';

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
  
  // Sync timing - 33ms = 30 updates/sec for smoother gameplay
  private lastSyncTime: number = 0;
  private syncInterval: number = 33;
  
  // Guest state
  private pendingState: GameStateSync | null = null;
  private partnerInput: LocalInput = { moveX: 0, moveY: 0, aimAngle: 0, firing: false };
  private hasReceivedPartnerInput: boolean = false;
  
  // Track which enemies are currently active on guest (by pool index)
  private activeEnemyCount: number = 0;
  private activeProjectileCount: number = 0;
  
  // Input throttling - only send when changed
  private lastSentInput: string = '';
  
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
    projectiles: Projectile[],
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
    const enemyStates: EnemyStateSync[] = [];
    let enemyCount = 0;
    for (let i = 0; i < enemies.length && enemyCount < 30; i++) {
      const e = enemies[i];
      if (!e.active) continue;
      enemyStates.push({
        id: e.enemyId || `e${enemyCount}`,
        type: e.enemyData?.id || 'swarmer', // Use full type name for texture lookup
        x: (e.x + 0.5) | 0,
        y: (e.y + 0.5) | 0,
        health: (e.health?.current + 0.5) | 0 || 0
      });
      enemyCount++;
    }
    
    // Build projectile states (limit to 20 for performance)
    const projectileStates: ProjectileStateSync[] = [];
    let projCount = 0;
    for (let i = 0; i < projectiles.length && projCount < 20; i++) {
      const p = projectiles[i];
      if (!p.active) continue;
      const body = p.body as Phaser.Physics.Arcade.Body;
      projectileStates.push({
        id: `p${projCount}`,
        ownerId: p.ownerId === 0 ? 'player1' : 'player2',
        x: (p.x + 0.5) | 0,
        y: (p.y + 0.5) | 0,
        angle: body ? Math.atan2(body.velocity.y, body.velocity.x) : 0
      });
      projCount++;
    }
    
    const state: GameStateSync = {
      timestamp: now,
      players: playerStates,
      enemies: enemyStates,
      projectiles: projectileStates,
      wave,
      score,
      elapsedTime
    };
    
    network.sendGameState(state);
  }
  
  /**
   * Called every frame by guest to send their input
   * OPTIMIZED: Only sends when input changes
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
    
    // Create a simple hash to detect changes
    const inputHash = `${moveX},${moveY},${input.firing ? 1 : 0}`;
    
    // Only send if input changed
    if (inputHash === this.lastSentInput) return;
    this.lastSentInput = inputHash;
    
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
   * ULTRA-OPTIMIZED: No loops over inactive enemies, minimal work
   */
  applyState(
    state: GameStateSync,
    players: Player[],
    enemies: Phaser.GameObjects.Group,
    projectiles: Phaser.GameObjects.Group,
    spawnSystem: any
  ): void {
    if (this.isHost) return;
    
    // Update elapsed time on spawn system for HUD
    if (spawnSystem && state.elapsedTime !== undefined) {
      spawnSystem.setElapsedTime(state.elapsedTime);
    }
    
    // Apply player states (fast - only 2 players)
    const p0 = state.players[0];
    const p1 = state.players[1];
    const player0 = players[0];
    const player1 = players[1];
    
    // Smoother interpolation for players (0.4 = balance between responsive and smooth)
    const playerLerp = 0.4;
    if (player0 && p0) {
      player0.x += (p0.x - player0.x) * playerLerp;
      player0.y += (p0.y - player0.y) * playerLerp;
      if (player0.health) player0.health.setCurrent(p0.health);
    }
    if (player1 && p1) {
      player1.x += (p1.x - player1.x) * playerLerp;
      player1.y += (p1.y - player1.y) * playerLerp;
      if (player1.health) player1.health.setCurrent(p1.health);
    }
    
    // === OPTIMIZED ENEMY SYNC ===
    // Only touch enemies that need to change state
    const currentEnemies = enemies.getChildren() as Enemy[];
    const stateEnemies = state.enemies;
    const newCount = stateEnemies.length;
    const oldCount = this.activeEnemyCount;
    
    // Interpolation factor - higher = snappier, lower = smoother
    const lerpFactor = 0.5;
    
    // Update existing active enemies (indices 0 to min(old, new))
    const updateCount = Math.min(oldCount, newCount);
    for (let i = 0; i < updateCount; i++) {
      const es = stateEnemies[i];
      const enemy = currentEnemies[i];
      
      // Smooth interpolation for existing enemies
      enemy.x += (es.x - enemy.x) * lerpFactor;
      enemy.y += (es.y - enemy.y) * lerpFactor;
      
      // Sync health for HP bar display
      if (enemy.health && es.health !== undefined) {
        enemy.health.setCurrent(es.health);
      }
      
      // Only change texture if type changed
      const textureKey = `enemy_${es.type}_sprite`;
      if (enemy.texture.key !== textureKey && enemy.scene.textures.exists(textureKey)) {
        enemy.setTexture(textureKey);
      }
    }
    
    // Activate new enemies (if newCount > oldCount)
    for (let i = oldCount; i < newCount && i < currentEnemies.length; i++) {
      const es = stateEnemies[i];
      const enemy = currentEnemies[i];
      
      enemy.setActive(true);
      enemy.setVisible(true);
      // New enemies snap to position immediately
      enemy.x = es.x;
      enemy.y = es.y;
      
      const textureKey = `enemy_${es.type}_sprite`;
      if (enemy.scene.textures.exists(textureKey)) {
        enemy.setTexture(textureKey);
      }
      
      // Initialize HP bar and health for guest display
      enemy.initHPBarForGuest();
      if (enemy.health && es.health !== undefined) {
        enemy.health.setCurrent(es.health);
      }
    }
    
    // Deactivate excess enemies (if oldCount > newCount)
    for (let i = newCount; i < oldCount && i < currentEnemies.length; i++) {
      const enemy = currentEnemies[i];
      enemy.setActive(false);
      enemy.setVisible(false);
    }
    
    // Remember count for next frame
    this.activeEnemyCount = newCount;
    
    // === PROJECTILE SYNC ===
    const currentProjectiles = projectiles.getChildren() as Projectile[];
    const stateProjectiles = state.projectiles || [];
    const newProjCount = stateProjectiles.length;
    const oldProjCount = this.activeProjectileCount;
    
    // Update existing active projectiles
    const updateProjCount = Math.min(oldProjCount, newProjCount);
    for (let i = 0; i < updateProjCount; i++) {
      const ps = stateProjectiles[i];
      const proj = currentProjectiles[i];
      if (!proj) continue;
      
      proj.x = ps.x;
      proj.y = ps.y;
      proj.setRotation(ps.angle);
    }
    
    // Activate new projectiles
    for (let i = oldProjCount; i < newProjCount && i < currentProjectiles.length; i++) {
      const ps = stateProjectiles[i];
      const proj = currentProjectiles[i];
      if (!proj) continue;
      
      proj.setActive(true);
      proj.setVisible(true);
      proj.x = ps.x;
      proj.y = ps.y;
      proj.setRotation(ps.angle);
      // Set color based on owner
      const ownerId = ps.ownerId === 'player1' ? 0 : 1;
      proj.setTint(ownerId === 0 ? 0xff6666 : 0x6666ff);
    }
    
    // Deactivate excess projectiles
    for (let i = newProjCount; i < oldProjCount && i < currentProjectiles.length; i++) {
      const proj = currentProjectiles[i];
      if (proj) {
        proj.setActive(false);
        proj.setVisible(false);
      }
    }
    
    this.activeProjectileCount = newProjCount;
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
    // Cleanup if needed
  }
}
