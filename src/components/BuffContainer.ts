import Phaser from 'phaser';
import { BuffData } from '@/types/GameTypes';

export class BuffContainer {
  private buffs: Map<string, BuffData> = new Map();
  private scene: Phaser.Scene;
  private timers: Map<string, Phaser.Time.TimerEvent> = new Map();
  private isHost: boolean = true;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.isHost = scene.registry.get('isHost') ?? true;
  }

  addBuff(buff: BuffData): void {
    // Remove existing buff of same ID
    if (this.buffs.has(buff.id)) {
      this.removeBuff(buff.id);
    }

    this.buffs.set(buff.id, buff);

    // Set up timer to remove buff (HOST ONLY - guest has timers paused anyway)
    if (buff.duration > 0 && this.isHost) {
      const timer = this.scene.time.delayedCall(buff.duration, () => {
        this.removeBuff(buff.id);
      });
      this.timers.set(buff.id, timer);
    }
  }

  removeBuff(buffId: string): void {
    this.buffs.delete(buffId);
    
    const timer = this.timers.get(buffId);
    if (timer) {
      timer.remove();
      this.timers.delete(buffId);
    }
  }

  hasBuff(buffId: string): boolean {
    return this.buffs.has(buffId);
  }

  getBuff(buffId: string): BuffData | undefined {
    return this.buffs.get(buffId);
  }

  getBuffsByType(type: string): BuffData[] {
    return Array.from(this.buffs.values()).filter(buff => buff.type === type);
  }

  getTotalBuffValue(type: string): number {
    return this.getBuffsByType(type).reduce((sum, buff) => sum + buff.value, 0);
  }

  getAllBuffs(): BuffData[] {
    return Array.from(this.buffs.values());
  }

  clearAll(): void {
    for (const timer of this.timers.values()) {
      timer.remove();
    }
    this.buffs.clear();
    this.timers.clear();
  }

  update(): void {
    // Buffs with duration are handled by timers
    // This can be extended for per-frame buff logic if needed
  }
}
