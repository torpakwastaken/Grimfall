// Core game types

export interface Vector2 {
  x: number;
  y: number;
}

export interface PlayerConfig {
  id: number;
  color: number;
  startX: number;
  startY: number;
  keys: {
    up: string;
    down: string;
    left: string;
    right: string;
    heavy: string;
  };
}

export interface PlayerStats {
  maxHp: number;
  currentHp: number;
  moveSpeed: number;
  fireRate: number;
  damage: number;
  critChance: number;
  critMultiplier: number;
  damageReduction: number;
  ammo: number;
  maxAmmo: number;
  lifeSteal?: number;
  projectileCount?: number;
  pierce?: number;
}

export interface WeaponConfig {
  id: string;
  type: 'auto' | 'heavy';
  damage: number;
  fireRate: number; // shots per second
  projectileSpeed: number;
  projectileSize: number;
  pierce: number;
  spread?: number; // for shotgun
  pellets?: number; // for shotgun
  color: number;
}

export interface EnemyData {
  id: string;
  name: string;
  hp: number;
  speed: number;
  damage: number;
  xpValue: number;
  size: number;
  color: string;
  shape: 'square' | 'triangle' | 'circle' | 'hexagon';
  attackRange: number;
  attackCooldown: number;
  frontShield?: boolean;
  shieldReduction?: number;
  stationary?: boolean;
  laserWindup?: number;
}

export interface UpgradeData {
  id: string;
  name: string;
  description: string;
  tier: number;
  icon: string;
  effect: UpgradeEffect;
  synergyWith?: string;
  synergyBonus?: string;
}

export interface UpgradeEffect {
  type: 'stat' | 'onHit' | 'onCrit' | 'onKill';
  stat?: keyof PlayerStats;
  value?: number;
  secondaryStat?: keyof PlayerStats;
  secondaryValue?: number;
  action?: string;
  duration?: number;
  damage?: number;
  radius?: number;
}

export interface WaveConfig {
  startTime: number;
  duration: number;
  enemies: Array<{
    type: string;
    count: number;
    spawnRate: number;
  }>;
}

export interface GameState {
  players: PlayerStats[];
  currentWave: number;
  elapsedTime: number;
  totalXP: number;
  level: number;
  enemiesKilled: number;
  bossActive: boolean;
}

export interface SynergyEffect {
  playerId: number;
  partnerId: number;
  upgradeId: string;
  partnerUpgradeId: string;
  multiplier: number;
  active: boolean;
}

export interface BuffData {
  id: string;
  type: string;
  duration: number;
  value: number;
  source: 'player' | 'upgrade' | 'synergy';
}

export interface PooledObject {
  active: boolean;
  reset(): void;
  activate(...args: any[]): void;
  deactivate(): void;
}
