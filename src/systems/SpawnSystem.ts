import Phaser from 'phaser';
import { Enemy } from '@/entities/Enemy';
import enemyDataJson from '@/data/enemies.json';
import waveDataJson from '@/data/waves.json';
import { EnemyData, WaveConfig } from '@/types/GameTypes';
import { runtimeConfig } from './RuntimeConfig';

export class SpawnSystem {
  private scene: Phaser.Scene;
  private enemyPool: Phaser.GameObjects.Group;
  private enemyData: Map<string, EnemyData> = new Map();
  private waves: WaveConfig[];
  private currentWaveIndex: number = 0;
  private elapsedTime: number = 0;
  private spawnTimers: Map<string, number> = new Map();
  
  // Scaling configs
  private scaling = waveDataJson.scaling;
  private duoAdjustments = waveDataJson.duoAdjustments;
  private eliteConfig = (waveDataJson as any).elites;
  private deathSpiralConfig = (waveDataJson as any).deathSpiral;
  
  // Spawn limits
  private maxEnemies: number = 800;
  private activeEnemyCount: number = 0;
  private activeEliteCount: number = 0;
  private enemyIdCounter: number = 0;
  
  // Boss state
  private bossActive: boolean = false;
  private bossSpawnCap: number = 30; // Max enemies during boss fight
  
  // Death spiral tracking
  private playerDeathActive: boolean = false;
  
  // Player DPS tracking for HP floor calculation
  private playerAvgDPS: number = 20; // Default estimate, updated via events
  private minTTK: number = 0.6; // Minimum 0.6s TTK for any enemy

  constructor(scene: Phaser.Scene, enemyPool: Phaser.GameObjects.Group) {
    this.scene = scene;
    this.enemyPool = enemyPool;
    this.waves = waveDataJson.waves as WaveConfig[];
    
    // Load enemy data
    Object.entries(enemyDataJson).forEach(([key, data]) => {
      this.enemyData.set(key, data as EnemyData);
    });
    
    // Listen for player death events for death spiral prevention
    this.scene.events.on('playerDied', () => { this.playerDeathActive = true; });
    this.scene.events.on('playerRevived', () => { this.playerDeathActive = false; });
    
    // Listen for DPS updates from debug overlay
    this.scene.events.on('playerDPSUpdate', (dps: number) => { this.playerAvgDPS = dps; });
    
    // Listen for boss events
    this.scene.events.on('bossSpawned', () => { this.bossActive = true; });
    this.scene.events.on('bossDied', () => { this.bossActive = false; });
  }

  update(time: number, delta: number): void {
    this.elapsedTime += delta;
    const currentSeconds = Math.floor(this.elapsedTime / 1000);
    
    // Update wave
    this.updateWave(currentSeconds);
    
    // Spawn enemies (with death spiral reduction if applicable)
    this.spawnEnemies(delta);
  }

  private updateWave(currentSeconds: number): void {
    // Find current wave
    for (let i = 0; i < this.waves.length; i++) {
      const wave = this.waves[i];
      if (currentSeconds >= wave.startTime && 
          currentSeconds < wave.startTime + wave.duration) {
        if (this.currentWaveIndex !== i) {
          this.currentWaveIndex = i;
          this.onWaveStart(wave);
        }
        break;
      }
    }
  }

  private onWaveStart(wave: WaveConfig): void {
    console.log(`Wave ${this.currentWaveIndex + 1} started!`);
    this.scene.events.emit('waveStart', this.currentWaveIndex + 1);
    this.scene.events.emit('waveChanged', { wave: this.currentWaveIndex + 1 });
  }

  private spawnEnemies(delta: number): void {
    if (this.currentWaveIndex >= this.waves.length) return;
    if (this.activeEnemyCount >= this.maxEnemies) return;
    
    // During boss fights, cap spawns at bossSpawnCap instead of pausing
    if (this.bossActive && this.activeEnemyCount >= this.bossSpawnCap) return;

    const wave = this.waves[this.currentWaveIndex];
    const currentMinute = Math.floor(this.elapsedTime / 60000);
    
    // Death spiral prevention: reduce spawns when one player is dead
    const deathMultiplier = this.playerDeathActive ? (1 - this.deathSpiralConfig.spawnReductionOnDeath) : 1;

    for (const enemyConfig of wave.enemies) {
      const key = `${this.currentWaveIndex}_${enemyConfig.type}`;
      
      if (!this.spawnTimers.has(key)) {
        this.spawnTimers.set(key, 0);
      }

      let timer = this.spawnTimers.get(key)!;
      timer += delta;

      // Calculate spawn interval with scaling and runtime multiplier
      const rtSpawnMult = runtimeConfig.get('spawnRateMultiplier');
      const baseInterval = enemyConfig.spawnRate * 1000;
      const scaledInterval = Math.max(
        baseInterval * Math.pow(this.scaling.spawnRateMultiplier, currentMinute) / (deathMultiplier * rtSpawnMult),
        this.scaling.minSpawnInterval * 1000
      );
      
      if (timer >= scaledInterval) {
        // Check for elite spawn
        const isElite = this.shouldSpawnElite(currentMinute);
        this.spawnEnemy(enemyConfig.type, currentMinute, isElite);
        this.spawnTimers.set(key, 0);
      } else {
        this.spawnTimers.set(key, timer);
      }
    }
  }
  
  private shouldSpawnElite(currentMinute: number): boolean {
    if (currentMinute < this.eliteConfig.firstSpawnMinute) return false;
    if (this.activeEliteCount >= this.eliteConfig.maxConcurrent) return false;
    
    const rtEliteMult = runtimeConfig.get('eliteChanceMultiplier');
    const eliteChance = (this.eliteConfig.baseChance + (this.eliteConfig.chancePerMinute * currentMinute)) * rtEliteMult;
    return Math.random() < eliteChance;
  }

  private spawnEnemy(type: string, currentMinute: number, isElite: boolean = false): void {
    const baseData = this.enemyData.get(type);
    if (!baseData) {
      console.warn(`Enemy type ${type} not found`);
      return;
    }

    // Apply scaling
    const scaledData = this.applyScaling(baseData, currentMinute, isElite);

    // Get spawn position (off-screen)
    const spawnPos = this.getSpawnPosition();

    // Get enemy from pool
    const enemy = this.enemyPool.getFirstDead(false) as Enemy;
    if (enemy) {
      const enemyId = ++this.enemyIdCounter;
      enemy.activate(scaledData, spawnPos.x, spawnPos.y);
      (enemy as any).isElite = isElite;
      enemy.enemyId = `e_${enemyId}`; // Network-friendly string ID
      (enemy as any).eliteModifier = (scaledData as any).eliteModifier || null;
      this.activeEnemyCount++;
      if (isElite) {
        this.activeEliteCount++;
        // Visual indicator for elites based on modifier
        const modifier = (scaledData as any).eliteModifier;
        if (modifier === 'shielded') {
          enemy.setTint(0x00ffff); // Cyan for shielded
        } else if (modifier === 'regen') {
          enemy.setTint(0x00ff00); // Green for regen
        } else if (modifier === 'splitOnDeath') {
          enemy.setTint(0xffaa00); // Orange for split
        } else {
          enemy.setTint(0xff00ff); // Purple for basic elite
        }
        enemy.setScale(1.3);
      }
      
      // Emit event for debug overlay
      this.scene.events.emit('enemySpawned', { id: enemyId, isElite, type: type });
    }
  }

  private applyScaling(baseData: EnemyData, currentMinute: number, isElite: boolean = false): EnemyData {
    // Get runtime multipliers
    const rtHpMult = runtimeConfig.get('enemyHpMultiplier');
    const rtDmgMult = runtimeConfig.get('enemyDamageMultiplier');
    
    // HP scales: base * (1 + hpPerMinute)^minute * duoMultiplier * runtimeMultiplier
    const hpMultiplier = Math.pow(1 + this.scaling.hpPerMinute, currentMinute);
    
    // Damage scales linearly: base * (1 + damagePerMinute * minute)
    const damageMultiplier = 1 + (this.scaling.damagePerMinute * currentMinute);
    
    // Speed caps at +30%
    const speedMultiplier = Math.min(
      1 + (this.scaling.speedPerMinute * currentMinute),
      1.3
    );
    
    // Elite multipliers
    const eliteHPMult = isElite ? this.eliteConfig.hpMultiplier : 1;
    const eliteDamageMult = isElite ? this.eliteConfig.damageMultiplier : 1;
    const eliteXPMult = isElite ? this.eliteConfig.xpMultiplier : 1;
    
    // Calculate scaled HP
    let scaledHP = Math.floor(baseData.hp * hpMultiplier * this.duoAdjustments.hpMultiplier * eliteHPMult * rtHpMult);
    
    // HP Floor: ensure minimum 0.6s TTK based on player DPS
    // effectiveEnemyHP = max(scaledHP, playerAvgDPS * minTTK)
    const minHP = Math.floor(this.playerAvgDPS * this.minTTK);
    scaledHP = Math.max(scaledHP, minHP);
    
    // Elite behavior modifiers (minute 10+)
    let eliteModifier: string | null = null;
    if (isElite && currentMinute >= 10) {
      eliteModifier = this.getEliteModifier();
    }

    return {
      ...baseData,
      hp: scaledHP,
      damage: Math.floor(baseData.damage * damageMultiplier * this.duoAdjustments.damageMultiplier * eliteDamageMult * rtDmgMult),
      speed: baseData.speed * speedMultiplier,
      xpValue: Math.floor(baseData.xpValue * this.duoAdjustments.xpMultiplier * eliteXPMult),
      eliteModifier // Pass modifier to enemy for behavior
    } as EnemyData;
  }
  
  // Elite behavior modifiers instead of more stats
  private getEliteModifier(): string {
    const modifiers = ['shielded', 'regen', 'splitOnDeath'];
    return modifiers[Math.floor(Math.random() * modifiers.length)];
  }

  private getSpawnPosition(): { x: number; y: number } {
    const cam = this.scene.cameras.main;
    const buffer = 50;
    const side = Math.floor(Math.random() * 4); // 0: top, 1: right, 2: bottom, 3: left

    let x = 0, y = 0;

    switch (side) {
      case 0: // Top
        x = cam.scrollX + Math.random() * cam.width;
        y = cam.scrollY - buffer;
        break;
      case 1: // Right
        x = cam.scrollX + cam.width + buffer;
        y = cam.scrollY + Math.random() * cam.height;
        break;
      case 2: // Bottom
        x = cam.scrollX + Math.random() * cam.width;
        y = cam.scrollY + cam.height + buffer;
        break;
      case 3: // Left
        x = cam.scrollX - buffer;
        y = cam.scrollY + Math.random() * cam.height;
        break;
    }

    return { x, y };
  }

  onEnemyKilled(data?: any): void {
    this.activeEnemyCount = Math.max(0, this.activeEnemyCount - 1);
    if (data?.isElite) {
      this.activeEliteCount = Math.max(0, this.activeEliteCount - 1);
    }
  }

  reset(): void {
    this.currentWaveIndex = 0;
    this.elapsedTime = 0;
    this.spawnTimers.clear();
    this.activeEnemyCount = 0;
    this.activeEliteCount = 0;
    this.playerDeathActive = false;
  }

  getCurrentWave(): number {
    return this.currentWaveIndex + 1;
  }

  getElapsedTime(): number {
    return this.elapsedTime;
  }
  
  /** Set elapsed time (used by guest to sync timer from host) */
  setElapsedTime(time: number): void {
    this.elapsedTime = time;
  }
}
