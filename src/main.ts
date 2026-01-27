import Phaser from 'phaser';
import { MenuScene } from '@/scenes/MenuScene';
import { GameScene } from '@/scenes/GameScene';
import { UpgradeScene } from '@/scenes/UpgradeScene';
import { GameOverScene } from '@/scenes/GameOverScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: 'game-container',
  backgroundColor: '#0a0a0a',
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
      gravity: { x: 0, y: 0 }
    }
  },
  scene: [MenuScene, GameScene, UpgradeScene, GameOverScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    expandParent: true
  },
  render: {
    pixelArt: false,
    antialias: true,
    powerPreference: 'high-performance'
  },
  pause: {
    onBlur: false,
    onHide: false
  }
};

const game = new Phaser.Game(config);

let resizeTimeout: number | null = null;

// Debounce resize/DPI change events
window.addEventListener('resize', () => {
  if (resizeTimeout) clearTimeout(resizeTimeout);
  resizeTimeout = window.setTimeout(() => {
    try {
      game.scale.refresh();
    } catch (e) {
      console.warn('Scale refresh error:', e);
    }
    resizeTimeout = null;
  }, 300);
});

export default game;
