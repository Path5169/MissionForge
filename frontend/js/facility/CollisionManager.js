import * as THREE from 'three';

/**
 * High-performance AABB & multi-level floor collision system for the 3D Aerospace Facility.
 * Prevents player from walking through walls, railings, equipment, and structural meshes,
 * while allowing smooth stair climbing, ramp navigation, and camera wall occlusion.
 */
export class CollisionManager {
  constructor() {
    this.colliders = [];
    this.floors = []; // Elevated floors, ramps, and platforms
    this._tempBox = new THREE.Box3();
    this._tempVec = new THREE.Vector3();
    this._ray = new THREE.Ray();
  }

  clear() {
    this.colliders.length = 0;
    this.floors.length = 0;
  }

  /**
   * Register a solid obstacle (wall, column, equipment, railing, console).
   */
  addBox(x, y, z, width, height, depth, tag = 'solid') {
    const min = new THREE.Vector3(x - width / 2, y - height / 2, z - depth / 2);
    const max = new THREE.Vector3(x + width / 2, y + height / 2, z + depth / 2);
    const box = new THREE.Box3(min, max);
    this.colliders.push({ box, tag, width, height, depth });
    return box;
  }

  /**
   * Register an elevated floor, platform, or deck.
   * If ramp is true, slope is computed along Z or X.
   */
  addFloor(x, z, width, depth, elevation, options = {}) {
    this.floors.push({
      minX: x - width / 2,
      maxX: x + width / 2,
      minZ: z - depth / 2,
      maxZ: z + depth / 2,
      elevation,
      rampAxis: options.rampAxis || null, // 'z' or 'x'
      elevationStart: options.elevationStart ?? elevation,
      elevationEnd: options.elevationEnd ?? elevation,
      tag: options.tag || 'floor',
    });
  }

  /**
   * Query ground height at a given (x, z) location.
   * Supports base ground, elevated platforms (catwalks, launch deck), and ramps.
   */
  getGroundHeight(x, z, currentY = 0) {
    let groundY = 0; // Default terrain level

    for (const f of this.floors) {
      if (x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ) {
        let elev = f.elevation;
        if (f.rampAxis === 'z') {
          const t = THREE.MathUtils.clamp((z - f.minZ) / (f.maxZ - f.minZ), 0, 1);
          elev = THREE.MathUtils.lerp(f.elevationStart, f.elevationEnd, t);
        } else if (f.rampAxis === 'x') {
          const t = THREE.MathUtils.clamp((x - f.minX) / (f.maxX - f.minX), 0, 1);
          elev = THREE.MathUtils.lerp(f.elevationStart, f.elevationEnd, t);
        }

        // Only snap to floors that are below or reasonably within step height of the player
        if (elev <= currentY + 0.65 && elev >= groundY) {
          groundY = elev;
        }
      }
    }

    return groundY;
  }

  /**
   * Resolves player cylinder/capsule collision against solid obstacles.
   * Modifies targetPosition in-place to slide along surfaces.
   * @param {THREE.Vector3} currentPos - Current player position (feet center)
   * @param {THREE.Vector3} targetPos - Proposed new position
   * @param {number} radius - Player collision radius (~0.35m)
   * @param {number} height - Player height (~1.85m)
   * @returns {boolean} Whether a collision occurred
   */
  resolveMovement(currentPos, targetPos, radius = 0.35, height = 1.85) {
    let collided = false;
    const playerFeetY = targetPos.y;
    const playerHeadY = targetPos.y + height;

    // Test across X and Z independently to support frictionless surface sliding
    // 1. Resolve X axis
    const testXPos = new THREE.Vector3(targetPos.x, currentPos.y, currentPos.z);
    for (const c of this.colliders) {
      const b = c.box;
      // Vertical overlap check
      if (playerHeadY > b.min.y + 0.1 && playerFeetY < b.max.y - 0.1) {
        // Horizontal distance check on X & Z
        const nearestX = THREE.MathUtils.clamp(testXPos.x, b.min.x, b.max.x);
        const nearestZ = THREE.MathUtils.clamp(testXPos.z, b.min.z, b.max.z);
        const dx = testXPos.x - nearestX;
        const dz = testXPos.z - nearestZ;
        const distSq = dx * dx + dz * dz;

        if (distSq < radius * radius) {
          collided = true;
          const dist = Math.sqrt(distSq);
          if (dist > 0.0001) {
            const overlap = radius - dist;
            targetPos.x += (dx / dist) * overlap;
          } else {
            // Player is exactly inside box boundary, push towards closer side
            const toMin = Math.abs(testXPos.x - b.min.x);
            const toMax = Math.abs(testXPos.x - b.max.x);
            targetPos.x = toMin < toMax ? b.min.x - radius : b.max.x + radius;
          }
        }
      }
    }

    // 2. Resolve Z axis
    const testZPos = new THREE.Vector3(targetPos.x, currentPos.y, targetPos.z);
    for (const c of this.colliders) {
      const b = c.box;
      if (playerHeadY > b.min.y + 0.1 && playerFeetY < b.max.y - 0.1) {
        const nearestX = THREE.MathUtils.clamp(testZPos.x, b.min.x, b.max.x);
        const nearestZ = THREE.MathUtils.clamp(testZPos.z, b.min.z, b.max.z);
        const dx = testZPos.x - nearestX;
        const dz = testZPos.z - nearestZ;
        const distSq = dx * dx + dz * dz;

        if (distSq < radius * radius) {
          collided = true;
          const dist = Math.sqrt(distSq);
          if (dist > 0.0001) {
            const overlap = radius - dist;
            targetPos.z += (dz / dist) * overlap;
          } else {
            const toMin = Math.abs(testZPos.z - b.min.z);
            const toMax = Math.abs(testZPos.z - b.max.z);
            targetPos.z = toMin < toMax ? b.min.z - radius : b.max.z + radius;
          }
        }
      }
    }

    return collided;
  }

  /**
   * Raycast against collision boxes to prevent camera from clipping outside/through walls.
   * @param {THREE.Vector3} origin - Focus point (e.g. player head)
   * @param {THREE.Vector3} target - Desired camera position
   * @param {number} padding - Distance to stand off from obstacle surface
   * @returns {THREE.Vector3} Safe camera position
   */
  resolveCamera(origin, target, padding = 0.25) {
    const dir = this._tempVec.subVectors(target, origin);
    const maxDist = dir.length();
    if (maxDist < 0.01) return target.clone();
    dir.normalize();

    this._ray.set(origin, dir);
    let closestDist = maxDist;
    const hitPoint = new THREE.Vector3();

    for (const c of this.colliders) {
      // Ignore low obstacles for camera occlusion
      if (c.box.max.y < origin.y - 0.2) continue;

      if (this._ray.intersectBox(c.box, hitPoint)) {
        const dist = origin.distanceTo(hitPoint);
        if (dist < closestDist) {
          closestDist = Math.max(0.5, dist - padding);
        }
      }
    }

    // Also avoid camera going below ground / floor
    const safeTarget = origin.clone().addScaledVector(dir, closestDist);
    const groundAtCam = this.getGroundHeight(safeTarget.x, safeTarget.z, safeTarget.y);
    if (safeTarget.y < groundAtCam + 0.3) {
      safeTarget.y = groundAtCam + 0.3;
    }

    return safeTarget;
  }
}
