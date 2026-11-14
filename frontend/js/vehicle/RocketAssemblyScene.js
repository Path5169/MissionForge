import * as THREE from 'three';
import { state } from '../core/store.js';
import { api } from '../core/api.js';
import { assets } from '../rendering/assets.js';
import { buildVehicle, buildPart } from '../rendering/rocketMesh.js';
import { layout, instantiate } from './vehicle.js';
import { attachTargets, pickTarget } from './attach.js';

/**
 * RocketAssemblyScene: Full interactive 3D Engineering Hangar and Rocket Builder.
 * Provides 360-degree orbit inspection, true 3D part snapping with visual node feedback,
 * component picking/highlighting, and real-time backend synchronization.
 */
export class RocketAssemblyScene {
  constructor(canvas, { onSelectPart = null, onBlueprintChanged = null } = {}) {
    this.canvas = canvas;
    this.onSelectPart = onSelectPart;
    this.onBlueprintChanged = onBlueprintChanged;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.raf = 0;
    this.active = false;

    // Groups
    this.hangarGroup = new THREE.Group();
    this.rocketGroup = new THREE.Group();
    this.nodesGroup = new THREE.Group();
    this.previewGroup = new THREE.Group();
    this.highlightMesh = null;

    // Orbit Camera State
    this.camTarget = new THREE.Vector3(0, 5, 0);
    this.camRadius = 14;
    this.camTheta = Math.PI / 4;   // Azimuth angle
    this.camPhi = Math.PI / 3;     // Elevation angle
    this.isOrbiting = false;
    this.isPanning = false;
    this.lastMouse = { x: 0, y: 0 };

    // Raycasting & Interaction
    this.raycaster = new THREE.Raycaster();
    this.mouseNdc = new THREE.Vector2();
    this.partMeshes = new Map();
    this.selectedUid = null;
    this.hoveredUid = null;

    // Active Placement State
    this.placingDef = null;
    this.availableTargets = [];
    this.activeSnapTarget = null;
    this.previewPartMesh = null;

    this._initScene();
    this._bindEvents();
  }

  _initScene() {
    const w = this.canvas.clientWidth || window.innerWidth || 1280;
    const h = this.canvas.clientHeight || window.innerHeight || 720;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x06080e);
    this.scene.fog = new THREE.FogExp2(0x06080e, 0.015);

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 200);
    this._updateCameraPos();

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Lighting
    const hemi = new THREE.HemisphereLight(0x6ba8e5, 0x181c24, 0.65);
    this.scene.add(hemi);

    const dirLight = new THREE.DirectionalLight(0xfff6ea, 1.8);
    dirLight.position.set(12, 22, 14);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 60;
    const d = 16;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0005;
    this.scene.add(dirLight);

    // Accent work lights
    const workLight1 = new THREE.PointLight(0x52d6ea, 2.0, 25);
    workLight1.position.set(-6, 8, 5);
    this.scene.add(workLight1);

    const workLight2 = new THREE.PointLight(0xffb02e, 1.5, 25);
    workLight2.position.set(6, 4, -5);
    this.scene.add(workLight2);

    // Add Scene Layers
    this.scene.add(this.hangarGroup);
    this.scene.add(this.rocketGroup);
    this.scene.add(this.nodesGroup);
    this.scene.add(this.previewGroup);

    this._buildHangarFallback();
    this._loadHangarGLB();
  }

  async _loadHangarGLB() {
    try {
      const glb = await assets.loadModel('hangar_interior');
      if (glb) {
        this.hangarGroup.clear();
        glb.traverse(c => {
          if (c.isMesh) {
            c.receiveShadow = true;
            c.castShadow = true;
          }
        });
        this.hangarGroup.add(glb);
      }
    } catch (e) {
      console.warn('[RocketAssemblyScene] Hangar GLB load notice:', e);
    }
  }

  _buildHangarFallback() {
    // Floor
    const floorGeo = new THREE.CylinderGeometry(18, 18, 0.4, 32);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x22262d,
      roughness: 0.7,
      metalness: 0.2,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = -0.2;
    floor.receiveShadow = true;
    this.hangarGroup.add(floor);

    // Turntable center plate
    const plateGeo = new THREE.CylinderGeometry(4.5, 4.5, 0.1, 32);
    const plateMat = new THREE.MeshStandardMaterial({
      color: 0x363d48,
      roughness: 0.5,
      metalness: 0.7,
    });
    const plate = new THREE.Mesh(plateGeo, plateMat);
    plate.position.y = 0.05;
    plate.receiveShadow = true;
    this.hangarGroup.add(plate);

    // Hazard ring
    const ringGeo = new THREE.RingGeometry(4.6, 4.9, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xe5a323, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    this.hangarGroup.add(ring);
  }

  start() {
    this.active = true;
    this.resize();
    this.reloadRocket();
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(t => this._tick(t));
  }

  stop() {
    this.active = false;
    cancelAnimationFrame(this.raf);
  }

  resize() {
    if (!this.canvas || !this.renderer || !this.camera) return;
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  _updateCameraPos() {
    this.camPhi = Math.max(0.08, Math.min(Math.PI / 2 - 0.05, this.camPhi));
    this.camRadius = Math.max(3.5, Math.min(60, this.camRadius));

    const x = this.camTarget.x + this.camRadius * Math.sin(this.camPhi) * Math.sin(this.camTheta);
    const y = this.camTarget.y + this.camRadius * Math.cos(this.camPhi);
    const z = this.camTarget.z + this.camRadius * Math.sin(this.camPhi) * Math.cos(this.camTheta);

    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.camTarget);
  }

  _tick(timestamp) {
    if (!this.active) return;
    this.raf = requestAnimationFrame(t => this._tick(t));

    // Animate glowing snap node pulses
    if (this.nodesGroup.children.length) {
      const pulse = 0.8 + 0.25 * Math.sin(timestamp * 0.006);
      this.nodesGroup.children.forEach(n => {
        if (n.userData.isNode) n.scale.setScalar(pulse);
      });
    }

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Rebuilds the 3D rocket model based on state.blueprint and layout data.
   */
  async reloadRocket() {
    this._disposeGroup(this.rocketGroup);
    this.partMeshes.clear();

    const bp = state.blueprint;
    const cat = state.catalog;
    if (!bp || !cat) return;

    try {
      const parts = instantiate(bp, cat, { includeLoose: false });
      const layoutData = layout(bp, cat);
      const vehicleHeight = layoutData.height || 6;

      // Adjust camera target to center of rocket
      this.camTarget.y = Math.max(2.5, vehicleHeight * 0.45);
      this.camRadius = Math.max(10, vehicleHeight * 1.5);
      this._updateCameraPos();

      // Build 3D Rocket Model
      const vehicle = await buildVehicle(parts, bp.payload);

      // Offset vehicle so bottom stage rests at turntable level (y = 0.1)
      vehicle.root.position.set(0, vehicleHeight + 0.1, 0);

      vehicle.root.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      this.rocketGroup.add(vehicle.root);

      // Store part meshes mapped to uid for picking
      for (const [uid, mesh] of vehicle.meshes.entries()) {
        this.partMeshes.set(uid, mesh);
      }

      // Re-apply selection highlight if previously selected
      if (this.selectedUid) {
        this.selectPart(this.selectedUid);
      }
    } catch (err) {
      console.error('[RocketAssemblyScene] Reload rocket error:', err);
    }
  }

  _disposeGroup(group) {
    while (group.children.length > 0) {
      const obj = group.children[0];
      group.remove(obj);
      obj.traverse?.(c => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
          else c.material.dispose();
        }
      });
    }
  }

  // ==========================================
  // COMPONENT PLACEMENT & SNAPPING SYSTEM
  // ==========================================

  /**
   * Enters component placement mode with the given part definition.
   */
  async beginPlacement(def, sym = true) {
    this.placingDef = def;
    this.nodesGroup.clear();
    this.previewGroup.clear();

    const bp = state.blueprint;
    const cat = state.catalog;
    if (!bp || !cat || !def) return;

    // Fetch valid attach targets from backend
    try {
      this.availableTargets = await attachTargets(bp, cat, def, { sym });
    } catch (e) {
      console.warn('[RocketAssemblyScene] attachTargets query error:', e);
      this.availableTargets = [];
    }

    // Build 3D preview of the part being placed
    const dummyPart = { uid: '__preview', def, side: false, dir: 0, x: 0, y0: 0, y1: def.height || 1 };
    this.previewPartMesh = await buildPart(dummyPart, []);
    this.previewPartMesh.traverse(c => {
      if (c.isMesh) {
        c.material = c.material.clone();
        c.material.transparent = true;
        c.material.opacity = 0.72;
      }
    });
    this.previewGroup.add(this.previewPartMesh);
    this.previewGroup.visible = false;

    // Build 3D visual attachment node markers
    const layoutData = layout(bp, cat);
    const vHeight = layoutData.height || 6;

    for (const target of this.availableTargets) {
      for (const node of target.nodes) {
        // Node coordinates: world X, world Y (y = vHeight - node.y)
        const nodeY = vHeight - node.y + 0.1;
        const nodeMesh = this._createNodeMarker(target.ok);
        nodeMesh.position.set(node.x, nodeY, 0);
        nodeMesh.userData = { isNode: true, target, nodeY, nodeX: node.x };
        this.nodesGroup.add(nodeMesh);
      }
    }
  }

  _createNodeMarker(isValid) {
    const geo = new THREE.TorusGeometry(0.45, 0.06, 12, 24);
    const mat = new THREE.MeshStandardMaterial({
      color: isValid ? 0x52d6ea : 0xff4d4d,
      emissive: isValid ? 0x22b2ca : 0xaa1111,
      emissiveIntensity: 1.5,
      roughness: 0.3,
      metalness: 0.8,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  }

  /**
   * Updates preview position and snaps to valid attachment nodes.
   */
  updatePlacement(clientX, clientY) {
    if (!this.placingDef || !this.availableTargets.length) return;

    const rect = this.canvas.getBoundingClientRect();
    this.mouseNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouseNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouseNdc, this.camera);

    // Raycast onto the XY vertical plane passing through z = 0
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hitPoint = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(plane, hitPoint);

    if (!hit) return;

    this.previewGroup.visible = true;

    // Convert hit point to blueprint layout coordinate space
    const bp = state.blueprint;
    const cat = state.catalog;
    const layoutData = layout(bp, cat);
    const vHeight = layoutData.height || 6;
    const blueprintY = vHeight - (hitPoint.y - 0.1);
    const blueprintX = hitPoint.x;

    // Find nearest attach target
    const picked = pickTarget(this.availableTargets, blueprintX, blueprintY, 1.8);
    this.activeSnapTarget = picked;

    if (picked && picked.centers && picked.centers.length) {
      const center = picked.centers[0];
      const worldY = vHeight - center.y + 0.1;
      this.previewGroup.position.set(center.x, worldY, 0);

      // Highlight active node
      this.nodesGroup.children.forEach(n => {
        if (n.userData.target === picked) {
          n.scale.setScalar(1.4);
        } else {
          n.scale.setScalar(1.0);
        }
      });
    } else {
      this.previewGroup.position.copy(hitPoint);
    }
  }

  /**
   * Commits the placement to the vehicle blueprint.
   */
  async commitPlacement() {
    if (!this.placingDef) return false;

    const target = this.activeSnapTarget;
    const def = this.placingDef;

    this.cancelPlacement();

    if (!target) return false;

    if (!target.ok) {
      throw new Error(target.error || 'Invalid attachment connection.');
    }

    // Apply attachment via backend
    const res = await api.vehicleAddPart(
      state.blueprint,
      def.id,
      target.anchor,
      target.mount,
      target.dir || 0
    );

    if (res.ok && res.blueprint) {
      state.blueprint = res.blueprint;
      await this.reloadRocket();
      this.onBlueprintChanged?.(state.blueprint);
      return true;
    } else {
      throw new Error(res.detail || 'Could not attach part.');
    }
  }

  cancelPlacement() {
    this.placingDef = null;
    this.activeSnapTarget = null;
    this.availableTargets = [];
    this.nodesGroup.clear();
    this.previewGroup.clear();
    this.previewGroup.visible = false;
  }

  // ==========================================
  // PART SELECTION & PICKING
  // ==========================================

  selectPart(uid) {
    this.selectedUid = uid;
    this._updateHighlight();
    if (this.onSelectPart) {
      const part = state.blueprint?.parts?.find(p => p.uid === uid);
      const def = part ? state.catalog?.component(part.c) : null;
      this.onSelectPart(part, def);
    }
  }

  clearSelection() {
    this.selectedUid = null;
    this._updateHighlight();
    if (this.onSelectPart) this.onSelectPart(null, null);
  }

  _updateHighlight() {
    if (this.highlightMesh) {
      this.scene.remove(this.highlightMesh);
      this.highlightMesh.geometry.dispose();
      this.highlightMesh.material.dispose();
      this.highlightMesh = null;
    }

    if (!this.selectedUid) return;

    const mesh = this.partMeshes.get(this.selectedUid);
    if (!mesh) return;

    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const boxGeo = new THREE.BoxGeometry(size.x + 0.15, size.y + 0.15, size.z + 0.15);
    const boxMat = new THREE.MeshBasicMaterial({
      color: 0x52d6ea,
      wireframe: true,
      transparent: true,
      opacity: 0.85,
    });
    this.highlightMesh = new THREE.Mesh(boxGeo, boxMat);
    this.highlightMesh.position.copy(center);
    this.scene.add(this.highlightMesh);
  }

  // ==========================================
  // MOUSE & ORBIT CONTROLS
  // ==========================================

  _bindEvents() {
    this.canvas.addEventListener('mousedown', e => this._onMouseDown(e));
    window.addEventListener('mousemove', e => this._onMouseMove(e));
    window.addEventListener('mouseup', e => this._onMouseUp(e));
    this.canvas.addEventListener('wheel', e => this._onWheel(e), { passive: false });
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  _onMouseDown(e) {
    if (!this.active) return;
    this.lastMouse.x = e.clientX;
    this.lastMouse.y = e.clientY;

    if (e.button === 2 || (e.button === 0 && !this.placingDef)) {
      if (e.shiftKey) {
        this.isPanning = true;
      } else {
        this.isOrbiting = true;
      }
    }
  }

  _onMouseMove(e) {
    if (!this.active) return;

    // Handle placement drag
    if (this.placingDef) {
      this.updatePlacement(e.clientX, e.clientY);
      return;
    }

    const dx = e.clientX - this.lastMouse.x;
    const dy = e.clientY - this.lastMouse.y;
    this.lastMouse.x = e.clientX;
    this.lastMouse.y = e.clientY;

    if (this.isOrbiting) {
      this.camTheta -= dx * 0.007;
      this.camPhi -= dy * 0.007;
      this._updateCameraPos();
    } else if (this.isPanning) {
      this.camTarget.y += dy * 0.025;
      this._updateCameraPos();
    }
  }

  _onMouseUp(e) {
    if (!this.active) return;

    if (this.placingDef && e.button === 0) {
      this.commitPlacement().catch(err => {
        console.warn('Placement error:', err);
      });
      return;
    }

    // If click without drag, perform part picking
    const dist = Math.hypot(e.clientX - this.lastMouse.x, e.clientY - this.lastMouse.y);
    if (dist < 5 && e.button === 0 && !this.placingDef) {
      this._pickPart(e.clientX, e.clientY);
    }

    this.isOrbiting = false;
    this.isPanning = false;
  }

  _onWheel(e) {
    if (!this.active) return;
    e.preventDefault();
    this.camRadius += e.deltaY * 0.02;
    this._updateCameraPos();
  }

  _pickPart(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouseNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouseNdc, this.camera);
    const intersects = this.raycaster.intersectObjects(this.rocketGroup.children, true);

    if (intersects.length > 0) {
      // Find matching part mesh in hierarchy
      let obj = intersects[0].object;
      while (obj && obj.parent !== this.rocketGroup) {
        for (const [uid, group] of this.partMeshes.entries()) {
          if (group === obj || group.children?.includes(obj)) {
            this.selectPart(uid);
            return;
          }
        }
        obj = obj.parent;
      }
    } else {
      this.clearSelection();
    }
  }
}
