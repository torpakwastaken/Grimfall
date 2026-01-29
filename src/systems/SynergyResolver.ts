import Phaser from 'phaser';
import { SynergyDefinition, SynergyTag, CombatEvent } from '../types/WeaponTypes';
import synergiesData from '../data/synergies.json';

/**
 * SynergyResolver - Detects and resolves cross-player synergy combos
 * 
 * Responsibilities:
 * - Load synergy definitions from JSON
 * - Track combat events within time windows
 * - Detect when synergy conditions are met
 * - Execute synergy effects (explosions, buffs, etc.)
 * - Display combo feedback
 */
export class SynergyResolver {
  private scene: Phaser.Scene;
  private synergies: Map<string, SynergyDefinition> = new Map();
  private passiveSynergies: Map<string, PassiveSynergy> = new Map();
  
  // Event tracking for time-windowed synergies
  private recentEvents: CombatEvent[] = [];
  private eventWindowMs: number = 3000;
  
  // Track target statuses for combo detection
  private targetStatuses: Map<string, Map<string, StatusInfo>> = new Map(); // targetId -> status -> info
  
  // Cooldowns to prevent spam
  private synergyCooldowns: Map<string, number> = new Map();
  private cooldownMs: number = 500;
  
  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.loadDefinitions();
    this.setupEventListeners();
  }
  
  /**
   * Load synergy definitions from JSON
   */
  private loadDefinitions(): void {
    const data = synergiesData as any;
    
    // Load active synergies
    if (data.synergies) {
      for (const [id, def] of Object.entries(data.synergies as Record<string, any>)) {
        const synergy: SynergyDefinition = {
          id: def.id,
          name: def.name,
          description: def.description,
          trigger: def.trigger,
          effect: def.effect,
          visualEffect: def.visualEffect,
          soundEffect: def.soundEffect
        };
        this.synergies.set(id, synergy);
      }
    }
    
    // Load passive synergies
    if (data.passiveSynergies) {
      for (const [id, def] of Object.entries(data.passiveSynergies as Record<string, any>)) {
        this.passiveSynergies.set(id, def as PassiveSynergy);
      }
    }
    
    console.log(`[SynergyResolver] Loaded ${this.synergies.size} synergies, ${this.passiveSynergies.size} passive synergies`);
  }
  
  /**
   * Setup event listeners for combat events
   */
  private setupEventListeners(): void {
    // Listen for combat events
    this.scene.events.on('combat:event', this.handleCombatEvent, this);
    this.scene.events.on('status:applied', this.handleStatusApplied, this);
    this.scene.events.on('status:removed', this.handleStatusRemoved, this);
    this.scene.events.on('enemy:killed', this.handleEnemyKilled, this);
  }
  
  /**
   * Handle incoming combat event
   */
  private handleCombatEvent(event: CombatEvent): void {
    // Store event with timestamp
    event.timestamp = Date.now();
    this.recentEvents.push(event);
    
    // Clean old events
    this.cleanupOldEvents();
    
    // Check for synergy triggers
    this.checkSynergies(event);
  }
  
  /**
   * Handle status application
   */
  private handleStatusApplied(data: { targetId: string, status: string, appliedBy: string, duration: number }): void {
    let targetStatuses = this.targetStatuses.get(data.targetId);
    if (!targetStatuses) {
      targetStatuses = new Map();
      this.targetStatuses.set(data.targetId, targetStatuses);
    }
    
    targetStatuses.set(data.status, {
      appliedBy: data.appliedBy,
      appliedAt: Date.now(),
      expiresAt: Date.now() + data.duration
    });
  }
  
  /**
   * Handle status removal
   */
  private handleStatusRemoved(data: { targetId: string, status: string }): void {
    const targetStatuses = this.targetStatuses.get(data.targetId);
    if (targetStatuses) {
      targetStatuses.delete(data.status);
    }
  }
  
  /**
   * Handle enemy killed - check for death-based synergies
   */
  private handleEnemyKilled(data: { enemy: any, killedBy: string, position: { x: number, y: number } }): void {
    const targetStatuses = this.targetStatuses.get(data.enemy.id || data.enemy);
    
    if (targetStatuses) {
      // Check mark_detonate synergy
      if (targetStatuses.has('marked')) {
        this.triggerSynergy('mark_detonate', {
          position: data.position,
          killedBy: data.killedBy,
          targetId: data.enemy.id || data.enemy
        });
      }
      
      // Clean up statuses for dead enemy
      this.targetStatuses.delete(data.enemy.id || data.enemy);
    }
  }
  
  /**
   * Clean up old events outside the time window
   */
  private cleanupOldEvents(): void {
    const cutoff = Date.now() - this.eventWindowMs;
    this.recentEvents = this.recentEvents.filter(e => (e.timestamp || 0) > cutoff);
  }
  
  /**
   * Check all synergies against recent events
   */
  private checkSynergies(triggeringEvent: CombatEvent): void {
    for (const [id, synergy] of this.synergies) {
      // Check cooldown
      const lastTrigger = this.synergyCooldowns.get(id) || 0;
      if (Date.now() - lastTrigger < this.cooldownMs) {
        continue;
      }
      
      if (this.checkSynergyCondition(synergy, triggeringEvent)) {
        this.executeSynergy(synergy, triggeringEvent);
        this.synergyCooldowns.set(id, Date.now());
      }
    }
  }
  
  /**
   * Check if synergy condition is met
   */
  private checkSynergyCondition(synergy: SynergyDefinition, event: CombatEvent): boolean {
    const trigger = synergy.trigger;
    const triggerType = trigger?.type;
    
    switch (triggerType) {
      case 'both_hit_same_target':
        return this.checkBothHitSameTarget(trigger, event);
        
      case 'hit_status':
        return this.checkHitStatus(trigger, event);
        
      case 'status_interaction':
        return this.checkStatusInteraction(trigger, event);
        
      case 'tag_combo':
        return this.checkTagCombo(trigger, event);
        
      case 'effect_echo':
        return this.checkEffectEcho(trigger, event);
        
      case 'zone_overlap':
        return this.checkZoneOverlap(trigger, event);
        
      default:
        return false;
    }
  }
  
  /**
   * Check both_hit_same_target condition
   */
  private checkBothHitSameTarget(trigger: any, event: CombatEvent): boolean {
    if (event.type !== 'damage' && event.type !== 'projectile_hit') return false;
    
    const targetId = event.targetId;
    if (!targetId) return false;
    
    const window = trigger.window || 2000;
    const cutoff = Date.now() - window;
    
    // Get recent hits on this target
    const hitsOnTarget = this.recentEvents.filter(e => 
      (e.type === 'damage' || e.type === 'projectile_hit') && 
      e.targetId === targetId &&
      (e.timestamp || 0) > cutoff
    );
    
    // Check if both players have hit
    const player1Hit = hitsOnTarget.some(e => e.sourceId === 'player1');
    const player2Hit = hitsOnTarget.some(e => e.sourceId === 'player2');
    
    if (!player1Hit || !player2Hit) return false;
    
    // Check required tags if specified
    if (trigger.requiredTags) {
      // This would need integration with the upgrade system to check player tags
      // For now, simplified check
      return true;
    }
    
    return true;
  }
  
  /**
   * Check hit_status condition
   */
  private checkHitStatus(trigger: any, event: CombatEvent): boolean {
    if (event.type !== 'damage' && event.type !== 'projectile_hit') return false;
    
    const targetId = event.targetId;
    if (!targetId) return false;
    
    const targetStatuses = this.targetStatuses.get(targetId);
    if (!targetStatuses) return false;
    
    // Check if target has required status
    if (!targetStatuses.has(trigger.targetStatus)) return false;
    
    // Check damage threshold
    if (trigger.damageThreshold && (event.damage || 0) < trigger.damageThreshold) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Check status_interaction condition
   */
  private checkStatusInteraction(trigger: any, event: CombatEvent): boolean {
    if (event.type !== 'status_applied') return false;
    
    const targetId = event.targetId;
    if (!targetId) return false;
    
    const targetStatuses = this.targetStatuses.get(targetId);
    if (!targetStatuses) return false;
    
    // Check if both statuses are present
    const hasStatus1 = targetStatuses.has(trigger.status1);
    const hasStatus2 = targetStatuses.has(trigger.status2);
    
    return hasStatus1 && hasStatus2;
  }
  
  /**
   * Check tag_combo (prime/detonate) condition
   */
  private checkTagCombo(trigger: any, event: CombatEvent): boolean {
    if (event.type !== 'damage' && event.type !== 'projectile_hit') return false;
    
    const targetId = event.targetId;
    if (!targetId) return false;
    
    const targetStatuses = this.targetStatuses.get(targetId);
    if (!targetStatuses) return false;
    
    // Check if target is primed (has any primer status)
    const primerStatuses = ['primed', 'marked', 'weakened'];
    const isPrimed = primerStatuses.some(s => targetStatuses.has(s));
    
    if (!isPrimed) return false;
    
    // Check if attacker has detonator capability
    // This would integrate with upgrade system
    // Simplified: check if this is a crit or high damage hit
    if (event.isCritical || (event.damage || 0) > 30) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Check effect_echo condition
   */
  private checkEffectEcho(trigger: any, event: CombatEvent): boolean {
    if (event.type !== 'aoe_damage') return false;
    
    // Check if enough targets were hit
    if (trigger.minTargetsHit && (event.targetsHit || 0) < trigger.minTargetsHit) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Check zone_overlap condition
   */
  private checkZoneOverlap(trigger: any, event: CombatEvent): boolean {
    // This would need zone tracking - simplified for now
    return false;
  }
  
  /**
   * Execute synergy effect
   */
  private executeSynergy(synergy: SynergyDefinition, event: CombatEvent): void {
    console.log(`[SynergyResolver] Triggered synergy: ${synergy.name}`);
    
    const effect = synergy.effect;
    const position = event.position || { x: 400, y: 300 };
    
    switch (effect.type) {
      case 'explosion':
      case 'chain_explosion':
      case 'combo_explosion':
        this.createExplosion(position, effect, synergy);
        break;
        
      case 'instant_dot_damage':
        this.instantiateDotDamage(event.targetId, effect);
        break;
        
      case 'shared_healing':
        this.applySharedHealing(event, effect);
        break;
        
      case 'partner_aoe_trigger':
        this.triggerPartnerAoe(event, effect);
        break;
        
      default:
        console.warn(`[SynergyResolver] Unknown effect type: ${effect.type}`);
    }
    
    // Visual feedback
    this.showComboPopup(synergy.name, position);
    
    // Play sound
    if (synergy.soundEffect) {
      // this.scene.sound.play(synergy.soundEffect);
    }
    
    // Emit synergy event
    this.scene.events.emit('synergy:triggered', {
      synergy,
      event,
      position
    });
  }
  
  /**
   * Create explosion effect
   */
  private createExplosion(position: { x: number, y: number }, effect: any, synergy: SynergyDefinition): void {
    const radius = effect.radius || 100;
    const baseDamage = effect.baseDamage || 50;
    const damageMultiplier = effect.damageMultiplier || 1.0;
    
    // Visual effect
    const explosion = this.scene.add.circle(position.x, position.y, 10, 0xffcc00, 0.8);
    
    this.scene.tweens.add({
      targets: explosion,
      radius: radius,
      alpha: 0,
      duration: 300,
      ease: 'Power2',
      onComplete: () => explosion.destroy()
    });
    
    // Deal damage to enemies in radius
    this.scene.events.emit('synergy:explosion', {
      x: position.x,
      y: position.y,
      radius,
      damage: baseDamage * damageMultiplier,
      synergyId: synergy.id
    });
  }
  
  /**
   * Instant DoT damage
   */
  private instantiateDotDamage(targetId: string | undefined, effect: any): void {
    if (!targetId) return;
    
    this.scene.events.emit('synergy:instant_dot', {
      targetId,
      multiplier: effect.dotMultiplier || 5.0,
      bonusFlat: effect.bonusFlat || 0,
      consumeStacks: effect.consumeStacks || false
    });
  }
  
  /**
   * Apply shared healing
   */
  private applySharedHealing(event: CombatEvent, effect: any): void {
    const healAmount = (event.healAmount || 0) * (effect.sharePercent || 0.5);
    const partnerId = event.sourceId === 'player1' ? 'player2' : 'player1';
    
    this.scene.events.emit('player:heal', {
      playerId: partnerId,
      amount: healAmount,
      source: 'synergy'
    });
  }
  
  /**
   * Trigger partner AoE
   */
  private triggerPartnerAoe(event: CombatEvent, effect: any): void {
    const partnerId = event.sourceId === 'player1' ? 'player2' : 'player1';
    
    this.scene.time.delayedCall(effect.delayMs || 200, () => {
      this.scene.events.emit('synergy:partner_aoe', {
        triggeredBy: event.sourceId,
        partnerId,
        position: event.position,
        damagePercent: effect.damagePercent || 0.3
      });
    });
  }
  
  /**
   * Show combo popup text
   */
  private showComboPopup(comboName: string, position: { x: number, y: number }): void {
    const uiConfig = (synergiesData as any).synergyUI?.comboPopup || {
      duration: 1500,
      fontSize: 24,
      color: '#ffcc00',
      floatHeight: 50
    };
    
    const text = this.scene.add.text(position.x, position.y, comboName, {
      fontSize: `${uiConfig.fontSize}px`,
      color: uiConfig.color,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5).setDepth(1000);
    
    this.scene.tweens.add({
      targets: text,
      y: position.y - uiConfig.floatHeight,
      alpha: 0,
      scale: 1.5,
      duration: uiConfig.duration,
      ease: 'Power2',
      onComplete: () => text.destroy()
    });
  }
  
  /**
   * Manually trigger a synergy (for external calls)
   */
  triggerSynergy(synergyId: string, context: any): void {
    const synergy = this.synergies.get(synergyId);
    if (!synergy) {
      console.warn(`[SynergyResolver] Unknown synergy: ${synergyId}`);
      return;
    }
    
    const mockEvent: CombatEvent = {
      type: 'synergy_trigger',
      sourceId: context.killedBy || 'unknown',
      targetId: context.targetId,
      position: context.position,
      timestamp: Date.now()
    };
    
    this.executeSynergy(synergy, mockEvent);
  }
  
  /**
   * Check passive synergies (call periodically)
   */
  checkPassiveSynergies(player1Position: { x: number, y: number }, player2Position: { x: number, y: number }): PassiveBonuses {
    const bonuses: PassiveBonuses = {
      player1: { damage: 1, critChance: 0, damageReduction: 0 },
      player2: { damage: 1, critChance: 0, damageReduction: 0 }
    };
    
    const distance = Phaser.Math.Distance.Between(
      player1Position.x, player1Position.y,
      player2Position.x, player2Position.y
    );
    
    // Proximity synergy
    const proximitySynergy = this.passiveSynergies.get('proximity_synergy');
    if (proximitySynergy && distance < (proximitySynergy.condition.range || 150)) {
      bonuses.player1.damageReduction += proximitySynergy.bonus.value || 0.15;
      bonuses.player2.damageReduction += proximitySynergy.bonus.value || 0.15;
    }
    
    // Separation synergy
    const separationSynergy = this.passiveSynergies.get('separation_synergy');
    if (separationSynergy && distance > (separationSynergy.condition.minRange || 400)) {
      bonuses.player1.critChance += separationSynergy.bonus.value || 0.2;
      bonuses.player2.critChance += separationSynergy.bonus.value || 0.2;
    }
    
    return bonuses;
  }
  
  /**
   * Update loop
   */
  update(time: number, delta: number): void {
    // Periodic cleanup
    if (Math.floor(time / 1000) !== Math.floor((time - delta) / 1000)) {
      this.cleanupOldEvents();
      
      // Clean expired statuses
      const now = Date.now();
      for (const [targetId, statuses] of this.targetStatuses) {
        for (const [status, info] of statuses) {
          if (info.expiresAt < now) {
            statuses.delete(status);
          }
        }
        if (statuses.size === 0) {
          this.targetStatuses.delete(targetId);
        }
      }
    }
  }
  
  /**
   * Destroy and cleanup
   */
  destroy(): void {
    this.scene.events.off('combat:event', this.handleCombatEvent, this);
    this.scene.events.off('status:applied', this.handleStatusApplied, this);
    this.scene.events.off('status:removed', this.handleStatusRemoved, this);
    this.scene.events.off('enemy:killed', this.handleEnemyKilled, this);
    
    this.synergies.clear();
    this.passiveSynergies.clear();
    this.recentEvents = [];
    this.targetStatuses.clear();
    this.synergyCooldowns.clear();
  }
}

// Supporting types
interface StatusInfo {
  appliedBy: string;
  appliedAt: number;
  expiresAt: number;
}

interface PassiveSynergy {
  id: string;
  name: string;
  description: string;
  condition: {
    type: string;
    range?: number;
    minRange?: number;
    [key: string]: any;
  };
  bonus: {
    type: string;
    stat?: string;
    value?: number;
    [key: string]: any;
  };
}

interface PassiveBonuses {
  player1: { damage: number; critChance: number; damageReduction: number };
  player2: { damage: number; critChance: number; damageReduction: number };
}
