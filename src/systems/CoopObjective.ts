import Phaser from 'phaser';
import { Player } from '@/entities/Player';
import { PALETTE } from '@/systems/AnimationSystem';

/**
 * CoopObjective - Forces both players to work together
 * 
 * Types:
 * - dual_zone: Two zones that BOTH must be occupied simultaneously
 * - rescue: One player down, other must clear area to revive fast
 * - shield_generator: One holds, one clears
 */

interface DualZoneConfig {
  duration: number;     // How long objective lasts
  zoneRadius: number;   // Size of each zone
  chargeRate: number;   // Progress per second when both occupied
  decayRate: number;    // Progress loss when not both occupied
}

export class CoopObjective {
  private scene: Phaser.Scene;
  private type: string;
  private active: boolean = false;
  private progress: number = 0;
  private duration: number;
  
  // Dual zone specific
  private zone1!: Phaser.GameObjects.Arc;
  private zone2!: Phaser.GameObjects.Arc;
  private zone1Indicator!: Phaser.GameObjects.Text;
  private zone2Indicator!: Phaser.GameObjects.Text;
  private progressBar!: Phaser.GameObjects.Graphics;
  private progressBg!: Phaser.GameObjects.Rectangle;
  private titleText!: Phaser.GameObjects.Text;
  private config: DualZoneConfig;
  
  // State
  private zone1Occupied: boolean = false;
  private zone2Occupied: boolean = false;
  private completed: boolean = false;
  private failed: boolean = false;
  private timeRemaining: number = 0;

  constructor(scene: Phaser.Scene, type: string, config?: Partial<DualZoneConfig>) {
    this.scene = scene;
    this.type = type;
    this.config = {
      duration: 15000,
      zoneRadius: 60,
      chargeRate: 8,    // 100 / 12.5 seconds if both in zone
      decayRate: 3,     // Slowly decays if not both occupied
      ...config
    };
    this.duration = this.config.duration;
  }

  start(arena: { width: number; height: number; centerX: number; centerY: number }): void {
    this.active = true;
    this.progress = 0;
    this.timeRemaining = this.duration;
    this.completed = false;
    this.failed = false;
    
    if (this.type === 'dual_zone') {
      this.createDualZones(arena);
    }
    
    // Announcement
    this.showAnnouncement('⚠️ OBJECTIVE: Both zones!');
  }

  private createDualZones(arena: any): void {
    // Position zones on opposite sides of arena
    const offsetX = arena.width * 0.3;
    const zone1X = arena.centerX - offsetX;
    const zone2X = arena.centerX + offsetX;
    const zoneY = arena.centerY;
    
    // Zone 1 (P1 side - red tint)
    this.zone1 = this.scene.add.arc(zone1X, zoneY, this.config.zoneRadius, 0, 360, false, PALETTE.P1_PRIMARY, 0.15);
    this.zone1.setStrokeStyle(3, PALETTE.P1_PRIMARY, 0.6);
    this.zone1.setDepth(1);
    
    this.zone1Indicator = this.scene.add.text(zone1X, zoneY - this.config.zoneRadius - 15, '🟥', {
      fontSize: '24px'
    }).setOrigin(0.5).setDepth(1000);
    
    // Zone 2 (P2 side - blue tint)
    this.zone2 = this.scene.add.arc(zone2X, zoneY, this.config.zoneRadius, 0, 360, false, PALETTE.P2_PRIMARY, 0.15);
    this.zone2.setStrokeStyle(3, PALETTE.P2_PRIMARY, 0.6);
    this.zone2.setDepth(1);
    
    this.zone2Indicator = this.scene.add.text(zone2X, zoneY - this.config.zoneRadius - 15, '🟦', {
      fontSize: '24px'
    }).setOrigin(0.5).setDepth(1000);
    
    // Progress bar (centered top)
    const barWidth = 200;
    const barHeight = 16;
    const barX = arena.centerX - barWidth / 2;
    const barY = 80;
    
    this.progressBg = this.scene.add.rectangle(arena.centerX, barY + barHeight / 2, barWidth + 4, barHeight + 4, 0x000000, 0.7);
    this.progressBg.setScrollFactor(0).setDepth(1000);
    
    this.progressBar = this.scene.add.graphics();
    this.progressBar.setScrollFactor(0).setDepth(1001);
    
    this.titleText = this.scene.add.text(arena.centerX, barY - 15, '🎯 HOLD BOTH ZONES', {
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      fontFamily: 'Arial Black'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1000);
    
    // Pulse animation on zones
    this.scene.tweens.add({
      targets: [this.zone1, this.zone2],
      alpha: { from: 0.15, to: 0.3 },
      duration: 500,
      yoyo: true,
      repeat: -1
    });
  }

  update(delta: number, players: Player[]): void {
    if (!this.active || this.completed || this.failed) return;
    
    // Update time remaining
    this.timeRemaining -= delta;
    if (this.timeRemaining <= 0) {
      this.fail();
      return;
    }
    
    if (this.type === 'dual_zone') {
      this.updateDualZones(delta, players);
    }
  }

  private updateDualZones(delta: number, players: Player[]): void {
    // Check zone occupation
    this.zone1Occupied = false;
    this.zone2Occupied = false;
    
    for (const player of players) {
      if (!player.active || player.isDead) continue;
      
      const dist1 = Phaser.Math.Distance.Between(player.x, player.y, this.zone1.x, this.zone1.y);
      const dist2 = Phaser.Math.Distance.Between(player.x, player.y, this.zone2.x, this.zone2.y);
      
      if (dist1 <= this.config.zoneRadius) this.zone1Occupied = true;
      if (dist2 <= this.config.zoneRadius) this.zone2Occupied = true;
    }
    
    // Update zone visuals
    this.zone1.setStrokeStyle(3, this.zone1Occupied ? 0x00ff00 : PALETTE.P1_PRIMARY, this.zone1Occupied ? 1 : 0.6);
    this.zone2.setStrokeStyle(3, this.zone2Occupied ? 0x00ff00 : PALETTE.P2_PRIMARY, this.zone2Occupied ? 1 : 0.6);
    this.zone1Indicator.setText(this.zone1Occupied ? '✅' : '🟥');
    this.zone2Indicator.setText(this.zone2Occupied ? '✅' : '🟦');
    
    // Update progress
    if (this.zone1Occupied && this.zone2Occupied) {
      // BOTH occupied = charge!
      this.progress += this.config.chargeRate * (delta / 1000);
      this.titleText.setColor('#00ff00');
      this.titleText.setText('🎯 CHARGING!');
    } else {
      // Decay if not both
      this.progress = Math.max(0, this.progress - this.config.decayRate * (delta / 1000));
      this.titleText.setColor('#ffffff');
      this.titleText.setText('🎯 HOLD BOTH ZONES');
    }
    
    // Update progress bar
    this.drawProgressBar();
    
    // Check completion
    if (this.progress >= 100) {
      this.complete();
    }
  }

  private drawProgressBar(): void {
    this.progressBar.clear();
    
    const barWidth = 200;
    const barHeight = 16;
    const cam = this.scene.cameras.main;
    const barX = cam.width / 2 - barWidth / 2;
    const barY = 80;
    
    // Background
    this.progressBar.fillStyle(0x333333);
    this.progressBar.fillRect(barX, barY, barWidth, barHeight);
    
    // Progress fill
    const fillColor = (this.zone1Occupied && this.zone2Occupied) ? 0x00ff00 : 0xffaa00;
    this.progressBar.fillStyle(fillColor);
    this.progressBar.fillRect(barX, barY, barWidth * (this.progress / 100), barHeight);
    
    // Border
    this.progressBar.lineStyle(2, 0xffffff);
    this.progressBar.strokeRect(barX, barY, barWidth, barHeight);
    
    // Time remaining
    const secs = Math.ceil(this.timeRemaining / 1000);
    this.progressBar.fillStyle(0xffffff);
  }

  private complete(): void {
    this.completed = true;
    this.active = false;
    
    // Success VFX
    this.scene.cameras.main.flash(200, 0, 255, 0);
    this.showAnnouncement('✅ OBJECTIVE COMPLETE!');
    
    // Emit event
    this.scene.events.emit('objectiveComplete', { type: this.type });
    
    // Cleanup after delay
    this.scene.time.delayedCall(1000, () => this.cleanup());
  }

  private fail(): void {
    this.failed = true;
    this.active = false;
    
    // Fail VFX
    this.scene.cameras.main.flash(200, 255, 0, 0);
    this.showAnnouncement('❌ OBJECTIVE FAILED!');
    
    // Emit event
    this.scene.events.emit('objectiveFailed', { type: this.type });
    
    // Cleanup after delay
    this.scene.time.delayedCall(1000, () => this.cleanup());
  }

  private showAnnouncement(text: string): void {
    const cam = this.scene.cameras.main;
    const announce = this.scene.add.text(cam.width / 2, cam.height / 2, text, {
      fontSize: '32px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 5,
      fontFamily: 'Arial Black'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2000);
    
    this.scene.tweens.add({
      targets: announce,
      alpha: { from: 0, to: 1 },
      scaleX: { from: 2, to: 1 },
      scaleY: { from: 2, to: 1 },
      duration: 300,
      ease: 'Back.out',
      onComplete: () => {
        this.scene.time.delayedCall(1500, () => {
          this.scene.tweens.add({
            targets: announce,
            alpha: 0,
            y: announce.y - 50,
            duration: 500,
            onComplete: () => announce.destroy()
          });
        });
      }
    });
  }

  private cleanup(): void {
    this.zone1?.destroy();
    this.zone2?.destroy();
    this.zone1Indicator?.destroy();
    this.zone2Indicator?.destroy();
    this.progressBar?.destroy();
    this.progressBg?.destroy();
    this.titleText?.destroy();
  }

  isActive(): boolean {
    return this.active;
  }

  isCompleted(): boolean {
    return this.completed;
  }

  isFailed(): boolean {
    return this.failed;
  }
}
