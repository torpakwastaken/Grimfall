import Phaser from 'phaser';
import { runtimeConfig } from './RuntimeConfig';
import { Player } from '@/entities/Player';

// TTK Target ranges
const TTK_TARGETS = {
  grunt: { min: 1.5, max: 2.5 },
  elite: { min: 6, max: 10 },
  bossPhase: { min: 60, max: 90 }
};

// Stat tracking interfaces
interface PlayerStats {
  damageDealt: number[];      // Rolling window for DPS
  damageTaken: number[];      // Rolling window for DPS taken
  xpGained: number[];         // Rolling window for XP/min
  revivesUsed: number;
  activeUpgrades: Map<string, number>;  // upgrade id -> stack count
}

interface EnemyStats {
  spawnTimes: Map<number, number>;  // enemy id -> spawn time
  lifetimes: number[];              // Rolling window of lifetimes
  killTimes: number[];              // Time to kill for TTK calc
}

interface RunSnapshot {
  minute: number;
  enemiesKilled: number;
  totalDamageDealt: number;
  totalDamageTaken: number;
  playerDeaths: number[];
  elitesKilled: number;
  xpCollected: number;
  currentLevel: number;
}

export class DebugOverlay {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private isVisible: boolean = false;
  
  // UI Elements
  private panels: Map<string, Phaser.GameObjects.Container> = new Map();
  private textElements: Map<string, Phaser.GameObjects.Text> = new Map();
  private sliders: Map<string, { bar: Phaser.GameObjects.Rectangle, handle: Phaser.GameObjects.Rectangle, value: number, min: number, max: number }> = new Map();
  
  // Tracking data
  private startTime: number = 0;
  private playerStats: Map<number, PlayerStats> = new Map();
  private enemyStats: EnemyStats;
  private snapshots: RunSnapshot[] = [];
  private lastSnapshotMinute: number = -1;
  
  // Counters
  private enemiesAlive: number = 0;
  private enemiesSpawned: number = 0;
  private enemiesKilled: number = 0;
  private elitesAlive: number = 0;
  private elitesKilled: number = 0;
  private totalXPCollected: number = 0;
  private currentLevel: number = 1;
  private currentWave: number = 1;
  private bossHP: number = 0;
  private bossMaxHP: number = 0;
  
  // Death tracking
  private deathCauses: Map<string, number> = new Map();
  
  // Players reference
  private players: Player[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.startTime = Date.now();
    
    this.enemyStats = {
      spawnTimes: new Map(),
      lifetimes: [],
      killTimes: []
    };
    
    // Initialize player stats
    this.playerStats.set(1, this.createEmptyPlayerStats());
    this.playerStats.set(2, this.createEmptyPlayerStats());
    
    // Create main container (initially hidden)
    this.container = scene.add.container(0, 0);
    this.container.setDepth(10000);
    this.container.setScrollFactor(0);
    this.container.setVisible(false);
    
    this.createUI();
    this.setupInputs();
    this.setupEventListeners();
  }

  private createEmptyPlayerStats(): PlayerStats {
    return {
      damageDealt: [],
      damageTaken: [],
      xpGained: [],
      revivesUsed: 0,
      activeUpgrades: new Map()
    };
  }

  private createUI(): void {
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    
    // Semi-transparent background
    const bg = this.scene.add.rectangle(0, 0, width, height, 0x000000, 0.85);
    bg.setOrigin(0, 0);
    this.container.add(bg);
    
    // Title
    const title = this.scene.add.text(width / 2, 10, '🔧 DEBUG OVERLAY (~ to close)', {
      fontSize: '18px',
      color: '#00ffff',
      fontFamily: 'monospace'
    }).setOrigin(0.5, 0);
    this.container.add(title);
    
    // Create panels
    this.createRunStatePanel(10, 40);
    this.createPlayerPanel(1, 10, 180);
    this.createPlayerPanel(2, 220, 180);
    this.createEnemyPanel(430, 180);
    this.createScalingPanel(10, 420);
    this.createTTKPanel(430, 40);
    this.createExportButton(width - 120, height - 40);
  }

  private createPanel(x: number, y: number, width: number, height: number, title: string): Phaser.GameObjects.Container {
    const panel = this.scene.add.container(x, y);
    
    // Panel background
    const bg = this.scene.add.rectangle(0, 0, width, height, 0x1a1a2e, 0.95);
    bg.setOrigin(0, 0);
    bg.setStrokeStyle(1, 0x00ffff);
    panel.add(bg);
    
    // Panel title
    const titleText = this.scene.add.text(5, 5, title, {
      fontSize: '12px',
      color: '#00ffff',
      fontFamily: 'monospace',
      fontStyle: 'bold'
    });
    panel.add(titleText);
    
    this.container.add(panel);
    return panel;
  }

  private createRunStatePanel(x: number, y: number): void {
    const panel = this.createPanel(x, y, 200, 130, '📊 RUN STATE');
    this.panels.set('runState', panel);
    
    const labels = ['Time:', 'Wave:', 'Enemies:', 'FPS:', 'Frame:'];
    const keys = ['time', 'wave', 'enemies', 'fps', 'frameTime'];
    
    labels.forEach((label, i) => {
      const labelText = this.scene.add.text(10, 25 + i * 20, label, {
        fontSize: '11px',
        color: '#888888',
        fontFamily: 'monospace'
      });
      panel.add(labelText);
      
      const valueText = this.scene.add.text(80, 25 + i * 20, '--', {
        fontSize: '11px',
        color: '#ffffff',
        fontFamily: 'monospace'
      });
      panel.add(valueText);
      this.textElements.set(`runState_${keys[i]}`, valueText);
    });
  }

  private createPlayerPanel(playerId: number, x: number, y: number): void {
    const panel = this.createPanel(x, y, 200, 230, `🎮 PLAYER ${playerId}`);
    this.panels.set(`player${playerId}`, panel);
    
    const labels = ['HP:', 'DPS (5s):', 'Dmg Taken/s:', 'XP/min:', 'Revives:', 'Upgrades:'];
    const keys = ['hp', 'dps', 'dps_taken', 'xpm', 'revives', 'upgrades'];
    
    labels.forEach((label, i) => {
      const labelText = this.scene.add.text(10, 25 + i * 18, label, {
        fontSize: '10px',
        color: '#888888',
        fontFamily: 'monospace'
      });
      panel.add(labelText);
      
      const valueText = this.scene.add.text(90, 25 + i * 18, '--', {
        fontSize: '10px',
        color: '#ffffff',
        fontFamily: 'monospace',
        wordWrap: { width: 100 }
      });
      panel.add(valueText);
      this.textElements.set(`player${playerId}_${keys[i]}`, valueText);
    });
    
    // Upgrade list area
    const upgradeList = this.scene.add.text(10, 140, '', {
      fontSize: '9px',
      color: '#aaffaa',
      fontFamily: 'monospace',
      wordWrap: { width: 180 }
    });
    panel.add(upgradeList);
    this.textElements.set(`player${playerId}_upgradeList`, upgradeList);
  }

  private createEnemyPanel(x: number, y: number): void {
    const panel = this.createPanel(x, y, 200, 150, '👾 ENEMIES');
    this.panels.set('enemies', panel);
    
    const labels = ['Avg HP:', 'Avg Lifetime:', 'Elites:', 'Boss HP:', 'Total Killed:'];
    const keys = ['avgHp', 'avgLifetime', 'elites', 'bossHp', 'killed'];
    
    labels.forEach((label, i) => {
      const labelText = this.scene.add.text(10, 25 + i * 22, label, {
        fontSize: '11px',
        color: '#888888',
        fontFamily: 'monospace'
      });
      panel.add(labelText);
      
      const valueText = this.scene.add.text(110, 25 + i * 22, '--', {
        fontSize: '11px',
        color: '#ffffff',
        fontFamily: 'monospace'
      });
      panel.add(valueText);
      this.textElements.set(`enemy_${keys[i]}`, valueText);
    });
  }

  private createScalingPanel(x: number, y: number): void {
    const panel = this.createPanel(x, y, 400, 180, '🎚️ SCALING CONTROLS (Live)');
    this.panels.set('scaling', panel);
    
    const sliderConfigs = [
      { key: 'enemyHpMultiplier', label: 'Enemy HP', min: 0.1, max: 5.0 },
      { key: 'enemyDamageMultiplier', label: 'Enemy Dmg', min: 0.1, max: 5.0 },
      { key: 'spawnRateMultiplier', label: 'Spawn Rate', min: 0.1, max: 3.0 },
      { key: 'eliteChanceMultiplier', label: 'Elite Chance', min: 0.0, max: 5.0 },
      { key: 'xpGainMultiplier', label: 'XP Gain', min: 0.1, max: 5.0 }
    ];
    
    sliderConfigs.forEach((config, i) => {
      this.createSlider(panel, 10, 30 + i * 28, config.key, config.label, config.min, config.max);
    });
    
    // Reset button
    const resetBtn = this.scene.add.text(320, 150, '[RESET]', {
      fontSize: '12px',
      color: '#ff6666',
      fontFamily: 'monospace',
      backgroundColor: '#331111',
      padding: { x: 8, y: 4 }
    }).setInteractive({ useHandCursor: true });
    
    resetBtn.on('pointerdown', () => {
      runtimeConfig.reset();
      this.updateSliderPositions();
    });
    resetBtn.on('pointerover', () => resetBtn.setColor('#ffffff'));
    resetBtn.on('pointerout', () => resetBtn.setColor('#ff6666'));
    panel.add(resetBtn);
  }

  private createSlider(panel: Phaser.GameObjects.Container, x: number, y: number, key: string, label: string, min: number, max: number): void {
    // Label
    const labelText = this.scene.add.text(x, y, label, {
      fontSize: '10px',
      color: '#888888',
      fontFamily: 'monospace'
    });
    panel.add(labelText);
    
    // Slider track
    const trackX = x + 90;
    const track = this.scene.add.rectangle(trackX, y + 6, 200, 8, 0x333333);
    track.setOrigin(0, 0.5);
    panel.add(track);
    
    // Slider fill
    const bar = this.scene.add.rectangle(trackX, y + 6, 100, 8, 0x00aaff);
    bar.setOrigin(0, 0.5);
    panel.add(bar);
    
    // Slider handle
    const handle = this.scene.add.rectangle(trackX + 100, y + 6, 12, 16, 0xffffff);
    handle.setOrigin(0.5, 0.5);
    handle.setInteractive({ useHandCursor: true, draggable: true });
    panel.add(handle);
    
    // Value text
    const valueText = this.scene.add.text(trackX + 210, y, '1.00', {
      fontSize: '10px',
      color: '#ffffff',
      fontFamily: 'monospace'
    });
    panel.add(valueText);
    this.textElements.set(`slider_${key}`, valueText);
    
    // Store slider data
    const currentValue = runtimeConfig.get(key as any) as number;
    this.sliders.set(key, { bar, handle, value: currentValue, min, max });
    
    // Update initial position
    const normalizedValue = (currentValue - min) / (max - min);
    bar.width = normalizedValue * 200;
    handle.x = trackX + normalizedValue * 200;
    valueText.setText(currentValue.toFixed(2));
    
    // Drag handling
    handle.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number) => {
      const clampedX = Phaser.Math.Clamp(dragX, trackX, trackX + 200);
      handle.x = clampedX;
      bar.width = clampedX - trackX;
      
      const normalized = (clampedX - trackX) / 200;
      const newValue = min + normalized * (max - min);
      
      const slider = this.sliders.get(key)!;
      slider.value = newValue;
      valueText.setText(newValue.toFixed(2));
      
      // Update runtime config
      runtimeConfig.set(key as any, newValue);
    });
  }

  private updateSliderPositions(): void {
    this.sliders.forEach((slider, key) => {
      const currentValue = runtimeConfig.get(key as any) as number;
      slider.value = currentValue;
      
      const normalized = (currentValue - slider.min) / (slider.max - slider.min);
      const panel = this.panels.get('scaling')!;
      const trackX = panel.x + 100;
      
      slider.bar.width = normalized * 200;
      slider.handle.x = trackX + normalized * 200;
      
      const valueText = this.textElements.get(`slider_${key}`);
      if (valueText) valueText.setText(currentValue.toFixed(2));
    });
  }

  private createTTKPanel(x: number, y: number): void {
    const panel = this.createPanel(x, y, 200, 130, '⏱️ TTK TARGETS');
    this.panels.set('ttk', panel);
    
    const targets = [
      { key: 'grunt', label: 'Grunt TTK:', target: '1.5-2.5s' },
      { key: 'elite', label: 'Elite TTK:', target: '6-10s' },
      { key: 'boss', label: 'Boss Phase:', target: '60-90s' }
    ];
    
    targets.forEach((t, i) => {
      const labelText = this.scene.add.text(10, 25 + i * 30, t.label, {
        fontSize: '11px',
        color: '#888888',
        fontFamily: 'monospace'
      });
      panel.add(labelText);
      
      const targetText = this.scene.add.text(100, 25 + i * 30, t.target, {
        fontSize: '10px',
        color: '#666666',
        fontFamily: 'monospace'
      });
      panel.add(targetText);
      
      const valueText = this.scene.add.text(100, 40 + i * 30, '--', {
        fontSize: '12px',
        color: '#00ff00',
        fontFamily: 'monospace'
      });
      panel.add(valueText);
      this.textElements.set(`ttk_${t.key}`, valueText);
    });
  }

  private createExportButton(x: number, y: number): void {
    const btn = this.scene.add.text(x, y, '📥 EXPORT JSON', {
      fontSize: '12px',
      color: '#00ffff',
      fontFamily: 'monospace',
      backgroundColor: '#0a2a3a',
      padding: { x: 10, y: 6 }
    }).setInteractive({ useHandCursor: true });
    
    btn.on('pointerdown', () => this.exportRunStats());
    btn.on('pointerover', () => btn.setBackgroundColor('#1a4a5a'));
    btn.on('pointerout', () => btn.setBackgroundColor('#0a2a3a'));
    
    this.container.add(btn);
  }

  private setupInputs(): void {
    // Toggle with ~ (backtick) or F1
    this.scene.input.keyboard?.on('keydown-F1', () => this.toggle());
    
    // Backtick key
    this.scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.BACKTICK)
      .on('down', () => this.toggle());
  }

  private setupEventListeners(): void {
    // Enemy spawned
    this.scene.events.on('enemySpawned', (data: { id: number, isElite: boolean }) => {
      this.enemiesSpawned++;
      this.enemiesAlive++;
      this.enemyStats.spawnTimes.set(data.id, Date.now());
      if (data.isElite) this.elitesAlive++;
    });
    
    // Enemy killed
    this.scene.events.on('enemyKilled', (data: { id: number, isElite: boolean, hp: number }) => {
      this.enemiesKilled++;
      this.enemiesAlive--;
      
      const spawnTime = this.enemyStats.spawnTimes.get(data.id);
      if (spawnTime) {
        const lifetime = (Date.now() - spawnTime) / 1000;
        this.enemyStats.lifetimes.push(lifetime);
        this.enemyStats.killTimes.push(lifetime);
        
        // Keep rolling window of last 50
        if (this.enemyStats.lifetimes.length > 50) this.enemyStats.lifetimes.shift();
        if (this.enemyStats.killTimes.length > 50) this.enemyStats.killTimes.shift();
        
        this.enemyStats.spawnTimes.delete(data.id);
      }
      
      if (data.isElite) {
        this.elitesAlive--;
        this.elitesKilled++;
      }
    });
    
    // Player damage dealt
    this.scene.events.on('damageDealt', (data: { playerId: number, amount: number }) => {
      const stats = this.playerStats.get(data.playerId);
      if (stats) {
        stats.damageDealt.push(data.amount);
        if (stats.damageDealt.length > 300) stats.damageDealt.shift(); // ~5 seconds at 60fps
      }
    });
    
    // Player damage taken
    this.scene.events.on('playerDamaged', (data: { playerId: number, amount: number, source: string }) => {
      const stats = this.playerStats.get(data.playerId);
      if (stats) {
        stats.damageTaken.push(data.amount);
        if (stats.damageTaken.length > 300) stats.damageTaken.shift();
      }
      
      // Track death causes
      const count = this.deathCauses.get(data.source) || 0;
      this.deathCauses.set(data.source, count + 1);
    });
    
    // XP collected
    this.scene.events.on('xpCollected', (data: { playerId: number, amount: number }) => {
      this.totalXPCollected += data.amount;
      const stats = this.playerStats.get(data.playerId);
      if (stats) {
        stats.xpGained.push(data.amount);
        if (stats.xpGained.length > 3600) stats.xpGained.shift(); // ~1 minute at 60fps
      }
    });
    
    // Level up
    this.scene.events.on('levelUp', (data: { level: number }) => {
      this.currentLevel = data.level;
    });
    
    // Wave changed
    this.scene.events.on('waveChanged', (data: { wave: number }) => {
      this.currentWave = data.wave;
    });
    
    // Player revived
    this.scene.events.on('playerRevived', (playerId: number) => {
      const stats = this.playerStats.get(playerId);
      if (stats) stats.revivesUsed++;
    });
    
    // Upgrade applied
    this.scene.events.on('upgradeApplied', (data: { playerId: number, upgradeId: string }) => {
      const stats = this.playerStats.get(data.playerId);
      if (stats) {
        const current = stats.activeUpgrades.get(data.upgradeId) || 0;
        stats.activeUpgrades.set(data.upgradeId, current + 1);
      }
    });
    
    // Boss spawned/damaged
    this.scene.events.on('bossSpawned', (data: { maxHp: number }) => {
      this.bossMaxHP = data.maxHp;
      this.bossHP = data.maxHp;
    });
    
    this.scene.events.on('bossHpChanged', (data: { hp: number }) => {
      this.bossHP = data.hp;
    });
  }

  setPlayers(players: Player[]): void {
    this.players = players;
  }

  toggle(): void {
    this.isVisible = !this.isVisible;
    this.container.setVisible(this.isVisible);
  }

  update(): void {
    if (!this.isVisible) return;
    
    const now = Date.now();
    const elapsed = (now - this.startTime) / 1000;
    const currentMinute = Math.floor(elapsed / 60);
    
    // Take snapshot every minute
    if (currentMinute > this.lastSnapshotMinute) {
      this.takeSnapshot(currentMinute);
      this.lastSnapshotMinute = currentMinute;
    }
    
    this.updateRunStatePanel(elapsed);
    this.updatePlayerPanels();
    this.updateEnemyPanel();
    this.updateTTKPanel();
  }

  private updateRunStatePanel(elapsed: number): void {
    const minutes = Math.floor(elapsed / 60);
    const seconds = Math.floor(elapsed % 60);
    
    this.textElements.get('runState_time')?.setText(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    this.textElements.get('runState_wave')?.setText(`${this.currentWave}`);
    this.textElements.get('runState_enemies')?.setText(`${this.enemiesAlive} / ${this.enemiesSpawned}`);
    this.textElements.get('runState_fps')?.setText(`${Math.round(this.scene.game.loop.actualFps)}`);
    this.textElements.get('runState_frameTime')?.setText(`${this.scene.game.loop.delta.toFixed(1)}ms`);
  }

  private updatePlayerPanels(): void {
    this.players.forEach((player, index) => {
      const playerId = player.playerId;
      const stats = this.playerStats.get(playerId);
      if (!stats) return;
      
      // HP
      const hpText = `${Math.round(player.health.current)} / ${player.health.max}`;
      this.textElements.get(`player${playerId}_hp`)?.setText(hpText);
      
      // DPS (sum of last 5 seconds of damage / 5)
      const dps = stats.damageDealt.reduce((a, b) => a + b, 0) / 5;
      this.textElements.get(`player${playerId}_dps`)?.setText(dps.toFixed(0));
      
      // Damage taken per second
      const dps_taken = stats.damageTaken.reduce((a, b) => a + b, 0) / 5;
      this.textElements.get(`player${playerId}_dps_taken`)?.setText(dps_taken.toFixed(0));
      
      // XP per minute
      const xpm = stats.xpGained.reduce((a, b) => a + b, 0);
      this.textElements.get(`player${playerId}_xpm`)?.setText(xpm.toFixed(0));
      
      // Revives
      this.textElements.get(`player${playerId}_revives`)?.setText(`${stats.revivesUsed}`);
      
      // Upgrade count
      const upgradeCount = Array.from(stats.activeUpgrades.values()).reduce((a, b) => a + b, 0);
      this.textElements.get(`player${playerId}_upgrades`)?.setText(`${upgradeCount}`);
      
      // Upgrade list
      let upgradeList = '';
      stats.activeUpgrades.forEach((count, id) => {
        const shortId = id.length > 12 ? id.substring(0, 12) + '..' : id;
        upgradeList += `• ${shortId}${count > 1 ? ` x${count}` : ''}\n`;
      });
      this.textElements.get(`player${playerId}_upgradeList`)?.setText(upgradeList || '(none)');
    });
  }

  private updateEnemyPanel(): void {
    // Average HP (would need enemy HP tracking - show placeholder)
    this.textElements.get('enemy_avgHp')?.setText('--');
    
    // Average lifetime
    if (this.enemyStats.lifetimes.length > 0) {
      const avgLifetime = this.enemyStats.lifetimes.reduce((a, b) => a + b, 0) / this.enemyStats.lifetimes.length;
      this.textElements.get('enemy_avgLifetime')?.setText(`${avgLifetime.toFixed(1)}s`);
    }
    
    // Elites
    this.textElements.get('enemy_elites')?.setText(`${this.elitesAlive} (${this.elitesKilled} killed)`);
    
    // Boss HP
    if (this.bossMaxHP > 0) {
      const percent = (this.bossHP / this.bossMaxHP * 100).toFixed(0);
      this.textElements.get('enemy_bossHp')?.setText(`${percent}%`);
    } else {
      this.textElements.get('enemy_bossHp')?.setText('--');
    }
    
    // Total killed
    this.textElements.get('enemy_killed')?.setText(`${this.enemiesKilled}`);
  }

  private updateTTKPanel(): void {
    // Calculate average TTK from recent kills
    if (this.enemyStats.killTimes.length > 0) {
      const avgTTK = this.enemyStats.killTimes.reduce((a, b) => a + b, 0) / this.enemyStats.killTimes.length;
      
      // Grunt TTK (assuming most kills are grunts)
      const gruntText = this.textElements.get('ttk_grunt');
      if (gruntText) {
        gruntText.setText(`${avgTTK.toFixed(2)}s`);
        gruntText.setColor(this.getTTKColor(avgTTK, TTK_TARGETS.grunt));
      }
    }
    
    // Elite and Boss TTK would need separate tracking
    // For now show placeholders
    this.textElements.get('ttk_elite')?.setText('--');
    this.textElements.get('ttk_boss')?.setText('--');
  }

  private getTTKColor(value: number, target: { min: number, max: number }): string {
    if (value >= target.min && value <= target.max) return '#00ff00'; // Green - on target
    if (value >= target.min * 0.7 && value <= target.max * 1.3) return '#ffff00'; // Yellow - drifting
    return '#ff0000'; // Red - broken
  }

  private takeSnapshot(minute: number): void {
    const snapshot: RunSnapshot = {
      minute,
      enemiesKilled: this.enemiesKilled,
      totalDamageDealt: this.players.reduce((sum, p) => {
        const stats = this.playerStats.get(p.playerId);
        return sum + (stats?.damageDealt.reduce((a, b) => a + b, 0) || 0);
      }, 0),
      totalDamageTaken: this.players.reduce((sum, p) => {
        const stats = this.playerStats.get(p.playerId);
        return sum + (stats?.damageTaken.reduce((a, b) => a + b, 0) || 0);
      }, 0),
      playerDeaths: this.players.map(p => this.playerStats.get(p.playerId)?.revivesUsed || 0),
      elitesKilled: this.elitesKilled,
      xpCollected: this.totalXPCollected,
      currentLevel: this.currentLevel
    };
    
    this.snapshots.push(snapshot);
  }

  private exportRunStats(): void {
    const exportData = {
      runDuration: (Date.now() - this.startTime) / 1000,
      finalLevel: this.currentLevel,
      totalEnemiesKilled: this.enemiesKilled,
      totalElitesKilled: this.elitesKilled,
      totalXPCollected: this.totalXPCollected,
      deathCauses: Object.fromEntries(this.deathCauses),
      runtimeConfig: runtimeConfig.getAll(),
      snapshots: this.snapshots,
      playerUpgrades: this.players.map(p => ({
        playerId: p.playerId,
        upgrades: Object.fromEntries(this.playerStats.get(p.playerId)?.activeUpgrades || new Map())
      }))
    };
    
    const json = JSON.stringify(exportData, null, 2);
    
    // Create download
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `grimfall_run_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('Run stats exported!', exportData);
  }

  destroy(): void {
    this.container.destroy();
    this.scene.events.off('enemySpawned');
    this.scene.events.off('enemyKilled');
    this.scene.events.off('damageDealt');
    this.scene.events.off('playerDamaged');
    this.scene.events.off('xpCollected');
    this.scene.events.off('levelUp');
    this.scene.events.off('waveChanged');
    this.scene.events.off('playerRevived');
    this.scene.events.off('upgradeApplied');
    this.scene.events.off('bossSpawned');
    this.scene.events.off('bossHpChanged');
  }
}
