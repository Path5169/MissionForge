import * as THREE from 'three';
import { state } from '../core/store.js';
import { instantiate, layout } from '../vehicle/vehicle.js';
import { buildVehicle, MATS } from '../rendering/rocketMesh.js';
import { computeStats } from '../vehicle/stats.js';

/**
 * Adapter connecting the player's saved rocket configuration (state.blueprint)
 * to real 3D physical models in both the Engineering Hangar and Launch Pad.
 */
export class RocketWorldAdapter {
  constructor(scene) {
    this.scene = scene;
    this.hangarRocketGroup = new THREE.Group();
    this.hangarRocketGroup.name = 'HangarRocket';

    this.launchPadRocketGroup = new THREE.Group();
    this.launchPadRocketGroup.name = 'LaunchPadRocket';

    this.scene.add(this.hangarRocketGroup);
    this.scene.add(this.launchPadRocketGroup);

    this.hangarPos = new THREE.Vector3(0, 0, -6);
    this.launchPadPos = new THREE.Vector3(0, 2.5, 78);

    this.currentStats = null;
    this.vehicleHeight = 0;
  }

  /**
   * Rebuilds the 3D rocket representations in both locations based on current state.blueprint.
   */
  async reloadVehicle() {
    // Clear previous models
    this._disposeGroup(this.hangarRocketGroup);
    this._disposeGroup(this.launchPadRocketGroup);

    if (!state.blueprint || !state.catalog) {
      console.warn('[RocketWorldAdapter] No active blueprint or catalog found.');
      return null;
    }

    try {
      const parts = instantiate(state.blueprint, state.catalog, { includeLoose: false });
      const payload = state.blueprint.payload || null;
      const layoutData = layout(state.blueprint, state.catalog);

      this.vehicleHeight = layoutData.height || 10;
      this.currentStats = computeStats(state.blueprint, state.catalog, 'earth');

      // 1. Build Hangar Rocket
      const hangarVehicle = await buildVehicle(parts, payload);
      this._setupRocketInstance(hangarVehicle, this.hangarRocketGroup, this.hangarPos, this.vehicleHeight);

      // Add Hangar Support Pedestal & Clamps
      this._addLaunchClamps(this.hangarRocketGroup, this.hangarPos, layoutData.width || 2.5);

      // 2. Build Launch Pad Rocket
      const padVehicle = await buildVehicle(parts, payload);
      this._setupRocketInstance(padVehicle, this.launchPadRocketGroup, this.launchPadPos, this.vehicleHeight);
      this._addLaunchClamps(this.launchPadRocketGroup, this.launchPadPos, layoutData.width || 2.5);

      return {
        stats: this.currentStats,
        height: this.vehicleHeight,
        partsCount: parts.length,
      };
    } catch (err) {
      console.error('[RocketWorldAdapter] Failed to assemble vehicle:', err);
      return null;
    }
  }

  _setupRocketInstance(vehicle, group, worldPos, height) {
    // buildVehicle generates parts positioned between y = 0 and y = -height
    // Offset so the base of the lowest stage rests at y = 0 relative to the mount
    vehicle.root.position.set(0, height, 0);

    // Enable shadows on all parts
    vehicle.root.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    group.position.copy(worldPos);
    group.add(vehicle.root);
  }

  _addLaunchClamps(group, basePos, width) {
    const clampMat = new THREE.MeshStandardMaterial({
      color: 0x353d48,
      roughness: 0.55,
      metalness: 0.65,
    });
    const chevronMat = new THREE.MeshStandardMaterial({
      color: 0xe5a323,
      roughness: 0.45,
      metalness: 0.25,
    });

    const clampDist = Math.max(1.8, width * 0.75 + 0.4);
    const angles = [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2];

    for (const ang of angles) {
      const clampArm = new THREE.Group();
      clampArm.position.set(Math.sin(ang) * clampDist, 0, Math.cos(ang) * clampDist);
      clampArm.rotation.y = ang + Math.PI;

      // Base pedestal
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 1.2), clampMat);
      base.position.y = 0.6;
      base.castShadow = true;
      clampArm.add(base);

      // Hold-down arm
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.6, 0.45), clampMat);
      arm.position.set(0, 1.5, -0.3);
      arm.rotation.x = -0.35;
      arm.castShadow = true;
      clampArm.add(arm);

      // Warning hazard head
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.5), chevronMat);
      head.position.set(0, 2.1, -0.6);
      head.castShadow = true;
      clampArm.add(head);

      group.add(clampArm);
    }
  }

  getSpecs() {
    return {
      name: state.blueprint?.name || 'Untitled Vehicle',
      stats: this.currentStats,
      height: this.vehicleHeight,
      ready: this.currentStats?.ready ?? true,
      errors: this.currentStats?.errors || [],
    };
  }

  /**
   * Adds a component to the active 3D vehicle stack and rebuilds the physical 3D rocket.
   */
  async addPart(componentId, mount = 'below') {
    if (!state.blueprint) return null;
    state.blueprint.parts ||= [];

    const def = state.catalog?.component(componentId);
    if (!def) return null;

    const newUid = 'p_' + Math.random().toString(36).slice(2, 9);
    const parts = state.blueprint.parts;

    let parentUid = null;
    if (parts.length > 0) {
      if (mount === 'below') {
        // Attach below the last attached part in the stack
        parentUid = parts[parts.length - 1].uid;
      } else if (mount === 'side' || mount === 'radial') {
        // Attach radially to current main tank
        const tank = parts.find(p => p.c.includes('tank') || p.c.includes('STAGE')) || parts[parts.length - 1];
        parentUid = tank.uid;
      } else {
        parentUid = parts[0].uid;
      }
    }

    const newPart = {
      uid: newUid,
      c: componentId,
      parent: parentUid,
      mount: parentUid ? mount : 'root',
      stage: Math.max(0, parts.length ? Math.floor(parts.length / 2) : 0),
      group: 0,
    };

    if (mount === 'radial' || mount === 'side') {
      newPart.radial = true;
      newPart.side = true;
      newPart.dir = 1;
    }

    parts.push(newPart);
    return await this.reloadVehicle();
  }

  /**
   * Removes a part from the active 3D vehicle stack and rebuilds the physical 3D rocket.
   */
  async removePart(uid) {
    if (!state.blueprint || !state.blueprint.parts) return null;
    const parts = state.blueprint.parts;
    const idx = parts.findIndex(p => p.uid === uid);
    if (idx === -1) return null;

    const removed = parts[idx];
    // Re-link children to removed part's parent if below mount
    for (const child of parts) {
      if (child.parent === removed.uid && child.mount === 'below') {
        child.parent = removed.parent;
      }
    }

    parts.splice(idx, 1);
    if (parts.length > 0 && !parts.some(p => !p.parent)) {
      parts[0].parent = null;
      parts[0].mount = 'root';
    }

    return await this.reloadVehicle();
  }

  /**
   * Reorders parts up or down in the staging hierarchy.
   */
  async movePart(uid, delta) {
    if (!state.blueprint || !state.blueprint.parts) return null;
    const parts = state.blueprint.parts;
    const idx = parts.findIndex(p => p.uid === uid);
    if (idx === -1) return null;

    const targetIdx = idx + delta;
    if (targetIdx < 0 || targetIdx >= parts.length) return null;

    const temp = parts[idx];
    parts[idx] = parts[targetIdx];
    parts[targetIdx] = temp;

    // Reconstruct linear below attachments
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].mount !== 'radial' && parts[i].mount !== 'side') {
        parts[i].parent = i === 0 ? null : parts[i - 1].uid;
        parts[i].mount = i === 0 ? 'root' : 'below';
      }
    }

    return await this.reloadVehicle();
  }

  /**
   * Clears rocket stack and initializes a fresh base vehicle with command capsule.
   */
  async clearVehicle(name = 'New 3D Vehicle') {
    state.blueprint = {
      schema: 2,
      name,
      stagingMode: 'auto',
      parts: [
        { uid: 'p_cmd_' + Math.random().toString(36).slice(2, 6), c: 'BAS-CAPSULE', parent: null, mount: 'root', stage: 0 }
      ],
      looseParts: [],
    };
    return await this.reloadVehicle();
  }

  _disposeGroup(group) {
    while (group.children.length > 0) {
      const obj = group.children[0];
      group.remove(obj);
      obj.traverse?.(child => {
        if (child.isMesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material?.dispose();
          }
        }
      });
    }
  }
}
