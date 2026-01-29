import Phaser from 'phaser';

export class Health {
  private gameObject: Phaser.GameObjects.GameObject;
  private _current: number;
  private _max: number;
  private _isAlive: boolean = true;
  private damageReduction: number = 0;
  private onDeathCallback?: () => void;
  private onDamageCallback?: (amount: number) => void;

  constructor(
    gameObject: Phaser.GameObjects.GameObject,
    maxHp: number,
    onDeath?: () => void,
    onDamage?: (amount: number) => void
  ) {
    this.gameObject = gameObject;
    this._max = maxHp;
    this._current = maxHp;
    this.onDeathCallback = onDeath;
    this.onDamageCallback = onDamage;
  }

  get current(): number {
    return this._current;
  }

  // Network sync setter - directly set current HP
  setCurrent(value: number): void {
    this._current = Math.min(Math.max(0, value), this._max);
    this._isAlive = this._current > 0;
  }

  get max(): number {
    return this._max;
  }

  get isAlive(): boolean {
    return this._isAlive;
  }

  get percentage(): number {
    return this._current / this._max;
  }

  setMax(value: number): void {
    this._max = value;
    this._current = Math.min(this._current, this._max);
  }

  setDamageReduction(value: number): void {
    this.damageReduction = Phaser.Math.Clamp(value, 0, 0.9); // Cap at 90%
  }

  damage(amount: number): number {
    if (!this._isAlive) return 0;

    const reducedAmount = amount * (1 - this.damageReduction);
    const actualDamage = Math.min(reducedAmount, this._current);
    
    this._current -= actualDamage;

    if (this.onDamageCallback) {
      this.onDamageCallback(actualDamage);
    }

    if (this._current <= 0) {
      this._current = 0;
      this._isAlive = false;
      if (this.onDeathCallback) {
        this.onDeathCallback();
      }
    }

    return actualDamage;
  }

  heal(amount: number): number {
    if (!this._isAlive) return 0;

    const oldHp = this._current;
    this._current = Math.min(this._current + amount, this._max);
    return this._current - oldHp;
  }

  revive(hpPercentage: number = 0.5): void {
    this._isAlive = true;
    this._current = this._max * hpPercentage;
  }

  reset(): void {
    this._current = this._max;
    this._isAlive = true;
    this.damageReduction = 0;
  }
}
