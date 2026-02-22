import * as THREE from "three";
import { AssetManager } from "./assets/assetManager.js";
import { CameraManager } from "./camera.js";
import { InputManager } from "./input.js";
import { City } from "./sim/city.js";
import { SimObject } from "./sim/simObject.js";

/**
 * Manager for the Three.js scene. Handles rendering of a `City` object
 */
export class Game {
  /**
   * @type {City}
   */
  city;
  /**
   * Object that currently hs focus
   * @type {SimObject | null}
   */
  focusedObject = null;
  /**
   * Class for managing user input
   * @type {InputManager}
   */
  inputManager;
  /**
   * Object that is currently selected
   * @type {SimObject | null}
   */
  selectedObject = null;

  constructor(city) {
    this.city = city;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.scene = new THREE.Scene();

    this.inputManager = new InputManager(window.ui.gameWindow);
    this.cameraManager = new CameraManager(window.ui.gameWindow);

    // Configure the renderer
    this.renderer.setSize(
      window.ui.gameWindow.clientWidth,
      window.ui.gameWindow.clientHeight,
    );
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    // Add the renderer to the DOM
    window.ui.gameWindow.appendChild(this.renderer.domElement);

    // Variables for object selection
    this.raycaster = new THREE.Raycaster();

    /**
     * Global instance of the asset manager
     */
    window.assetManager = new AssetManager(() => {
      window.ui.hideLoadingText();

      this.city = new City(8);
      this.initialize(this.city);
      this.start();

      setInterval(this.simulate.bind(this), 1000);

      // Initialize AI system
      import("./ai/index.ts").then((ai) => ai.initialize(this));
    });

    window.addEventListener("resize", this.onResize.bind(this), false);
  }

  /**
   * Initalizes the scene, clearing all existing assets
   */
  initialize(city) {
    this.scene.clear();
    this.scene.add(city);
    this.#setupLights();
    this.#setupGrid(city);
  }

  #setupGrid(city) {
    // Add the grid
    const gridMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      map: window.assetManager.textures["grid"],
      transparent: true,
      opacity: 0.2,
    });
    gridMaterial.map.repeat = new THREE.Vector2(city.size, city.size);
    gridMaterial.map.wrapS = city.size;
    gridMaterial.map.wrapT = city.size;

    const grid = new THREE.Mesh(
      new THREE.BoxGeometry(city.size, 0.1, city.size),
      gridMaterial,
    );
    grid.position.set(city.size / 2 - 0.5, -0.04, city.size / 2 - 0.5);
    this.scene.add(grid);

    this.#setupGridLabels(city);
  }

  /**
   * Add coordinate numbers and compass labels around the grid edges.
   * Convention: X0-X7 = West→East, Y0-Y7 = North→South
   */
  #setupGridLabels(city) {
    const s = city.size;
    const labelY = 0.01;
    const offset = 0.8;
    const numColor = "rgba(0,0,0,0.7)";
    const numScale = 0.28;

    // Column labels (X0-X7) along North edge
    for (let x = 0; x < s; x++) {
      this.scene.add(
        this.#makeLabel(`X${x}`, x, labelY, -offset, numScale * 0.85, numColor),
      );
    }

    // Row labels (Y0-Y7) along West edge
    for (let z = 0; z < s; z++) {
      this.scene.add(
        this.#makeLabel(`Y${z}`, -offset - 0.15, labelY, z, numScale * 0.85, numColor),
      );
    }

    // Compass icon — flat on the ground at the northwest corner
    const texture = window.assetManager.textures["compass"];
    const compassSize = 1.4;
    const geo = new THREE.PlaneGeometry(compassSize, compassSize);
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(-1.6, 0.05, -1.6);
    this.scene.add(mesh);
  }

  /**
   * Create a billboard text sprite for grid labeling.
   */
  #makeLabel(text, x, y, z, scale = 0.5, color = "rgba(255,255,255,0.3)") {
    const canvas = document.createElement("canvas");
    const size = 64;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.font = "600 44px sans-serif";
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, size / 2, size / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(scale, scale, 1);
    sprite.position.set(x, y, z);
    return sprite;
  }

  /**
   * Setup the lights for the scene
   */
  #setupLights() {
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(-10, 20, 0);
    sun.castShadow = true;
    sun.shadow.camera.left = -20;
    sun.shadow.camera.right = 20;
    sun.shadow.camera.top = 20;
    sun.shadow.camera.bottom = -20;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 50;
    sun.shadow.normalBias = 0.01;
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  }

  /**
   * Starts the renderer
   */
  start() {
    this.renderer.setAnimationLoop(this.draw.bind(this));
  }

  /**
   * Stops the renderer
   */
  stop() {
    this.renderer.setAnimationLoop(null);
  }

  /**
   * Render the contents of the scene
   */
  draw() {
    this.city.draw();
    this.updateFocusedObject();

    if (this.inputManager.isLeftMouseDown) {
      this.useTool();
    }

    this.renderer.render(this.scene, this.cameraManager.camera);
  }

  /**
   * Moves the simulation forward by one step
   */
  simulate() {
    if (window.ui.isPaused) return;

    // Update the city data model first, then update the scene
    this.city.simulate(1);

    window.ui.updateStatusBar(this);
    window.ui.updateInfoPanel(this.selectedObject);
  }

  /**
   * Uses the currently active tool (select only — all building via AI)
   */
  useTool() {
    this.updateSelectedObject();
    window.ui.updateInfoPanel(this.selectedObject);
  }

  /**
   * Sets the currently selected object and highlights it
   */
  updateSelectedObject() {
    this.selectedObject?.setSelected(false);
    this.selectedObject = this.focusedObject;
    this.selectedObject?.setSelected(true);
  }

  /**
   * Sets the object that is currently highlighted
   */
  updateFocusedObject() {
    this.focusedObject?.setFocused(false);
    const newObject = this.#raycast();
    if (newObject !== this.focusedObject) {
      this.focusedObject = newObject;
    }
    this.focusedObject?.setFocused(true);
  }

  /**
   * Gets the mesh currently under the the mouse cursor. If there is nothing under
   * the the mouse cursor, returns null
   * @param {MouseEvent} event Mouse event
   * @returns {THREE.Mesh | null}
   */
  #raycast() {
    var coords = {
      x:
        (this.inputManager.mouse.x / this.renderer.domElement.clientWidth) * 2 -
        1,
      y:
        -(this.inputManager.mouse.y / this.renderer.domElement.clientHeight) *
          2 +
        1,
    };

    this.raycaster.setFromCamera(coords, this.cameraManager.camera);

    let intersections = this.raycaster.intersectObjects(
      this.city.root.children,
      true,
    );
    if (intersections.length > 0) {
      // The SimObject attached to the mesh is stored in the user data
      const selectedObject = intersections[0].object.userData;
      return selectedObject;
    } else {
      return null;
    }
  }

  /**
   * Resizes the renderer to fit the current game window
   */
  onResize() {
    this.cameraManager.resize(window.ui.gameWindow);
    this.renderer.setSize(
      window.ui.gameWindow.clientWidth,
      window.ui.gameWindow.clientHeight,
    );
  }
}

// Create a new game when the window is loaded
window.onload = () => {
  window.game = new Game();
};
