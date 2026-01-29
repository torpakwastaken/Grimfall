import Phaser from 'phaser';

/**
 * ComebackSystem - Manages death spiral prevention with priority-based mechanics
 * 
 * Rule: Only ONE comeback mechanic should be active at a time
 * Priority order:
 * 1. Mercy Invuln (highest)
 * 2. Spawn Reduction
 * 3. Desperation Mode
 * 4. XP Burst (lowest)
 * 
 * Never stack all four.
 */

export enum ComebackMechanic {
  NONE = 'none',
  MERCY_INVULN = 'mercy_invuln',
  SPAWN_REDUCTION = 'spawn_reduction',
  DESPERATION_MODE = 'desperation_mode',
  XP_BURST = 'xp_burst'
}

interface ComebackState {
  activeMechanic: ComebackMechanic;
  mercyInvulnCooldown: number;
  desperationActive: boolean;
  xpBurstUntil: number;
}

export class ComebackSystem {
  private scene: Phaser.Scene;
  private state: ComebackState;
  
  // Configurable thresholds
  private readonly MERCY_INVULN_DURATION = 3000;     // 3 seconds
  private readonly MERCY_INVULN_COOLDOWN = 60000;    // 60 seconds
  private readonly DESPERATION_HP_THRESHOLD = 0.25; // 25% HP
  private readonly DESPERATION_DAMAGE_BONUS = 0.2;  // +20% damage
  private readonly DESPERATION_SPEED_BONUS = 0.1;   // +10% speed
  private readonly XP_BURST_DURATION = 5000;        // 5 seconds
  private readonly XP_BURST_MULTIPLIER = 2.0;       // 2x XP

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    
    this.state = {
      activeMechanic: ComebackMechanic.NONE,
      mercyInvulnCooldown: 0,
      desperationActive: false,
      xpBurstUntil: 0
    };
    
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Player died - trigger highest priority available mechanic
    this.scene.events.on('playerDied', (playerId: number) => {
      this.onPlayerDied(playerId);
    });
    
    // Player revived - check if we should deactivate
    this.scene.events.on('playerRevived', (playerId: number) => {
      this.onPlayerRevived(playerId);
    });
    
    // Player HP changed - check for desperation mode
    this.scene.events.on('playerHpChanged', (data: { playerId: number, hpPercent: number }) => {
      this.checkDesperationMode(data.playerId, data.hpPercent);
    });
  }

  private onPlayerDied(playerId: number): void {
    const now = Date.now();
    
    // Try to activate mechanics in priority order
    // Only activate ONE at a time
    
    // Priority 1: Mercy Invuln (if off cooldown)
    if (this.state.activeMechanic === ComebackMechanic.NONE && 
        now > this.state.mercyInvulnCooldown) {
      this.activateMercyInvuln(playerId);
      return;
    }
    
    // Priority 2: Spawn Reduction (if mercy invuln not active)
    if (this.state.activeMechanic === ComebackMechanic.NONE) {
      this.activateSpawnReduction();
      return;
    }
    
    // If a mechanic is already active, don't stack
    console.log(`Comeback mechanic already active: ${this.state.activeMechanic}, not stacking`);
  }

  private onPlayerRevived(playerId: number): void {
    // Deactivate spawn reduction when player revives
    if (this.state.activeMechanic === ComebackMechanic.SPAWN_REDUCTION) {
      this.deactivateSpawnReduction();
    }
    
    // Check if both players are alive and healthy - deactivate all
    // (This would need access to player states)
  }

  private checkDesperationMode(playerId: number, hpPercent: number): void {
    // Priority 3: Desperation Mode (when low HP, but not during other mechanics)
    if (hpPercent <= this.DESPERATION_HP_THRESHOLD && 
        this.state.activeMechanic === ComebackMechanic.NONE) {
      this.activateDesperationMode(playerId);
    } else if (hpPercent > this.DESPERATION_HP_THRESHOLD && 
               this.state.activeMechanic === ComebackMechanic.DESPERATION_MODE) {
      this.deactivateDesperationMode(playerId);
    }
  }

  // === MECHANIC ACTIVATIONS ===

  private activateMercyInvuln(playerId: number): void {
    this.state.activeMechanic = ComebackMechanic.MERCY_INVULN;
    this.state.mercyInvulnCooldown = Date.now() + this.MERCY_INVULN_COOLDOWN;
    
    // Grant temporary invulnerability to surviving player
    this.scene.events.emit('grantInvulnerability', { 
      playerId: playerId === 0 ? 1 : 0, // Grant to partner
      duration: this.MERCY_INVULN_DURATION 
    });
    
    console.log(`Comeback: Mercy Invuln activated for partner of player ${playerId}`);
    this.scene.events.emit('comebackActivated', { type: ComebackMechanic.MERCY_INVULN });
    
    // Auto-deactivate after duration
    this.scene.time.delayedCall(this.MERCY_INVULN_DURATION, () => {
      if (this.state.activeMechanic === ComebackMechanic.MERCY_INVULN) {
        this.state.activeMechanic = ComebackMechanic.NONE;
        console.log('Comeback: Mercy Invuln expired');
      }
    });
  }

  private activateSpawnReduction(): void {
    this.state.activeMechanic = ComebackMechanic.SPAWN_REDUCTION;
    
    // Emit event for SpawnSystem to reduce spawns
    this.scene.events.emit('setSpawnReduction', { active: true, reduction: 0.3 });
    
    console.log('Comeback: Spawn Reduction activated (30% fewer spawns)');
    this.scene.events.emit('comebackActivated', { type: ComebackMechanic.SPAWN_REDUCTION });
  }

  private deactivateSpawnReduction(): void {
    this.state.activeMechanic = ComebackMechanic.NONE;
    this.scene.events.emit('setSpawnReduction', { active: false, reduction: 0 });
    console.log('Comeback: Spawn Reduction deactivated');
  }

  private activateDesperationMode(playerId: number): void {
    this.state.activeMechanic = ComebackMechanic.DESPERATION_MODE;
    this.state.desperationActive = true;
    
    // Grant damage and speed bonuses
    this.scene.events.emit('applyDesperationBuff', {
      playerId,
      damageBonus: this.DESPERATION_DAMAGE_BONUS,
      speedBonus: this.DESPERATION_SPEED_BONUS
    });
    
    console.log(`Comeback: Desperation Mode activated for player ${playerId} (+20% dmg, +10% speed)`);
    this.scene.events.emit('comebackActivated', { type: ComebackMechanic.DESPERATION_MODE });
  }

  private deactivateDesperationMode(playerId: number): void {
    this.state.activeMechanic = ComebackMechanic.NONE;
    this.state.desperationActive = false;
    
    this.scene.events.emit('removeDesperationBuff', { playerId });
    console.log(`Comeback: Desperation Mode deactivated for player ${playerId}`);
  }

  activateXPBurst(): void {
    // Priority 4: XP Burst (only if nothing else active)
    if (this.state.activeMechanic !== ComebackMechanic.NONE) {
      console.log('Cannot activate XP Burst - another comeback mechanic is active');
      return;
    }
    
    this.state.activeMechanic = ComebackMechanic.XP_BURST;
    this.state.xpBurstUntil = Date.now() + this.XP_BURST_DURATION;
    
    this.scene.events.emit('setXPMultiplier', { multiplier: this.XP_BURST_MULTIPLIER });
    
    console.log(`Comeback: XP Burst activated (${this.XP_BURST_MULTIPLIER}x XP for ${this.XP_BURST_DURATION / 1000}s)`);
    this.scene.events.emit('comebackActivated', { type: ComebackMechanic.XP_BURST });
    
    // Auto-deactivate after duration
    this.scene.time.delayedCall(this.XP_BURST_DURATION, () => {
      if (this.state.activeMechanic === ComebackMechanic.XP_BURST) {
        this.state.activeMechanic = ComebackMechanic.NONE;
        this.scene.events.emit('setXPMultiplier', { multiplier: 1.0 });
        console.log('Comeback: XP Burst expired');
      }
    });
  }

  // === GETTERS ===

  getActiveMechanic(): ComebackMechanic {
    return this.state.activeMechanic;
  }

  isAnyMechanicActive(): boolean {
    return this.state.activeMechanic !== ComebackMechanic.NONE;
  }

  getXPMultiplier(): number {
    return this.state.activeMechanic === ComebackMechanic.XP_BURST 
      ? this.XP_BURST_MULTIPLIER 
      : 1.0;
  }

  destroy(): void {
    this.scene.events.off('playerDied');
    this.scene.events.off('playerRevived');
    this.scene.events.off('playerHpChanged');
  }
}
