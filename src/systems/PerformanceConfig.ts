/**
 * PerformanceConfig - Hard caps and performance guardrails
 * 
 * Philosophy:
 * - Frame rate stability > visual fidelity
 * - Hard caps are NON-NEGOTIABLE
 * - Auto-scale effects based on device capability
 * - Mobile-first mindset
 */

export interface PerformanceProfile {
  name: string;
  maxEnemies: number;
  maxProjectiles: number;
  maxParticlesPerSec: number;
  maxDamageNumbers: number;
  enableShaders: boolean;
  enableParticles: boolean;
  enableScreenShake: boolean;
  enableBuffBeams: boolean;
  targetFPS: number;
}

// Profiles for different device capabilities
export const PERFORMANCE_PROFILES: Record<string, PerformanceProfile> = {
  // High-end PC/Gaming laptop
  high: {
    name: 'High',
    maxEnemies: 500,
    maxProjectiles: 1000,
    maxParticlesPerSec: 200,
    maxDamageNumbers: 40,
    enableShaders: true,
    enableParticles: true,
    enableScreenShake: true,
    enableBuffBeams: true,
    targetFPS: 60
  },
  
  // Standard desktop/laptop
  medium: {
    name: 'Medium',
    maxEnemies: 300,
    maxProjectiles: 600,
    maxParticlesPerSec: 100,
    maxDamageNumbers: 25,
    enableShaders: true,
    enableParticles: true,
    enableScreenShake: true,
    enableBuffBeams: true,
    targetFPS: 60
  },
  
  // Low-end PC / High-end mobile
  low: {
    name: 'Low',
    maxEnemies: 150,
    maxProjectiles: 300,
    maxParticlesPerSec: 50,
    maxDamageNumbers: 15,
    enableShaders: false,
    enableParticles: true,
    enableScreenShake: true,
    enableBuffBeams: false,
    targetFPS: 60
  },
  
  // Budget mobile / Potato mode
  potato: {
    name: 'Potato',
    maxEnemies: 80,
    maxProjectiles: 150,
    maxParticlesPerSec: 20,
    maxDamageNumbers: 8,
    enableShaders: false,
    enableParticles: false,
    enableScreenShake: false,
    enableBuffBeams: false,
    targetFPS: 30
  }
};

// Hard limits (NEVER exceed these regardless of profile)
export const HARD_LIMITS = {
  ABSOLUTE_MAX_ENEMIES: 500,
  ABSOLUTE_MAX_PROJECTILES: 1000,
  ABSOLUTE_MAX_PARTICLES: 300,
  MIN_FPS_THRESHOLD: 30, // Below this = potato mode
  FPS_SAMPLE_WINDOW: 60, // Frames to average
  DOWNGRADE_THRESHOLD: 45, // FPS below this triggers downgrade
  UPGRADE_THRESHOLD: 58, // FPS above this for sustained period triggers upgrade
  UPGRADE_SUSTAIN_TIME: 5000 // ms of good FPS before upgrading
};

export class PerformanceManager {
  private currentProfile: PerformanceProfile;
  private fpsHistory: number[] = [];
  private lastProfileChange: number = 0;
  private sustainedGoodFPSStart: number = 0;
  private callbacks: Map<string, (profile: PerformanceProfile) => void> = new Map();
  
  constructor(initialProfile: keyof typeof PERFORMANCE_PROFILES = 'medium') {
    this.currentProfile = { ...PERFORMANCE_PROFILES[initialProfile] };
  }

  /**
   * Get current performance profile
   */
  getProfile(): PerformanceProfile {
    return this.currentProfile;
  }

  /**
   * Check if an action should be allowed based on current limits
   */
  canSpawnEnemy(currentCount: number): boolean {
    return currentCount < Math.min(
      this.currentProfile.maxEnemies,
      HARD_LIMITS.ABSOLUTE_MAX_ENEMIES
    );
  }

  canSpawnProjectile(currentCount: number): boolean {
    return currentCount < Math.min(
      this.currentProfile.maxProjectiles,
      HARD_LIMITS.ABSOLUTE_MAX_PROJECTILES
    );
  }

  canSpawnParticle(currentRate: number): boolean {
    return currentRate < this.currentProfile.maxParticlesPerSec;
  }

  /**
   * Update with current frame timing
   * Call this every frame from game loop
   */
  update(fps: number, currentTime: number): void {
    // Track FPS history
    this.fpsHistory.push(fps);
    if (this.fpsHistory.length > HARD_LIMITS.FPS_SAMPLE_WINDOW) {
      this.fpsHistory.shift();
    }
    
    // Don't change profiles too frequently (minimum 2s between changes)
    if (currentTime - this.lastProfileChange < 2000) {
      return;
    }
    
    const avgFPS = this.getAverageFPS();
    
    // Check for downgrade needed
    if (avgFPS < HARD_LIMITS.DOWNGRADE_THRESHOLD) {
      this.downgradeProfile(currentTime);
      this.sustainedGoodFPSStart = 0;
    }
    // Check for upgrade possible
    else if (avgFPS > HARD_LIMITS.UPGRADE_THRESHOLD) {
      if (this.sustainedGoodFPSStart === 0) {
        this.sustainedGoodFPSStart = currentTime;
      } else if (currentTime - this.sustainedGoodFPSStart > HARD_LIMITS.UPGRADE_SUSTAIN_TIME) {
        this.upgradeProfile(currentTime);
        this.sustainedGoodFPSStart = 0;
      }
    } else {
      this.sustainedGoodFPSStart = 0;
    }
  }

  /**
   * Get average FPS over sample window
   */
  getAverageFPS(): number {
    if (this.fpsHistory.length === 0) return 60;
    return this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
  }

  /**
   * Downgrade to lower performance profile
   */
  private downgradeProfile(currentTime: number): void {
    const profiles = Object.keys(PERFORMANCE_PROFILES);
    const currentIndex = profiles.findIndex(p => 
      PERFORMANCE_PROFILES[p].maxEnemies === this.currentProfile.maxEnemies
    );
    
    if (currentIndex < profiles.length - 1) {
      const newProfileKey = profiles[currentIndex + 1];
      this.currentProfile = { ...PERFORMANCE_PROFILES[newProfileKey] };
      this.lastProfileChange = currentTime;
      console.log(`[Performance] Downgraded to ${this.currentProfile.name} profile`);
      this.notifyCallbacks();
    }
  }

  /**
   * Upgrade to higher performance profile
   */
  private upgradeProfile(currentTime: number): void {
    const profiles = Object.keys(PERFORMANCE_PROFILES);
    const currentIndex = profiles.findIndex(p => 
      PERFORMANCE_PROFILES[p].maxEnemies === this.currentProfile.maxEnemies
    );
    
    if (currentIndex > 0) {
      const newProfileKey = profiles[currentIndex - 1];
      this.currentProfile = { ...PERFORMANCE_PROFILES[newProfileKey] };
      this.lastProfileChange = currentTime;
      console.log(`[Performance] Upgraded to ${this.currentProfile.name} profile`);
      this.notifyCallbacks();
    }
  }

  /**
   * Force a specific profile (for settings menu)
   */
  setProfile(profileKey: keyof typeof PERFORMANCE_PROFILES): void {
    this.currentProfile = { ...PERFORMANCE_PROFILES[profileKey] };
    this.lastProfileChange = Date.now();
    console.log(`[Performance] Manually set to ${this.currentProfile.name} profile`);
    this.notifyCallbacks();
  }

  /**
   * Register callback for profile changes
   */
  onProfileChange(id: string, callback: (profile: PerformanceProfile) => void): void {
    this.callbacks.set(id, callback);
  }

  /**
   * Unregister callback
   */
  offProfileChange(id: string): void {
    this.callbacks.delete(id);
  }

  private notifyCallbacks(): void {
    this.callbacks.forEach(callback => callback(this.currentProfile));
  }

  /**
   * Detect device capabilities and return recommended profile
   */
  static detectOptimalProfile(): keyof typeof PERFORMANCE_PROFILES {
    // Check for mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
    
    if (isMobile) {
      // Check for high-end mobile
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
          // High-end mobile GPUs
          if (/Adreno 6|Mali-G7|Apple GPU/i.test(renderer)) {
            return 'low';
          }
        }
      }
      return 'potato';
    }
    
    // Desktop detection
    const hardwareConcurrency = navigator.hardwareConcurrency || 4;
    const memory = (navigator as unknown as { deviceMemory?: number }).deviceMemory || 4;
    
    if (hardwareConcurrency >= 8 && memory >= 8) {
      return 'high';
    } else if (hardwareConcurrency >= 4 && memory >= 4) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Get debug info string
   */
  getDebugInfo(): string {
    return [
      `Profile: ${this.currentProfile.name}`,
      `Avg FPS: ${this.getAverageFPS().toFixed(1)}`,
      `Max Enemies: ${this.currentProfile.maxEnemies}`,
      `Max Projectiles: ${this.currentProfile.maxProjectiles}`,
      `Shaders: ${this.currentProfile.enableShaders ? 'ON' : 'OFF'}`,
      `Particles: ${this.currentProfile.enableParticles ? 'ON' : 'OFF'}`
    ].join(' | ');
  }
}

// Singleton instance for global access
let performanceManagerInstance: PerformanceManager | null = null;

export function getPerformanceManager(): PerformanceManager {
  if (!performanceManagerInstance) {
    const optimalProfile = PerformanceManager.detectOptimalProfile();
    performanceManagerInstance = new PerformanceManager(optimalProfile);
  }
  return performanceManagerInstance;
}

export function initPerformanceManager(profile?: keyof typeof PERFORMANCE_PROFILES): PerformanceManager {
  const profileToUse = profile || PerformanceManager.detectOptimalProfile();
  performanceManagerInstance = new PerformanceManager(profileToUse);
  return performanceManagerInstance;
}
