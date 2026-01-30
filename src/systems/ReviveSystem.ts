import Phaser from 'phaser';
import { Player } from '@/entities/Player';

export class ReviveSystem {
  private scene: Phaser.Scene;
  private reviveTimers: Map<number, number> = new Map();
  private reviveWindow: number = 8000; // 8 seconds
  private gameOverDelay: number = 10000; // 10 seconds for both players dead
  private isHost: boolean = true;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.isHost = scene.registry.get('isHost') ?? true;
    
    // Guest doesn't run revive logic - only host controls player state
    if (!this.isHost) {
      console.log('[ReviveSystem] Skipping setup on guest');
      return;
    }
    
    // Listen for player death events (HOST ONLY)
    this.scene.events.on('playerDied', this.onPlayerDied, this);
    this.scene.events.on('playerRevived', this.onPlayerRevived, this);
  }

  private onPlayerDied(playerId: number): void {
    if (!this.isHost) return;
    
    console.log(`Player ${playerId + 1} died`);
    
    // Start revive timer
    const reviveTime = this.scene.time.now + this.reviveWindow;
    this.reviveTimers.set(playerId, reviveTime);
    
    // Check if both players are dead
    this.checkGameOver();
    
    // Show death notification
    this.scene.events.emit('showNotification', `Player ${playerId + 1} died! Reviving in 8s...`);
  }

  private onPlayerRevived(playerId: number): void {
    if (!this.isHost) return;
    
    console.log(`Player ${playerId + 1} revived`);
    
    // Clear revive timer
    this.reviveTimers.delete(playerId);
    
    // Show revive notification
    this.scene.events.emit('showNotification', `Player ${playerId + 1} revived!`);
  }

  update(time: number): void {
    // GUEST: Skip all revive logic
    if (!this.isHost) return;
    
    // Auto-revive players after timer
    for (const [playerId, reviveTime] of this.reviveTimers) {
      if (time >= reviveTime) {
        this.revivePlayer(playerId);
      }
    }
  }

  private revivePlayer(playerId: number): void {
    const players = (this.scene as any).players.getChildren() as Player[];
    const player = players.find(p => p.playerId === playerId);
    
    if (player && player.isDead) {
      player.revive();
    }
  }

  private checkGameOver(): void {
    if (!this.isHost) return;
    
    const players = (this.scene as any).players.getChildren() as Player[];
    const alivePlayers = players.filter(p => !p.isDead);
    
    if (alivePlayers.length === 0) {
      // Both players dead - start game over timer
      this.scene.time.delayedCall(this.gameOverDelay, () => {
        this.triggerGameOver();
      });
      
      this.scene.events.emit('showNotification', 'Both players down! Game over in 10s...');
    }
  }

  private triggerGameOver(): void {
    // Check one more time if both are still dead
    const players = (this.scene as any).players.getChildren() as Player[];
    const alivePlayers = players.filter(p => !p.isDead);
    
    if (alivePlayers.length === 0) {
      console.log('Game Over!');
      this.scene.events.emit('gameOver');
      this.scene.scene.start('GameOverScene', {
        survived: Math.floor((this.scene as any).spawnSystem.getElapsedTime() / 1000),
        level: (this.scene as any).upgradeSystem.getCurrentLevel()
      });
    }
  }

  reset(): void {
    this.reviveTimers.clear();
  }

  destroy(): void {
    this.scene.events.off('playerDied', this.onPlayerDied, this);
    this.scene.events.off('playerRevived', this.onPlayerRevived, this);
  }
}
