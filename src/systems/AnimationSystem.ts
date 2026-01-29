import Phaser from 'phaser';
import paletteData from '@/data/palette.json';

/**
 * AnimationSystem - Minimal, effective animations
 * 
 * Philosophy:
 * - Idle: 2-3 frames max
 * - Movement: squash/stretch via scale tween
 * - Death: scale pop + decal + short particle burst
 * - No long sprite sheets. Let VFX do the work.
 */

// Parse hex string to number
const parseHex = (hex: string): number => parseInt(hex.replace('0x', ''), 16);

// Color palette constants
export const PALETTE = {
  BG_DARK: parseHex(paletteData.palette.background.dark),
  BG_MID: parseHex(paletteData.palette.background.mid),
  BG_LIGHT: parseHex(paletteData.palette.background.light),
  
  P1_PRIMARY: parseHex(paletteData.palette.players.p1_primary),
  P1_SECONDARY: parseHex(paletteData.palette.players.p1_secondary),
  P1_OUTLINE: parseHex(paletteData.palette.players.p1_outline),
  
  P2_PRIMARY: parseHex(paletteData.palette.players.p2_primary),
  P2_SECONDARY: parseHex(paletteData.palette.players.p2_secondary),
  P2_OUTLINE: parseHex(paletteData.palette.players.p2_outline),
  
  ENEMY_SWARMER: parseHex(paletteData.palette.enemies.swarmer),
  ENEMY_SHAMBLER: parseHex(paletteData.palette.enemies.shambler),
  ENEMY_SHIELDBEARER: parseHex(paletteData.palette.enemies.shieldbearer),
  ENEMY_SNIPER: parseHex(paletteData.palette.enemies.sniper),
  ENEMY_ELITE: parseHex(paletteData.palette.enemies.elite_tint),
  ENEMY_BOSS: parseHex(paletteData.palette.enemies.boss),
  
  PROJ_DAMAGE: parseHex(paletteData.palette.projectiles.damage),
  PROJ_SUPPORT: parseHex(paletteData.palette.projectiles.support),
  PROJ_EXPLOSIVE: parseHex(paletteData.palette.projectiles.explosive),
  PROJ_ENEMY: parseHex(paletteData.palette.projectiles.enemy),
  
  FX_HEAL: parseHex(paletteData.palette.effects.heal),
  FX_BUFF: parseHex(paletteData.palette.effects.buff),
  FX_CRIT: parseHex(paletteData.palette.effects.crit),
  FX_SYNC: parseHex(paletteData.palette.effects.sync),
  FX_XP: parseHex(paletteData.palette.effects.xp),
  
  UI_HEALTH_HIGH: parseHex(paletteData.palette.ui.health_high),
  UI_HEALTH_MID: parseHex(paletteData.palette.ui.health_mid),
  UI_HEALTH_LOW: parseHex(paletteData.palette.ui.health_low)
};

export class AnimationSystem {
  private scene: Phaser.Scene;
  private activeSquashTweens: Map<Phaser.GameObjects.GameObject, Phaser.Tweens.Tween> = new Map();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  // === MOVEMENT ANIMATIONS (Squash/Stretch) ===

  /**
   * Apply squash/stretch on movement direction
   * No sprite sheets needed - pure scale tweening
   */
  applyMovementSquash(
    sprite: Phaser.GameObjects.Sprite,
    velocityX: number,
    velocityY: number,
    baseScale: number = 1
  ): void {
    if (!sprite || !sprite.active) return;
    
    const speed = Math.sqrt(velocityX * velocityX + velocityY * velocityY);
    if (speed < 10) {
      // Return to normal when stopped
      sprite.setScale(baseScale);
      return;
    }
    
    // Squash in direction of movement
    const squashAmount = Math.min(speed / 500, 0.15);
    const angle = Math.atan2(velocityY, velocityX);
    
    // Horizontal movement = tall and thin
    // Vertical movement = short and wide
    const horizontal = Math.abs(Math.cos(angle));
    const vertical = Math.abs(Math.sin(angle));
    
    const scaleX = baseScale * (1 - squashAmount * horizontal + squashAmount * vertical * 0.5);
    const scaleY = baseScale * (1 - squashAmount * vertical + squashAmount * horizontal * 0.5);
    
    sprite.setScale(scaleX, scaleY);
  }

  /**
   * Bounce animation (on landing, taking damage, etc)
   */
  bounce(sprite: Phaser.GameObjects.Sprite, intensity: number = 0.2): void {
    if (!sprite || !sprite.active) return;
    
    // Cancel existing tween
    this.cancelSquashTween(sprite);
    
    const baseScale = sprite.scaleX;
    
    const tween = this.scene.tweens.add({
      targets: sprite,
      scaleX: baseScale * (1 + intensity),
      scaleY: baseScale * (1 - intensity),
      duration: 50,
      yoyo: true,
      ease: 'Quad.out',
      onComplete: () => {
        sprite.setScale(baseScale);
        this.activeSquashTweens.delete(sprite);
      }
    });
    
    this.activeSquashTweens.set(sprite, tween);
  }

  /**
   * Hit reaction (quick squash)
   */
  hitReaction(sprite: Phaser.GameObjects.Sprite): void {
    if (!sprite || !sprite.active) return;
    
    this.cancelSquashTween(sprite);
    
    const baseScaleX = sprite.scaleX;
    const baseScaleY = sprite.scaleY;
    
    const tween = this.scene.tweens.add({
      targets: sprite,
      scaleX: baseScaleX * 1.15,
      scaleY: baseScaleY * 0.85,
      duration: 40,
      yoyo: true,
      ease: 'Quad.out',
      onComplete: () => {
        sprite.setScale(baseScaleX, baseScaleY);
        this.activeSquashTweens.delete(sprite);
      }
    });
    
    this.activeSquashTweens.set(sprite, tween);
  }

  // === DEATH ANIMATIONS ===

  /**
   * Death pop - scale up then vanish
   * Returns promise for chaining
   */
  deathPop(
    sprite: Phaser.GameObjects.Sprite,
    color: number = 0xffffff
  ): Promise<void> {
    return new Promise((resolve) => {
      if (!sprite || !sprite.active) {
        resolve();
        return;
      }
      
      const baseScale = sprite.scaleX;
      
      this.scene.tweens.add({
        targets: sprite,
        scaleX: baseScale * 1.5,
        scaleY: baseScale * 1.5,
        alpha: 0,
        duration: 150,
        ease: 'Quad.out',
        onComplete: () => {
          resolve();
        }
      });
    });
  }

  /**
   * Create death decal (stays on ground briefly)
   */
  createDeathDecal(x: number, y: number, color: number, size: number = 20): void {
    const decal = this.scene.add.circle(x, y, size, color, 0.3);
    decal.setDepth(1); // Decals layer
    
    this.scene.tweens.add({
      targets: decal,
      alpha: 0,
      scale: 1.5,
      duration: 1000,
      ease: 'Quad.out',
      onComplete: () => decal.destroy()
    });
  }

  // === IDLE ANIMATIONS ===

  /**
   * Simple idle bob (2-3 frame equivalent via tween)
   */
  startIdleBob(sprite: Phaser.GameObjects.Sprite, amplitude: number = 2): Phaser.Tweens.Tween {
    return this.scene.tweens.add({
      targets: sprite,
      y: sprite.y - amplitude,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut'
    });
  }

  /**
   * Pulse scale (for highlighted items, buffs)
   */
  startPulse(sprite: Phaser.GameObjects.Sprite, min: number = 0.95, max: number = 1.05): Phaser.Tweens.Tween {
    return this.scene.tweens.add({
      targets: sprite,
      scaleX: { from: min, to: max },
      scaleY: { from: min, to: max },
      duration: 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut'
    });
  }

  // === SPAWN ANIMATIONS ===

  /**
   * Pop-in spawn animation
   */
  spawnPopIn(sprite: Phaser.GameObjects.Sprite, targetScale: number = 1): Promise<void> {
    return new Promise((resolve) => {
      sprite.setScale(0);
      sprite.setAlpha(0);
      
      this.scene.tweens.add({
        targets: sprite,
        scaleX: targetScale,
        scaleY: targetScale,
        alpha: 1,
        duration: 150,
        ease: 'Back.out',
        onComplete: () => resolve()
      });
    });
  }

  /**
   * Warning pulse before enemy spawns
   */
  spawnWarning(x: number, y: number, color: number): Promise<void> {
    return new Promise((resolve) => {
      const warning = this.scene.add.circle(x, y, 5, color, 0.8);
      
      this.scene.tweens.add({
        targets: warning,
        radius: 30,
        alpha: 0,
        duration: 400,
        ease: 'Quad.out',
        onComplete: () => {
          warning.destroy();
          resolve();
        }
      });
    });
  }

  // === UTILITY ===

  private cancelSquashTween(sprite: Phaser.GameObjects.GameObject): void {
    const existing = this.activeSquashTweens.get(sprite);
    if (existing) {
      existing.stop();
      this.activeSquashTweens.delete(sprite);
    }
  }

  destroy(): void {
    this.activeSquashTweens.forEach(tween => tween.stop());
    this.activeSquashTweens.clear();
  }
}

// === SPRITE GENERATION UTILITIES ===

/**
 * Create player sprite with outline (distinct hue + 2px outline)
 */
export function createPlayerSprite(
  scene: Phaser.Scene,
  playerId: number,
  size: number = 32
): string {
  const textureKey = `player_outlined_${playerId}`;
  if (scene.textures.exists(textureKey)) return textureKey;
  
  const primary = playerId === 0 ? PALETTE.P1_PRIMARY : PALETTE.P2_PRIMARY;
  const outline = playerId === 0 ? PALETTE.P1_OUTLINE : PALETTE.P2_OUTLINE;
  
  const graphics = scene.add.graphics();
  const half = size / 2;
  
  // Outline (2px)
  graphics.fillStyle(outline);
  graphics.fillCircle(half, half, half);
  
  // Inner fill
  graphics.fillStyle(primary);
  graphics.fillCircle(half, half, half - 2);
  
  // Highlight
  graphics.fillStyle(0xffffff, 0.3);
  graphics.fillCircle(half - 4, half - 4, 4);
  
  graphics.generateTexture(textureKey, size, size);
  graphics.destroy();
  
  return textureKey;
}

/**
 * Create enemy sprite (silhouette-first, shape defines type)
 */
export function createEnemySprite(
  scene: Phaser.Scene,
  type: string,
  size: number = 24
): string {
  const textureKey = `enemy_${type}_sprite`;
  if (scene.textures.exists(textureKey)) return textureKey;
  
  const graphics = scene.add.graphics();
  const half = size / 2;
  
  let color: number;
  
  switch (type) {
    case 'swarmer':
      color = PALETTE.ENEMY_SWARMER;
      // Triangle (fast, aggressive)
      graphics.fillStyle(color);
      graphics.fillTriangle(half, 2, 2, size - 2, size - 2, size - 2);
      break;
      
    case 'shambler':
      color = PALETTE.ENEMY_SHAMBLER;
      // Square (slow, tanky)
      graphics.fillStyle(color);
      graphics.fillRect(2, 2, size - 4, size - 4);
      break;
      
    case 'shieldbearer':
      color = PALETTE.ENEMY_SHIELDBEARER;
      // Hexagon (defensive)
      graphics.fillStyle(color);
      const points = [];
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI * 2) / 6 - Math.PI / 2;
        points.push({
          x: half + Math.cos(angle) * (half - 2),
          y: half + Math.sin(angle) * (half - 2)
        });
      }
      graphics.fillPoints(points, true);
      break;
      
    case 'sniper':
      color = PALETTE.ENEMY_SNIPER;
      // Diamond (ranged, precise)
      graphics.fillStyle(color);
      graphics.fillPoints([
        { x: half, y: 2 },
        { x: size - 2, y: half },
        { x: half, y: size - 2 },
        { x: 2, y: half }
      ], true);
      break;
      
    default:
      color = PALETTE.ENEMY_SWARMER;
      graphics.fillStyle(color);
      graphics.fillCircle(half, half, half - 2);
  }
  
  graphics.generateTexture(textureKey, size, size);
  graphics.destroy();
  
  return textureKey;
}

/**
 * Create projectile sprite (color = function)
 */
export function createProjectileSprite(
  scene: Phaser.Scene,
  type: 'damage' | 'support' | 'explosive' | 'enemy',
  size: number = 8
): string {
  const textureKey = `proj_${type}_sprite`;
  if (scene.textures.exists(textureKey)) return textureKey;
  
  const colors: Record<string, number> = {
    damage: PALETTE.PROJ_DAMAGE,
    support: PALETTE.PROJ_SUPPORT,
    explosive: PALETTE.PROJ_EXPLOSIVE,
    enemy: PALETTE.PROJ_ENEMY
  };
  
  const graphics = scene.add.graphics();
  const half = size / 2;
  
  // Glow
  graphics.fillStyle(colors[type], 0.4);
  graphics.fillCircle(half, half, half);
  
  // Core
  graphics.fillStyle(colors[type]);
  graphics.fillCircle(half, half, half - 2);
  
  // Bright center
  graphics.fillStyle(0xffffff, 0.8);
  graphics.fillCircle(half, half, 2);
  
  graphics.generateTexture(textureKey, size, size);
  graphics.destroy();
  
  return textureKey;
}
