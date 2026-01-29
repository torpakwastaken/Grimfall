import Phaser from 'phaser';
import { PALETTE } from './AnimationSystem';

/**
 * CoopVFXSystem - Visual clarity for co-op actions
 * 
 * Philosophy:
 * - Both players should see the same VFX
 * - Sync actions feel impactful (ring + popup)
 * - Buff beams show active shared effects
 * - Assist popups reward teamwork
 */

interface BuffBeam {
  graphics: Phaser.GameObjects.Graphics;
  startEntity: Phaser.GameObjects.Sprite;
  endEntity: Phaser.GameObjects.Sprite;
  color: number;
  pulseTime: number;
}

interface AssistPopup {
  text: Phaser.GameObjects.Text;
  x: number;
  y: number;
  lifetime: number;
}

export class CoopVFXSystem {
  private scene: Phaser.Scene;
  private buffBeams: BuffBeam[] = [];
  private assistPopups: AssistPopup[] = [];
  private popupPool: Phaser.GameObjects.Text[] = [];
  
  // Performance limits
  private readonly MAX_BEAMS = 4;
  private readonly MAX_POPUPS = 8;
  private readonly POPUP_POOL_SIZE = 10;
  
  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.initPopupPool();
  }

  private initPopupPool(): void {
    for (let i = 0; i < this.POPUP_POOL_SIZE; i++) {
      const text = this.scene.add.text(0, 0, '', {
        fontFamily: 'Arial Black',
        fontSize: '18px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4
      });
      text.setOrigin(0.5);
      text.setDepth(1000); // UI layer
      text.setVisible(false);
      this.popupPool.push(text);
    }
  }

  // === BUFF LINK BEAM ===

  /**
   * Create visual beam between two players when sharing a buff
   */
  createBuffBeam(
    player1: Phaser.GameObjects.Sprite,
    player2: Phaser.GameObjects.Sprite,
    buffType: 'heal' | 'buff' | 'sync' = 'buff'
  ): BuffBeam | null {
    if (this.buffBeams.length >= this.MAX_BEAMS) {
      // Remove oldest beam
      const old = this.buffBeams.shift();
      old?.graphics.destroy();
    }
    
    const colors: Record<string, number> = {
      heal: PALETTE.FX_HEAL,
      buff: PALETTE.FX_BUFF,
      sync: PALETTE.FX_SYNC
    };
    
    const graphics = this.scene.add.graphics();
    graphics.setDepth(50); // Above entities, below UI
    
    const beam: BuffBeam = {
      graphics,
      startEntity: player1,
      endEntity: player2,
      color: colors[buffType],
      pulseTime: 0
    };
    
    this.buffBeams.push(beam);
    return beam;
  }

  /**
   * Remove a specific buff beam
   */
  removeBuffBeam(beam: BuffBeam): void {
    const index = this.buffBeams.indexOf(beam);
    if (index !== -1) {
      beam.graphics.destroy();
      this.buffBeams.splice(index, 1);
    }
  }

  /**
   * Remove all beams involving a specific entity
   */
  removeBeamsForEntity(entity: Phaser.GameObjects.Sprite): void {
    this.buffBeams = this.buffBeams.filter(beam => {
      if (beam.startEntity === entity || beam.endEntity === entity) {
        beam.graphics.destroy();
        return false;
      }
      return true;
    });
  }

  // === SYNC EXPLOSION RING ===

  /**
   * Joint attack visual - expanding ring when both players attack same target
   */
  createSyncExplosion(x: number, y: number, radius: number = 80): void {
    const ring = this.scene.add.circle(x, y, 10, PALETTE.FX_SYNC, 0);
    ring.setStrokeStyle(4, PALETTE.FX_SYNC, 1);
    ring.setDepth(100);
    
    // Inner flash
    const flash = this.scene.add.circle(x, y, 5, 0xffffff, 0.8);
    flash.setDepth(101);
    
    // Expand ring
    this.scene.tweens.add({
      targets: ring,
      radius: radius,
      alpha: { from: 1, to: 0 },
      duration: 300,
      ease: 'Quad.out',
      onUpdate: () => {
        ring.setStrokeStyle(4 * (1 - (ring.radius / radius)), PALETTE.FX_SYNC);
      },
      onComplete: () => ring.destroy()
    });
    
    // Flash shrink
    this.scene.tweens.add({
      targets: flash,
      scale: 0,
      alpha: 0,
      duration: 150,
      ease: 'Quad.out',
      onComplete: () => flash.destroy()
    });
    
    // Camera shake on sync (subtle)
    this.scene.cameras.main.shake(80, 0.003);
  }

  // === ASSIST POPUPS ===

  /**
   * Show "SYNC!", "SAVE!", "COMBO!" etc popup
   */
  showAssistPopup(
    x: number, 
    y: number, 
    message: string,
    color: number = PALETTE.FX_SYNC
  ): void {
    // Enforce limit
    if (this.assistPopups.length >= this.MAX_POPUPS) {
      const old = this.assistPopups.shift();
      if (old) {
        old.text.setVisible(false);
        this.popupPool.push(old.text);
      }
    }
    
    // Get from pool
    const text = this.popupPool.pop();
    if (!text) return;
    
    text.setText(message);
    text.setPosition(x, y);
    text.setColor(`#${color.toString(16).padStart(6, '0')}`);
    text.setScale(0);
    text.setAlpha(1);
    text.setVisible(true);
    
    // Pop-in animation
    this.scene.tweens.add({
      targets: text,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 100,
      ease: 'Back.out',
      onComplete: () => {
        this.scene.tweens.add({
          targets: text,
          scaleX: 1,
          scaleY: 1,
          duration: 50
        });
      }
    });
    
    const popup: AssistPopup = {
      text,
      x,
      y,
      lifetime: 1500
    };
    
    this.assistPopups.push(popup);
  }

  /**
   * Predefined popup helpers
   */
  showSyncPopup(x: number, y: number): void {
    this.showAssistPopup(x, y, 'SYNC!', PALETTE.FX_SYNC);
  }

  showSavePopup(x: number, y: number): void {
    this.showAssistPopup(x, y, 'SAVE!', PALETTE.FX_HEAL);
  }

  showComboPopup(x: number, y: number, comboCount: number): void {
    this.showAssistPopup(x, y, `${comboCount}x COMBO!`, PALETTE.FX_CRIT);
  }

  showRevivePopup(x: number, y: number): void {
    this.showAssistPopup(x, y, 'REVIVE!', PALETTE.FX_HEAL);
  }

  // === SHARED BUFF INDICATOR ===

  /**
   * Ring that appears around both players when buff is shared
   */
  createSharedBuffRing(
    player1: Phaser.GameObjects.Sprite,
    player2: Phaser.GameObjects.Sprite,
    duration: number = 5000
  ): void {
    const createRing = (player: Phaser.GameObjects.Sprite) => {
      const ring = this.scene.add.circle(player.x, player.y, 20, 0, 0);
      ring.setStrokeStyle(2, PALETTE.FX_BUFF, 0.7);
      ring.setDepth(player.depth - 1);
      
      // Pulse animation
      this.scene.tweens.add({
        targets: ring,
        radius: { from: 18, to: 22 },
        duration: 400,
        yoyo: true,
        repeat: Math.floor(duration / 800),
        ease: 'Sine.inOut'
      });
      
      // Follow player
      const followTween = this.scene.tweens.add({
        targets: ring,
        x: player.x,
        y: player.y,
        duration: 16,
        repeat: Math.floor(duration / 16),
        onUpdate: () => {
          if (player.active) {
            ring.setPosition(player.x, player.y);
          }
        },
        onComplete: () => {
          this.scene.tweens.add({
            targets: ring,
            alpha: 0,
            duration: 200,
            onComplete: () => ring.destroy()
          });
        }
      });
      
      return ring;
    };
    
    createRing(player1);
    createRing(player2);
    
    // Show popup
    const midX = (player1.x + player2.x) / 2;
    const midY = (player1.y + player2.y) / 2;
    this.showAssistPopup(midX, midY - 30, 'SHARED!', PALETTE.FX_BUFF);
  }

  // === UPDATE LOOP ===

  update(delta: number): void {
    // Update buff beams
    this.updateBuffBeams(delta);
    
    // Update assist popups
    this.updatePopups(delta);
  }

  private updateBuffBeams(delta: number): void {
    for (const beam of this.buffBeams) {
      if (!beam.startEntity.active || !beam.endEntity.active) {
        this.removeBuffBeam(beam);
        continue;
      }
      
      beam.pulseTime += delta;
      beam.graphics.clear();
      
      const startX = beam.startEntity.x;
      const startY = beam.startEntity.y;
      const endX = beam.endEntity.x;
      const endY = beam.endEntity.y;
      
      // Calculate pulse alpha
      const pulseAlpha = 0.4 + 0.3 * Math.sin(beam.pulseTime / 200);
      
      // Draw beam (gradient effect via multiple lines)
      const segments = 5;
      for (let i = 0; i < segments; i++) {
        const t = i / segments;
        const nextT = (i + 1) / segments;
        const x1 = startX + (endX - startX) * t;
        const y1 = startY + (endY - startY) * t;
        const x2 = startX + (endX - startX) * nextT;
        const y2 = startY + (endY - startY) * nextT;
        
        // Thicker in middle
        const midFactor = 1 - Math.abs(t + 0.1 - 0.5) * 2;
        const thickness = 2 + midFactor * 3;
        
        beam.graphics.lineStyle(thickness, beam.color, pulseAlpha);
        beam.graphics.lineBetween(x1, y1, x2, y2);
      }
      
      // End particles (subtle)
      if (Math.random() < 0.1) {
        const particleX = endX + (Math.random() - 0.5) * 10;
        const particleY = endY + (Math.random() - 0.5) * 10;
        const particle = this.scene.add.circle(particleX, particleY, 2, beam.color, 0.8);
        particle.setDepth(beam.graphics.depth + 1);
        
        this.scene.tweens.add({
          targets: particle,
          alpha: 0,
          scale: 0,
          y: particleY - 10,
          duration: 300,
          onComplete: () => particle.destroy()
        });
      }
    }
  }

  private updatePopups(delta: number): void {
    for (let i = this.assistPopups.length - 1; i >= 0; i--) {
      const popup = this.assistPopups[i];
      popup.lifetime -= delta;
      
      // Float upward
      popup.text.y -= delta * 0.02;
      
      // Fade out in last 300ms
      if (popup.lifetime < 300) {
        popup.text.alpha = popup.lifetime / 300;
      }
      
      if (popup.lifetime <= 0) {
        popup.text.setVisible(false);
        this.popupPool.push(popup.text);
        this.assistPopups.splice(i, 1);
      }
    }
  }

  // === CLEANUP ===

  destroy(): void {
    this.buffBeams.forEach(beam => beam.graphics.destroy());
    this.buffBeams = [];
    
    this.assistPopups.forEach(popup => popup.text.destroy());
    this.assistPopups = [];
    
    this.popupPool.forEach(text => text.destroy());
    this.popupPool = [];
  }
}
