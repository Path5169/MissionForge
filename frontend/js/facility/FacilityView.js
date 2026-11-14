import * as THREE from 'three';
import { state } from '../core/store.js';
import { CollisionManager } from './CollisionManager.js';
import { PlayerController } from './PlayerController.js';
import { FacilityScene } from './FacilityScene.js';
import { RocketWorldAdapter } from './RocketWorldAdapter.js';
import { InteractionManager } from './InteractionManager.js';
import { FacilityUI } from './FacilityUI.js';
import { audio } from '../core/audio.js';

/**
 * FacilityView: Main 3D Third-Person Aerospace Facility Screen for MissionForge.
 * Renders an explorable, realistic NASA-inspired research and launch complex
 * with full player controller, interactions, and dynamic rocket staging.
 */
export class FacilityView {
  constructor() {
    this.root = null;
    this.canvas = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;

    this.collision = null;
    this.player = null;
    this.facilityScene = null;
    this.rocketAdapter = null;
    this.interaction = null;
    this.ui = null;

    this.raf = 0;
    this.lastTime = 0;
    this.active = false;
  }

  mount(root) {
    this.root = root;
    this.root.innerHTML = '';
    this.root.style.position = 'relative';

    // 1. WebGL Canvas
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'facility-canvas';
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.root.append(this.canvas);

    // 2. Three.js Scene, Camera, and Renderer
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9cb8d9); // Daylight atmospheric sky
    this.scene.fog = new THREE.FogExp2(0x9cb8d9, 0.0035); // Atmospheric haze

    const w = window.innerWidth || 1280;
    const h = window.innerHeight || 720;
    this.camera = new THREE.PerspectiveCamera(65, w / h, 0.1, 500);

    const quality = state.settings?.quality || 'high';
    const isHigh = quality === 'high';

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: isHigh,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isHigh ? 2 : 1.25));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = isHigh;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 3. Core Systems
    this.collision = new CollisionManager();
    this.interaction = new InteractionManager();
    this.facilityScene = new FacilityScene(this.scene, this.collision, this.interaction);
    this.rocketAdapter = new RocketWorldAdapter(this.scene);
    this.player = new PlayerController(this.camera, this.canvas, this.collision);
    this.scene.add(this.player.group);

    // 4. In-Game HUD and Overlays
    this.ui = new FacilityUI(this.root, this.interaction);

    // Global reference for modal callbacks
    window.MF_FACILITY = this;

    // Spawn player in the primary spawn location:
    // Inside the Engineering Hangar facing the assembled vehicle stand
    this.player.teleport(0, 0, 5, 0);

    window.addEventListener('resize', () => this.resize());
  }

  async show() {
    this.active = true;
    this.resize();

    // Reload assembled rocket representation from state.blueprint
    try {
      await this.rocketAdapter?.reloadVehicle();
    } catch (e) {
      console.warn('[FacilityView] Vehicle reload notice:', e);
    }

    // Play subtle ambient background audio if available
    try {
      audio.playLoop('ambience_launch', { volume: 0.25 });
    } catch {}

    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(t => this._tick(t));
  }

  hide() {
    this.active = false;
    cancelAnimationFrame(this.raf);
    this.ui?.closeModal();

    try {
      audio.stopLoop('ambience_launch', 0.5);
    } catch {}

    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock?.();
    }
  }

  resize() {
    if (!this.renderer || !this.camera || !this.canvas) return;
    const w = this.canvas.clientWidth || window.innerWidth || 1280;
    const h = this.canvas.clientHeight || window.innerHeight || 720;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  _tick(timestamp) {
    if (!this.active) return;
    this.raf = requestAnimationFrame(t => this._tick(t));

    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.08); // Cap dt
    this.lastTime = timestamp;

    // Update Player & Character Animation
    this.player.update(dt);

    // Update 3D Facility Scene (rotating holograms, Earth GLB)
    this.facilityScene?.update(dt);

    // Update Interaction Detection
    const playerPos = this.player.getPosition();
    const playerFacing = this.player.getFacingDirection();
    this.interaction.update(playerPos, playerFacing);

    // Update In-Game HUD Location Tag
    this.ui.updateLocation(playerPos);

    // Render 3D World
    this.renderer.render(this.scene, this.camera);
  }

  // Terminal Modal Callbacks
  openEngineeringModal() {
    this.ui.openEngineeringModal();
  }

  openMissionControl() {
    this.ui.openMissionControl();
  }

  openLaunchOperations() {
    this.ui.openLaunchOperations();
  }

  openResearchLab() {
    this.ui.openResearchLab();
  }

  openVehicleInspection() {
    this.ui.openVehicleInspection();
  }
}

export const facilityView = new FacilityView();
