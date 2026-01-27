import Phaser from 'phaser';
import { Player } from '@/entities/Player';
import { Enemy } from '@/entities/Enemy';
import { Projectile } from '@/entities/Projectile';

export class CombatSystem {
  private scene: Phaser.Scene;
  
  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  setupCollisions(
    players: Phaser.GameObjects.Group,
    enemies: Phaser.GameObjects.Group,
    projectiles: Phaser.GameObjects.Group,
    xpGems: Phaser.GameObjects.Group
  ): void {
    // Player projectiles hit enemies
    this.scene.physics.add.overlap(
      projectiles,
      enemies,
      (projObj, enemyObj) => this.onProjectileHitEnemy(projObj as Projectile, enemyObj as Enemy),
      undefined,
      this
    );

    // Enemies collide with players (damage on touch)
    this.scene.physics.add.overlap(
      players,
      enemies,
      (playerObj, enemyObj) => this.onEnemyTouchPlayer(playerObj as Player, enemyObj as Enemy),
      undefined,
      this
    );

    // Players collect XP gems
    this.scene.physics.add.overlap(
      players,
      xpGems,
      (playerObj, gemObj) => this.onPlayerCollectXP(playerObj as Player, gemObj as any),
      undefined,
      this
    );

    // Enemy projectiles hit players (for sniper lasers)
    this.scene.physics.add.overlap(
      projectiles,
      players,
      (projObj, playerObj) => this.onEnemyProjectileHitPlayer(projObj as Projectile, playerObj as Player),
      (projObj, playerObj) => {
        const proj = projObj as Projectile;
        return proj.ownerId === -1; // Only enemy projectiles
      },
      this
    );
  }

  private onProjectileHitEnemy(projectile: Projectile, enemy: Enemy): void {
    if (!projectile.active || !enemy.active || !enemy.health.isAlive) return;

    // Get the player who fired this
    const player = this.getPlayerById(projectile.ownerId);
    if (!player) return;

    let damage = projectile.damage;
    let isCrit = false;

    // Check for crit
    if (Math.random() < player.stats.critChance) {
      damage *= player.stats.critMultiplier;
      isCrit = true;
    }

    // Apply mark if player has marker rounds
    if (player.hasMarkerRounds) {
      enemy.mark(3000);
    }

    // Check for synergy: marked + detonate
    const synergyActive = this.checkMarkDetonateSynergy(player, enemy);
    
    // Apply damage
    const actualDamage = enemy.takeDamage(damage, player);

    // Create explosion on crit if player has detonate
    if (isCrit && player.hasDetonateShot) {
      const explosionDamage = synergyActive ? 150 : 50; // 3x damage if synergy active
      this.createExplosion(projectile.x, projectile.y, 80, explosionDamage, player);
    }

    // Damage number
    this.showDamageNumber(enemy.x, enemy.y, actualDamage, isCrit);

    // Handle projectile pierce
    projectile.onHit();
  }

  private onEnemyTouchPlayer(player: Player, enemy: Enemy): void {
    if (!player.active || player.isDead || !enemy.active) return;

    // Damage is handled by enemy attack system, this is just for collision
    // Enemies attack on a cooldown, not continuous touch
  }

  private onEnemyProjectileHitPlayer(projectile: Projectile, player: Player): void {
    if (!projectile.active || !player.active || player.isDead) return;
    if (projectile.ownerId !== -1) return; // Only enemy projectiles

    player.takeDamage(projectile.damage);
    projectile.deactivate();
  }

  private onPlayerCollectXP(player: Player, gem: any): void {
    if (!player.active || player.isDead || !gem.active) return;

    player.addXP(gem.xpValue);
    gem.collect();
  }

  private createExplosion(x: number, y: number, radius: number, damage: number, owner: Player): void {
    // Visual effect
    const explosion = this.scene.add.circle(x, y, 10, 0xff8800, 0.6);
    this.scene.tweens.add({
      targets: explosion,
      radius: radius,
      alpha: 0,
      duration: 300,
      ease: 'Power2',
      onComplete: () => explosion.destroy()
    });

    // Damage enemies in radius
    const enemies = (this.scene as any).enemies.getChildren() as Enemy[];
    for (const enemy of enemies) {
      if (!enemy.active || !enemy.health.isAlive) continue;
      
      const dist = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
      if (dist <= radius) {
        const actualDamage = enemy.takeDamage(damage, owner);
        this.showDamageNumber(enemy.x, enemy.y, actualDamage, false, 0xff8800);
      }
    }

    // Screen shake
    this.scene.cameras.main.shake(100, 0.003);
  }

  private checkMarkDetonateSynergy(player: Player, enemy: Enemy): boolean {
    // Get partner player
    const partnerPlayer = this.getPartnerPlayer(player);
    if (!partnerPlayer) return false;

    // Check if partner has the complementary upgrade and enemy is marked
    if (player.hasMarkerRounds && partnerPlayer.hasDetonateShot && enemy.isMarked()) {
      return true;
    }
    if (player.hasDetonateShot && partnerPlayer.hasMarkerRounds && enemy.isMarked()) {
      return true;
    }

    return false;
  }

  private getPlayerById(id: number): Player | null {
    const players = (this.scene as any).players.getChildren() as Player[];
    return players.find(p => p.playerId === id) || null;
  }

  private getPartnerPlayer(player: Player): Player | null {
    const players = (this.scene as any).players.getChildren() as Player[];
    return players.find(p => p.playerId !== player.playerId) || null;
  }

  private showDamageNumber(
    x: number,
    y: number,
    damage: number,
    isCrit: boolean,
    color: number = 0xffffff
  ): void {
    const damageText = this.scene.add.text(
      x,
      y,
      Math.round(damage).toString(),
      {
        fontSize: isCrit ? '20px' : '14px',
        color: isCrit ? '#ffff00' : `#${color.toString(16).padStart(6, '0')}`,
        stroke: '#000000',
        strokeThickness: 2,
        fontStyle: isCrit ? 'bold' : 'normal'
      }
    );
    damageText.setOrigin(0.5);

    this.scene.tweens.add({
      targets: damageText,
      y: y - 40,
      alpha: 0,
      duration: 800,
      ease: 'Power2',
      onComplete: () => damageText.destroy()
    });
  }
}
