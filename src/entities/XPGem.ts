import Phaser from 'phaser';
import { PooledObject } from '@/types/GameTypes';

export class XPGem extends Phaser.Physics.Arcade.Sprite implements PooledObject {
  public active: boolean = false;
  public xpValue: number = 0;
  
  private pulseTimer: number = 0;
  private magnetRadius: number = 150;
  private magnetSpeed: number = 300;
  private isMagnetized: boolean = false;
  private targetPlayer: any = null;

  constructor(scene: Phaser.Scene) {
    // Create texture first before calling super
    const textureKey = 'gem';
    if (!scene.textures.exists(textureKey)) {
      const graphics = scene.add.graphics();
      graphics.fillStyle(0x00ffff);
      graphics.fillCircle(5, 5, 5);
      graphics.generateTexture(textureKey, 10, 10);
      graphics.destroy();
    }
    
    super(scene, 0, 0, textureKey);
    scene.add.existing(this);
    scene.physics.add.existing(this);
  }

  activate(x: number, y: number, value: number): void {
    this.active = true;
    this.setActive(true);
    this.setVisible(true);
    this.setPosition(x, y);
    
    this.xpValue = value;
    this.isMagnetized = false;
    this.targetPlayer = null;
    this.pulseTimer = 0;
    
    // Size based on value
    const size = Math.min(5 + value * 0.5, 12);
    this.setScale(size / 5);
    
    // Color based on value
    const color = value > 10 ? 0xffff00 : (value > 5 ? 0x00ff00 : 0x00ffff);
    this.setTint(color);
    
    // Initial pop animation
    this.setScale(0.5);
    this.scene.tweens.add({
      targets: this,
      scale: size / 5,
      duration: 200,
      ease: 'Back.easeOut'
    });
  }

  reset(): void {
    this.active = false;
    this.setActive(false);
    this.setVisible(false);
    this.xpValue = 0;
    this.isMagnetized = false;
    this.targetPlayer = null;
  }

  deactivate(): void {
    this.reset();
  }

  update(time: number, delta: number, players: any[]): void {
    if (!this.active) return;
    if (!players || !Array.isArray(players)) return;

    // Pulse effect
    this.pulseTimer += delta;
    const pulse = Math.sin(this.pulseTimer * 0.005) * 0.1 + 1;
    this.setScale(pulse);

    // Check for nearby players to magnetize
    if (!this.isMagnetized) {
      for (const player of players) {
        if (!player.active || player.isDead) continue;
        
        const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
        if (dist <= this.magnetRadius) {
          this.isMagnetized = true;
          this.targetPlayer = player;
          break;
        }
      }
    }

    // Move toward player if magnetized
    if (this.isMagnetized && this.targetPlayer) {
      const angle = Phaser.Math.Angle.Between(
        this.x, this.y,
        this.targetPlayer.x, this.targetPlayer.y
      );
      
      const body = this.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(
        Math.cos(angle) * this.magnetSpeed,
        Math.sin(angle) * this.magnetSpeed
      );
    }
  }

  collect(): void {
    // Collection animation
    this.scene.tweens.add({
      targets: this,
      scale: 1.5,
      alpha: 0,
      duration: 150,
      ease: 'Power2',
      onComplete: () => {
        this.deactivate();
      }
    });
  }
}
