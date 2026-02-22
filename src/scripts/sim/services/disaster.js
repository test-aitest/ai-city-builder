import { SimService } from './simService.js';
import config from '../../config.js';

export class DisasterService extends SimService {
  /** @type {null | { epicenterX: number, epicenterY: number, affectedTiles: Array<{x: number, y: number, tile: any, totalRecoveryTicks: number}> }} */
  activeDisaster = null;
  lastDisasterTick = -Infinity;
  /** @type {((info: any) => void) | null} */
  #notifyFn = null;
  /** @type {(() => void) | null} */
  #recoveryCompleteFn = null;

  setNotifyFn(fn) {
    this.#notifyFn = fn;
  }

  setRecoveryCompleteFn(fn) {
    this.#recoveryCompleteFn = fn;
  }

  simulate(city) {
    if (!this.activeDisaster) {
      this.tryTriggerDisaster(city);
    } else {
      this.advanceRecovery(city);
    }
  }

  tryTriggerDisaster(city) {
    const cfg = config.disaster;

    // Count buildings
    let buildingCount = 0;
    for (let x = 0; x < city.size; x++) {
      for (let y = 0; y < city.size; y++) {
        if (city.getTile(x, y)?.building) buildingCount++;
      }
    }

    if (buildingCount < cfg.minBuildingsForDisaster) return;
    if (city.simTime - this.lastDisasterTick < cfg.minTicksBetweenDisasters) return;
    if (Math.random() > cfg.disasterChance) return;

    // Pick a random tile with a building as epicenter
    const buildingTiles = [];
    for (let x = 0; x < city.size; x++) {
      for (let y = 0; y < city.size; y++) {
        const tile = city.getTile(x, y);
        if (tile?.building) buildingTiles.push({ x, y });
      }
    }

    if (buildingTiles.length === 0) return;

    const epicenter = buildingTiles[Math.floor(Math.random() * buildingTiles.length)];
    const sizeX = cfg.minAffectedSize + Math.floor(Math.random() * (cfg.maxAffectedSize - cfg.minAffectedSize + 1));
    const sizeY = cfg.minAffectedSize + Math.floor(Math.random() * (cfg.maxAffectedSize - cfg.minAffectedSize + 1));

    this.triggerDisaster(city, epicenter.x, epicenter.y, sizeX, sizeY);
  }

  triggerDisaster(city, epicenterX, epicenterY, sizeX, sizeY) {
    const cfg = config.disaster;
    const affectedTiles = [];

    // Calculate affected area centered on epicenter
    const startX = Math.max(0, epicenterX - Math.floor(sizeX / 2));
    const startY = Math.max(0, epicenterY - Math.floor(sizeY / 2));
    const endX = Math.min(city.size - 1, startX + sizeX - 1);
    const endY = Math.min(city.size - 1, startY + sizeY - 1);

    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        const tile = city.getTile(x, y);
        if (!tile) continue;

        // Destroy building on this tile
        if (tile.building) {
          city.bulldoze(x, y);
        }

        // Random recovery time per tile (5-10 minutes)
        const totalRecoveryTicks = cfg.minRecoveryTicks +
          Math.floor(Math.random() * (cfg.maxRecoveryTicks - cfg.minRecoveryTicks + 1));

        tile.damaged = true;
        tile.recoveryProgress = 0;
        tile.applyDamageVisuals(city);

        affectedTiles.push({ x, y, tile, totalRecoveryTicks });
      }
    }

    const destroyedCount = affectedTiles.filter(t => !t.tile.building).length;

    this.activeDisaster = { epicenterX, epicenterY, affectedTiles };
    this.lastDisasterTick = city.simTime;

    console.log(`[Disaster] Earthquake at (${epicenterX},${epicenterY})! ${affectedTiles.length} tiles affected, ${destroyedCount} buildings destroyed.`);

    if (this.#notifyFn) {
      this.#notifyFn({
        epicenterX,
        epicenterY,
        affectedTileCount: affectedTiles.length,
        destroyedBuildingCount: destroyedCount,
      });
    }
  }

  advanceRecovery(city) {
    const cfg = config.disaster;
    const recovered = [];

    for (const entry of this.activeDisaster.affectedTiles) {
      // Per-tile increment based on its own totalRecoveryTicks
      let increment = 1 / entry.totalRecoveryTicks;

      // Boost if actively being recovered via recover_tile command
      if (entry.tile.activeRecovery) {
        increment *= cfg.activeRecoveryMultiplier;
      }

      entry.tile.recoveryProgress = Math.min(1, entry.tile.recoveryProgress + increment);
      entry.tile.updateDamageVisuals(city);

      if (entry.tile.recoveryProgress >= 1) {
        entry.tile.damaged = false;
        entry.tile.recoveryProgress = 0;
        entry.tile.clearDamageVisuals(city);
        recovered.push(entry);
      }
    }

    // Remove recovered tiles from active list
    for (const entry of recovered) {
      const idx = this.activeDisaster.affectedTiles.indexOf(entry);
      if (idx !== -1) this.activeDisaster.affectedTiles.splice(idx, 1);
    }

    // All recovered?
    if (this.activeDisaster.affectedTiles.length === 0) {
      console.log('[Disaster] All tiles recovered!');
      this.activeDisaster = null;

      if (this.#recoveryCompleteFn) {
        this.#recoveryCompleteFn();
      }
    }
  }

  /**
   * Start active recovery on a specific tile (shows icon, boosts speed)
   * @returns {{ success: boolean, message: string }}
   */
  recoverTile(city, x, y) {
    if (!this.activeDisaster) {
      return { success: false, message: '現在、災害は発生していません。' };
    }

    const entry = this.activeDisaster.affectedTiles.find(t => t.x === x && t.y === y);
    if (!entry) {
      return { success: false, message: `タイル(${x},${y})は被災していません。` };
    }

    if (entry.tile.activeRecovery) {
      return { success: false, message: `タイル(${x},${y})は既に復旧作業中です。` };
    }

    entry.tile.setActiveRecovery(true);
    const pct = Math.round(entry.tile.recoveryProgress * 100);
    const remaining = Math.ceil((1 - entry.tile.recoveryProgress) * entry.totalRecoveryTicks / config.disaster.activeRecoveryMultiplier);

    return {
      success: true,
      message: `タイル(${x},${y})の復旧作業を開始しました。現在${pct}%完了、残り約${remaining}秒で復旧予定。`,
    };
  }

  getDisasterInfo() {
    if (!this.activeDisaster) {
      return { active: false, message: '現在、災害は発生していません。' };
    }

    const tiles = this.activeDisaster.affectedTiles;
    const avgProgress = tiles.reduce((sum, t) => sum + t.tile.recoveryProgress, 0) / tiles.length;
    const activeCount = tiles.filter(t => t.tile.activeRecovery).length;

    return {
      active: true,
      epicenter: { x: this.activeDisaster.epicenterX, y: this.activeDisaster.epicenterY },
      affectedTileCount: tiles.length,
      activeRecoveryCount: activeCount,
      averageRecoveryProgress: Math.round(avgProgress * 100),
      affectedCoords: tiles.map(t => ({
        x: t.x,
        y: t.y,
        progress: Math.round(t.tile.recoveryProgress * 100),
        activeRecovery: t.tile.activeRecovery,
        estimatedSeconds: Math.ceil((1 - t.tile.recoveryProgress) * t.totalRecoveryTicks / (t.tile.activeRecovery ? config.disaster.activeRecoveryMultiplier : 1)),
      })),
    };
  }
}
