import * as THREE from 'three';
import { Building } from './buildings/building.js';
import { SimObject } from './simObject.js';

export class Tile extends SimObject {
  /**
   * The type of terrain
   * @type {string}
   */
  terrain = 'grass';
  /**
   * The building on this tile
   * @type {Building?}
   */
  #building = null;
  /**
   * Whether this tile is damaged by a disaster
   * @type {boolean}
   */
  damaged = false;
  /**
   * Recovery progress from 0 (just damaged) to 1 (fully recovered)
   * @type {number}
   */
  recoveryProgress = 0;
  /**
   * Whether this tile is being actively recovered via command
   * @type {boolean}
   */
  activeRecovery = false;
  /**
   * Sprite for recovery icon (shown when activeRecovery is true)
   * @type {THREE.Sprite?}
   */
  #recoveryIcon = null;

  constructor(x, y) {
    super(x, y);
    this.name = `Tile-${this.x}-${this.y}`;
  }

  /**
   * @type {Building}
   */
  get building() {
    return this.#building;
  }

  /**
   * @type {Building} value
   */
  setBuilding(value) {
    // Remove and dispose resources for existing building
    if (this.#building) {
      this.#building.dispose();
      this.remove(this.#building);
    }

    this.#building = value;

    // Add to scene graph
    if (value) {
      this.add(this.#building);
    }
  }

  refreshView(city) {
    this.building?.refreshView(city);
    if (this.building?.hideTerrain) {
      this.setMesh(null);
    } else {
      /**
       * @type {THREE.Mesh}
       */
      const mesh = window.assetManager.getModel(this.terrain, this);
      mesh.name = this.terrain;
      this.setMesh(mesh);
    }
  }

  applyDamageVisuals(city) {
    // Tint terrain mesh red
    if (this.mesh) {
      this.mesh.traverse((obj) => {
        if (obj.material) {
          obj.material.color.setHex(0xff3333);
        }
      });
    }
  }

  updateDamageVisuals(city) {
    // Lerp terrain color from red to white based on recoveryProgress
    if (this.mesh) {
      const damagedColor = new THREE.Color(0xff3333);
      const normalColor = new THREE.Color(0xffffff);
      const lerpedColor = damagedColor.clone().lerp(normalColor, this.recoveryProgress);
      this.mesh.traverse((obj) => {
        if (obj.material) {
          obj.material.color.copy(lerpedColor);
        }
      });
    }
  }

  setActiveRecovery(active) {
    this.activeRecovery = active;
    if (active && !this.#recoveryIcon) {
      const texture = window.assetManager.statusIcons['recovering'];
      if (texture) {
        const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
        const icon = new THREE.Sprite(mat);
        icon.scale.set(0.4, 0.4, 0.4);
        icon.position.set(0, 0.8, 0);
        icon.layers.set(1);
        this.#recoveryIcon = icon;
        this.add(icon);
      }
    } else if (!active && this.#recoveryIcon) {
      this.remove(this.#recoveryIcon);
      this.#recoveryIcon.material?.dispose();
      this.#recoveryIcon = null;
    }
  }

  clearDamageVisuals(city) {
    // Remove recovery icon if present
    this.setActiveRecovery(false);
    // Fully restore tile visuals
    this.refreshView(city);
  }

  simulate(city) {
    // Skip building simulation if tile is damaged
    if (this.damaged) return;
    this.building?.simulate(city);
  }

  /**
   * Gets the Manhattan distance between two tiles
   * @param {Tile} tile 
   * @returns 
   */
  distanceTo(tile) {
    return Math.abs(this.x - tile.x) + Math.abs(this.y - tile.y);
  }

  /**
   * 
   * @returns {string} HTML representation of this object
   */
  toHTML() {
    let html = `
      <div class="info-heading">Tile</div>
      <span class="info-label">Coordinates </span>
      <span class="info-value">X: ${this.x}, Y: ${this.y}</span>
      <br>
      <span class="info-label">Terrain </span>
      <span class="info-value">${this.terrain}</span>
      <br>
    `;

    if (this.damaged) {
      const pct = Math.round(this.recoveryProgress * 100);
      const status = this.activeRecovery ? '復旧作業中' : '復旧待ち';
      html += `
        <span class="info-label" style="color: #ff3333; font-weight: bold;">被災状況 </span>
        <span class="info-value" style="color: #ff3333;">${status} ${pct}%</span>
        <br>
      `;
    }

    if (this.building) {
      html += this.building.toHTML();
    }

    return html;
  }
};