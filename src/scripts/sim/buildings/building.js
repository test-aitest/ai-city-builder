import * as THREE from 'three';
import { SimObject } from '../simObject';
import { BuildingStatus } from './buildingStatus';
import { PowerModule } from './modules/power';
import { RoadAccessModule } from './modules/roadAccess';

export class Building extends SimObject {
  /**
   * The building type
   * @type {string}
   */
  type = 'building';
  /**
   * True if the terrain should not be rendered with this building type
   * @type {boolean}
   */
  hideTerrain = false;
  /**
   * @type {PowerModule}
   */
  power = new PowerModule(this);
  /**
   * @type {RoadAccessModule}
   */
  roadAccess = new RoadAccessModule(this);
  /**
   * The current status of the building
   * @type {string}
   */
  status = BuildingStatus.Ok;
  /**
   * Whether this building is damaged by a disaster
   * @type {boolean}
   */
  isDamaged = false;
  /**
   * Icon displayed when building status
   * @type {Sprite}
   */
  #statusIcon = new THREE.Sprite();

  constructor() {
    super();
    this.#statusIcon.visible = false;
    this.#statusIcon.material = new THREE.SpriteMaterial({ depthTest: false })
    this.#statusIcon.layers.set(1);
    this.#statusIcon.scale.set(0.5, 0.5, 0.5);
    this.add(this.#statusIcon);
  }
  
  /**
   * 
   * @param {*} status 
   */
  setStatus(status) {
    this.#statusIcon.visible = false;
  }

  simulate(city) {
    super.simulate(city);
    
    this.power.simulate(city);
    this.roadAccess.simulate(city);

    if (!this.power.isFullyPowered) {
      this.setStatus(BuildingStatus.NoPower);
    } else if (!this.roadAccess.value) {
      this.setStatus(BuildingStatus.NoRoadAccess);
    } else {
      this.setStatus(null);
    }
  }

  applyDamageEffect() {
    this.isDamaged = true;
    if (this.mesh) {
      this.mesh.traverse((obj) => {
        if (obj.material) {
          obj.material.color.setHex(0x8b3a3a);
        }
      });
      this.mesh.scale.set(0.85, 0.7, 0.85);
      this.mesh.rotation.z = THREE.MathUtils.degToRad(3);
    }
  }

  updateDamageEffect(progress) {
    if (!this.mesh) return;
    const damagedColor = new THREE.Color(0x8b3a3a);
    const normalColor = new THREE.Color(0xffffff);
    const lerpedColor = damagedColor.clone().lerp(normalColor, progress);
    this.mesh.traverse((obj) => {
      if (obj.material) {
        obj.material.color.copy(lerpedColor);
      }
    });
    const s = 0.85 + 0.15 * progress;
    const sy = 0.7 + 0.3 * progress;
    this.mesh.scale.set(s, sy, s);
    this.mesh.rotation.z = THREE.MathUtils.degToRad(3 * (1 - progress));
  }

  clearDamageEffect() {
    this.isDamaged = false;
  }

  dispose() {
    this.power.dispose();
    this.roadAccess.dispose();
    super.dispose();
  }
  
  /**
   * Returns an HTML representation of this object
   * @returns {string}
   */
  toHTML() {
    let html = `
      <div class="info-heading">Building</div>
      <span class="info-label">Name </span>
      <span class="info-value">${this.name}</span>
      <br>
      <span class="info-label">Type </span>
      <span class="info-value">${this.type}</span>
      <br>
      <span class="info-label">Road Access </span>
      <span class="info-value">${this.roadAccess.value}</span>
      <br>`;

    if (this.power.required > 0) {
      html += `
        <span class="info-label">Power (kW)</span>
        <span class="info-value">${this.power.supplied}/${this.power.required}</span>
        <br>`;
    } 
    return html;
  }
}