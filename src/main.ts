import Phaser from 'phaser';
import { MenuScene } from '@/scenes/MenuScene';
import { GameScene } from '@/scenes/GameScene';
import { UpgradeScene } from '@/scenes/UpgradeScene';
import { GameOverScene } from '@/scenes/GameOverScene';
import { OptionsScene } from '@/scenes/OptionsScene';
import { DemoScene } from '@/scenes/DemoScene';
import { WeaponTestScene } from '@/scenes/WeaponTestScene';
import { WeaponSelectScene } from '@/scenes/WeaponSelectScene';
import { LobbyScene } from '@/scenes/LobbyScene';

// Set to true to start directly in demo mode
// Set to 'test' to start in weapon test scene
const DEMO_MODE: boolean | 'test' = false as boolean | 'test';

// All scenes used in the game
const ALL_SCENES = [
  MenuScene,
  LobbyScene,
  WeaponSelectScene, 
  GameScene, 
  UpgradeScene, 
  GameOverScene, 
  OptionsScene, 
  DemoScene,
  WeaponTestScene
];

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
  scene: DEMO_MODE === 'test'
    ? [WeaponTestScene, ...ALL_SCENES.filter(s => s !== WeaponTestScene)]
    : DEMO_MODE 
      ? [DemoScene, ...ALL_SCENES.filter(s => s !== DemoScene)]
      : ALL_SCENES,
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
  disableContextMenu: true
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
