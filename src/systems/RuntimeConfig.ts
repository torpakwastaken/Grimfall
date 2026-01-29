// Runtime configuration for live tuning via debug overlay
// All values here can be modified at runtime and reset on reload

export interface RuntimeConfigValues {
  // Enemy scaling multipliers
  enemyHpMultiplier: number;
  enemyDamageMultiplier: number;
  spawnRateMultiplier: number;
  eliteChanceMultiplier: number;
  
  // Player modifiers
  xpGainMultiplier: number;
  playerDamageMultiplier: number;
  
  // Debug flags
  showHitboxes: boolean;
  invinciblePlayers: boolean;
  instantKill: boolean;
}

class RuntimeConfig {
  private values: RuntimeConfigValues;
  private defaults: RuntimeConfigValues;

  constructor() {
    this.defaults = {
      enemyHpMultiplier: 1.0,
      enemyDamageMultiplier: 1.0,
      spawnRateMultiplier: 1.0,
      eliteChanceMultiplier: 1.0,
      xpGainMultiplier: 1.0,
      playerDamageMultiplier: 1.0,
      showHitboxes: false,
      invinciblePlayers: false,
      instantKill: false
    };
    
    this.values = { ...this.defaults };
  }

  get<K extends keyof RuntimeConfigValues>(key: K): RuntimeConfigValues[K] {
    return this.values[key];
  }

  set<K extends keyof RuntimeConfigValues>(key: K, value: RuntimeConfigValues[K]): void {
    this.values[key] = value;
  }

  reset(): void {
    this.values = { ...this.defaults };
  }

  getAll(): RuntimeConfigValues {
    return { ...this.values };
  }

  // Serialization for export
  toJSON(): string {
    return JSON.stringify(this.values, null, 2);
  }
}

// Singleton instance
export const runtimeConfig = new RuntimeConfig();
