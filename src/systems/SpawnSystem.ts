import Phaser from 'phaser';
import { Enemy } from '@/entities/Enemy';
import enemyDataJson from '@/data/enemies.json';
import waveDataJson from '@/data/waves.json';
import { EnemyData, WaveConfig } from '@/types/GameTypes';

export class SpawnSystem {
  private scene: Phaser.Scene;
  private enemyPool: Phaser.GameObjects.Group;
  private enemyData: Map<string, EnemyData> = new Map();
  private waves: WaveConfig[];
  private currentWaveIndex: number = 0;
  private elapsedTime: number = 0;
  private spawnTimers: Map<string, number> = new Map();
  
  // Scaling
  private scaling = waveDataJson.scaling;
  private duoAdjustments = waveDataJson.duoAdjustments;
  
  // Spawn limits
  private maxEnemies: number = 800;
  private activeEnemyCount: number = 0;

  constructor(scene: Phaser.Scene, enemyPool: Phaser.GameObjects.Group) {
    this.scene = scene;
    this.enemyPool = enemyPool;
    this.waves = waveDataJson.waves as WaveConfig[];
    
    // Load enemy data
    Object.entries(enemyDataJson).forEach(([key, data]) => {
      this.enemyData.set(key, data as EnemyData);
    });
  }

  update(time: number, delta: number): void {
    this.elapsedTime += delta;
    const currentSeconds = Math.floor(this.elapsedTime / 1000);
    
    // Update wave
    this.updateWave(currentSeconds);
    
    // Spawn enemies
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
  }

  private spawnEnemies(delta: number): void {
    if (this.currentWaveIndex >= this.waves.length) return;
    if (this.activeEnemyCount >= this.maxEnemies) return;

    const wave = this.waves[this.currentWaveIndex];
    const currentMinute = Math.floor(this.elapsedTime / 60000);

    for (const enemyConfig of wave.enemies) {
      const key = `${this.currentWaveIndex}_${enemyConfig.type}`;
      
      if (!this.spawnTimers.has(key)) {
        this.spawnTimers.set(key, 0);
      }

      let timer = this.spawnTimers.get(key)!;
      timer += delta;

      // Calculate spawn interval with scaling
      const baseInterval = enemyConfig.spawnRate * 1000;
      const scaledInterval = baseInterval * Math.pow(this.scaling.spawnRateMultiplier, currentMinute);
      
      if (timer >= scaledInterval) {
        this.spawnEnemy(enemyConfig.type, currentMinute);
        this.spawnTimers.set(key, 0);
      } else {
        this.spawnTimers.set(key, timer);
      }
    }
  }

  private spawnEnemy(type: string, currentMinute: number): void {
    const baseData = this.enemyData.get(type);
    if (!baseData) {
      console.warn(`Enemy type ${type} not found`);
      return;
    }

    // Apply scaling
    const scaledData = this.applyScaling(baseData, currentMinute);

    // Get spawn position (off-screen)
    const spawnPos = this.getSpawnPosition();

    // Get enemy from pool
    const enemy = this.enemyPool.getFirstDead(false) as Enemy;
    if (enemy) {
      enemy.activate(scaledData, spawnPos.x, spawnPos.y);
      this.activeEnemyCount++;
    }
  }

  private applyScaling(baseData: EnemyData, currentMinute: number): EnemyData {
    const hpMultiplier = Math.pow(1 + this.scaling.hpPerMinute, currentMinute);
    const speedMultiplier = Math.min(
      1 + (this.scaling.speedPerMinute * currentMinute),
      1.3 // Cap at +30%
    );

    return {
      ...baseData,
      hp: Math.floor(baseData.hp * hpMultiplier * this.duoAdjustments.hpMultiplier),
      speed: baseData.speed * speedMultiplier,
      xpValue: Math.floor(baseData.xpValue * this.duoAdjustments.xpMultiplier)
    };
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

  onEnemyKilled(): void {
    this.activeEnemyCount = Math.max(0, this.activeEnemyCount - 1);
  }

  reset(): void {
    this.currentWaveIndex = 0;
    this.elapsedTime = 0;
    this.spawnTimers.clear();
    this.activeEnemyCount = 0;
  }

  getCurrentWave(): number {
    return this.currentWaveIndex + 1;
  }

  getElapsedTime(): number {
    return this.elapsedTime;
  }
}
