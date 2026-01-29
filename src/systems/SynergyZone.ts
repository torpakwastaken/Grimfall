import Phaser from 'phaser';
import { Player } from '@/entities/Player';
import { PALETTE } from '@/systems/AnimationSystem';

/**
 * SynergyZone - Proximity-based co-op buff system
 * 
 * When players stand close together:
 * - Damage buff (+25%)
 * - Fire rate buff (+20%)
 * - Visible ring + connecting pulse
 * 
 * "We're stronger together."
 */

interface SynergyConfig {
  radius: number;           // Distance to trigger synergy
  damageBoost: number;      // Multiplier (1.25 = +25%)
  fireRateBoost: number;    // Multiplier (1.20 = +20%)
  speedBoost: number;       // Multiplier (1.10 = +10%)
}

export class SynergyZone {
  private scene: Phaser.Scene;
  private players: Player[] = [];
  private config: SynergyConfig;
  
  // Visual elements
  private synergyRing1: Phaser.GameObjects.Arc | null = null;
  private synergyRing2: Phaser.GameObjects.Arc | null = null;
  private connectingBeam: Phaser.GameObjects.Graphics | null = null;
  private synergyText: Phaser.GameObjects.Text | null = null;
  
  // State
  private isSynergized: boolean = false;
  private synergyStartTime: number = 0;
  private totalSynergyTime: number = 0;
  private pulseTime: number = 0;
  
  // Callbacks
  private onSynergyStart?: () => void;
  private onSynergyEnd?: () => void;

  constructor(scene: Phaser.Scene, config?: Partial<SynergyConfig>) {
    this.scene = scene;
    this.config = {
      radius: 120,
      damageBoost: 1.25,
      fireRateBoost: 1.20,
      speedBoost: 1.10,
      ...config
    };
    
    this.createVisuals();
  }

  private createVisuals(): void {
    // Synergy rings around each player
    this.synergyRing1 = this.scene.add.arc(0, 0, this.config.radius, 0, 360, false, PALETTE.FX_SYNC, 0);
    this.synergyRing1.setStrokeStyle(3, PALETTE.FX_SYNC, 0);
    this.synergyRing1.setDepth(5);
    this.synergyRing1.setVisible(false);
    
    this.synergyRing2 = this.scene.add.arc(0, 0, this.config.radius, 0, 360, false, PALETTE.FX_SYNC, 0);
    this.synergyRing2.setStrokeStyle(3, PALETTE.FX_SYNC, 0);
    this.synergyRing2.setDepth(5);
    this.synergyRing2.setVisible(false);
    
    // Connecting beam
    this.connectingBeam = this.scene.add.graphics();
    this.connectingBeam.setDepth(4);
    
    // Synergy indicator text
    this.synergyText = this.scene.add.text(0, 0, '🤝 SYNERGY!', {
      fontSize: '16px',
      color: '#ffff00',
      stroke: '#000000',
      strokeThickness: 3,
      fontFamily: 'Arial Black'
    });
    this.synergyText.setOrigin(0.5);
    this.synergyText.setDepth(100);
    this.synergyText.setVisible(false);
  }

  setPlayers(players: Player[]): void {
    this.players = players;
  }

  onSynergy(startCallback: () => void, endCallback: () => void): void {
    this.onSynergyStart = startCallback;
    this.onSynergyEnd = endCallback;
  }

  update(time: number, delta: number): void {
    if (this.players.length < 2) return;
    
    const p1 = this.players[0];
    const p2 = this.players[1];
    
    if (!p1.active || !p2.active || p1.isDead || p2.isDead) {
      this.deactivateSynergy();
      return;
    }
    
    const distance = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
    const inRange = distance <= this.config.radius;
    
    if (inRange && !this.isSynergized) {
      this.activateSynergy(time);
    } else if (!inRange && this.isSynergized) {
      this.deactivateSynergy();
    }
    
    if (this.isSynergized) {
      this.updateSynergyVisuals(p1, p2, time, delta);
      this.totalSynergyTime += delta;
    }
    
    // Update ring positions even when not synergized (for hint)
    this.updateRingPositions(p1, p2, inRange);
  }

  private activateSynergy(time: number): void {
    this.isSynergized = true;
    this.synergyStartTime = time;
    
    // Apply buffs to both players
    for (const player of this.players) {
      player.stats.damage *= this.config.damageBoost;
      player.stats.fireRate *= this.config.fireRateBoost;
      player.stats.moveSpeed *= this.config.speedBoost;
    }
    
    // Show visuals
    this.synergyRing1?.setVisible(true);
    this.synergyRing2?.setVisible(true);
    this.synergyText?.setVisible(true);
    
    // Callback
    this.onSynergyStart?.();
    
    // Emit event for VFX
    this.scene.events.emit('synergyActivated', {
      x: (this.players[0].x + this.players[1].x) / 2,
      y: (this.players[0].y + this.players[1].y) / 2
    });
  }

  private deactivateSynergy(): void {
    if (!this.isSynergized) return;
    
    this.isSynergized = false;
    
    // Remove buffs from both players
    for (const player of this.players) {
      player.stats.damage /= this.config.damageBoost;
      player.stats.fireRate /= this.config.fireRateBoost;
      player.stats.moveSpeed /= this.config.speedBoost;
    }
    
    // Hide visuals
    this.synergyRing1?.setVisible(false);
    this.synergyRing2?.setVisible(false);
    this.synergyText?.setVisible(false);
    this.connectingBeam?.clear();
    
    // Callback
    this.onSynergyEnd?.();
  }

  private updateRingPositions(p1: Player, p2: Player, inRange: boolean): void {
    if (this.synergyRing1) {
      this.synergyRing1.setPosition(p1.x, p1.y);
      // Subtle hint when close but not synergized
      if (!this.isSynergized && inRange) {
        this.synergyRing1.setStrokeStyle(2, PALETTE.FX_SYNC, 0.3);
        this.synergyRing1.setVisible(true);
      }
    }
    
    if (this.synergyRing2) {
      this.synergyRing2.setPosition(p2.x, p2.y);
      if (!this.isSynergized && inRange) {
        this.synergyRing2.setStrokeStyle(2, PALETTE.FX_SYNC, 0.3);
        this.synergyRing2.setVisible(true);
      }
    }
  }

  private updateSynergyVisuals(p1: Player, p2: Player, time: number, delta: number): void {
    this.pulseTime += delta;
    
    // Pulsing ring effect
    const pulseAlpha = 0.5 + 0.3 * Math.sin(this.pulseTime / 150);
    const pulseScale = 1 + 0.05 * Math.sin(this.pulseTime / 200);
    
    if (this.synergyRing1) {
      this.synergyRing1.setStrokeStyle(3, PALETTE.FX_SYNC, pulseAlpha);
      this.synergyRing1.setScale(pulseScale);
    }
    
    if (this.synergyRing2) {
      this.synergyRing2.setStrokeStyle(3, PALETTE.FX_SYNC, pulseAlpha);
      this.synergyRing2.setScale(pulseScale);
    }
    
    // Connecting beam
    if (this.connectingBeam) {
      this.connectingBeam.clear();
      
      // Draw pulsing beam
      const beamAlpha = 0.4 + 0.2 * Math.sin(this.pulseTime / 100);
      this.connectingBeam.lineStyle(4, PALETTE.FX_SYNC, beamAlpha);
      this.connectingBeam.lineBetween(p1.x, p1.y, p2.x, p2.y);
      
      // Inner bright line
      this.connectingBeam.lineStyle(2, 0xffffff, beamAlpha * 0.8);
      this.connectingBeam.lineBetween(p1.x, p1.y, p2.x, p2.y);
    }
    
    // Position synergy text at midpoint
    if (this.synergyText) {
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2 - 40;
      this.synergyText.setPosition(midX, midY);
      this.synergyText.setAlpha(pulseAlpha);
    }
  }

  isSynergyActive(): boolean {
    return this.isSynergized;
  }

  getTotalSynergyTime(): number {
    return this.totalSynergyTime;
  }

  getConfig(): SynergyConfig {
    return this.config;
  }

  destroy(): void {
    this.synergyRing1?.destroy();
    this.synergyRing2?.destroy();
    this.connectingBeam?.destroy();
    this.synergyText?.destroy();
  }
}
