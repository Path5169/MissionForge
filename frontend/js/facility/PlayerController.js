import * as THREE from 'three';
import { AstronautCharacter } from './AstronautCharacter.js';

/**
 * Third-person Player Controller for the 3D Aerospace Facility.
 * Features smooth WASD movement, sprint, jump, gravity, ground snapping,
 * mouse orbit camera with wall collision avoidance, and animated character integration.
 */
export class PlayerController {
  constructor(camera, domElement, collisionManager) {
    this.camera = camera;
    this.domElement = domElement;
    this.collision = collisionManager;

    // Character model
    this.character = new AstronautCharacter();
    this.group = new THREE.Group();
    this.group.name = 'PlayerGroup';
    this.group.add(this.character.root);

    // Position and Physics
    this.position = new THREE.Vector3(0, 0, 0); // Feet position
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.isGrounded = true;
    this.facingAngle = 0; // Radians around Y axis

    // Movement Tuning
    this.walkSpeed = 3.8; // m/s
    this.sprintSpeed = 7.5; // m/s
    this.jumpForce = 6.2; // m/s
    this.gravity = -18.0; // m/s²
    this.friction = 12.0;

    // Camera Orbit State
    this.camDistance = 4.2; // Target orbit radius
    this.minCamDistance = 1.2;
    this.maxCamDistance = 7.0;
    this.camYaw = 0; // Horizontal angle (radians)
    this.camPitch = 0.28; // Vertical angle (radians)
    this.camSensitivity = 0.0024;
    this.camFocusOffset = new THREE.Vector3(0, 1.45, 0); // Focus at player chest/head
    this.camCurrentPos = new THREE.Vector3();

    // Input States
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      sprint: false,
      jump: false,
    };
    this.isMouseDown = false;
    this.pointerLocked = false;
    this.activeInteraction = null;

    this._bindEvents();
  }

  _bindEvents() {
    this._onKeyDown = e => {
      // Don't capture when typing in an input/textarea
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.keys.forward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.keys.backward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.keys.left = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.keys.right = true;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.keys.sprint = true;
          break;
        case 'Space':
          if (this.isGrounded) {
            this.velocity.y = this.jumpForce;
            this.isGrounded = false;
          }
          break;
      }
    };

    this._onKeyUp = e => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.keys.forward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.keys.backward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.keys.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.keys.right = false;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.keys.sprint = false;
          break;
      }
    };

    this._onMouseDown = e => {
      if (e.button === 0 || e.button === 2) {
        this.isMouseDown = true;
        // Optionally lock pointer on canvas click
        if (e.target === this.domElement && !document.pointerLockElement) {
          try {
            const p = this.domElement.requestPointerLock?.();
            if (p && typeof p.catch === 'function') {
              p.catch(() => {});
            }
          } catch {}
        }
      }
    };

    this._onMouseUp = () => {
      this.isMouseDown = false;
    };

    this._onMouseMove = e => {
      // If pointer locked, rotate freely
      if (document.pointerLockElement === this.domElement || this.isMouseDown) {
        const dx = e.movementX || 0;
        const dy = e.movementY || 0;

        this.camYaw -= dx * this.camSensitivity;
        this.camPitch = THREE.MathUtils.clamp(
          this.camPitch - dy * this.camSensitivity,
          -0.65, // Looking up from floor
          1.15   // Looking down from above
        );
      }
    };

    this._onWheel = e => {
      this.camDistance = THREE.MathUtils.clamp(
        this.camDistance + Math.sign(e.deltaY) * 0.45,
        this.minCamDistance,
        this.maxCamDistance
      );
    };

    this._onPointerLockChange = () => {
      this.pointerLocked = document.pointerLockElement === this.domElement;
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('wheel', this._onWheel, { passive: true });
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
  }

  teleport(x, y, z, yaw = null) {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.group.position.copy(this.position);
    if (yaw !== null) {
      this.camYaw = yaw;
      this.facingAngle = yaw;
      this.character.root.rotation.y = yaw;
    }
    const focus = this.position.clone().add(this.camFocusOffset);
    const offset = new THREE.Vector3(
      Math.sin(this.camYaw) * Math.cos(this.camPitch) * this.camDistance,
      Math.sin(this.camPitch) * this.camDistance,
      Math.cos(this.camYaw) * Math.cos(this.camPitch) * this.camDistance
    );
    this.camCurrentPos.copy(focus).add(offset);
    this.camera.position.copy(this.camCurrentPos);
    this.camera.lookAt(focus);
  }

  update(dt) {
    // -------------------------------------------------------------
    // 1. Process Horizontal Inputs & Desired Move Direction
    // -------------------------------------------------------------
    let moveX = 0;
    let moveZ = 0;
    if (this.keys.forward) moveZ -= 1;
    if (this.keys.backward) moveZ += 1;
    if (this.keys.left) moveX -= 1;
    if (this.keys.right) moveX += 1;

    const hasInput = moveX !== 0 || moveZ !== 0;
    const moveDir = new THREE.Vector3();

    if (hasInput) {
      // Normalize input vector
      const len = Math.hypot(moveX, moveZ);
      moveX /= len;
      moveZ /= len;

      // Project into world coordinates based on camera yaw
      const sinYaw = Math.sin(this.camYaw);
      const cosYaw = Math.cos(this.camYaw);

      moveDir.x = moveX * cosYaw + moveZ * sinYaw;
      moveDir.z = -moveX * sinYaw + moveZ * cosYaw;
      moveDir.normalize();

      // Target movement speed
      const targetSpeed = this.keys.sprint ? this.sprintSpeed : this.walkSpeed;
      const accel = this.isGrounded ? 22.0 : 8.0;

      this.velocity.x += (moveDir.x * targetSpeed - this.velocity.x) * Math.min(1.0, accel * dt);
      this.velocity.z += (moveDir.z * targetSpeed - this.velocity.z) * Math.min(1.0, accel * dt);

      // Smoothly rotate character to face travel direction
      const targetAngle = Math.atan2(moveDir.x, moveDir.z);
      // Shortest angle wrap
      let diff = targetAngle - this.facingAngle;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      this.facingAngle += diff * Math.min(1.0, 14.0 * dt);
      this.character.root.rotation.y = this.facingAngle;

    } else {
      // Apply friction
      const f = Math.min(1.0, this.friction * dt);
      this.velocity.x *= (1.0 - f);
      this.velocity.z *= (1.0 - f);
      if (Math.abs(this.velocity.x) < 0.02) this.velocity.x = 0;
      if (Math.abs(this.velocity.z) < 0.02) this.velocity.z = 0;
    }

    // -------------------------------------------------------------
    // 2. Vertical Physics (Gravity & Ground Detection)
    // -------------------------------------------------------------
    this.velocity.y += this.gravity * dt;

    const proposedPos = this.position.clone();
    proposedPos.x += this.velocity.x * dt;
    proposedPos.z += this.velocity.z * dt;
    proposedPos.y += this.velocity.y * dt;

    // Check ground elevation
    const groundY = this.collision ? this.collision.getGroundHeight(proposedPos.x, proposedPos.z, this.position.y) : 0;

    if (proposedPos.y <= groundY) {
      proposedPos.y = groundY;
      this.velocity.y = 0;
      this.isGrounded = true;
    } else if (proposedPos.y - groundY > 0.08) {
      this.isGrounded = false;
    }

    // -------------------------------------------------------------
    // 3. Obstacle Collision Resolution (Sliding along walls)
    // -------------------------------------------------------------
    if (this.collision) {
      this.collision.resolveMovement(this.position, proposedPos, 0.38, 1.85);
    }

    this.position.copy(proposedPos);
    this.group.position.copy(this.position);

    // -------------------------------------------------------------
    // 4. Update Character Animations
    // -------------------------------------------------------------
    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.character.update(dt, horizSpeed, this.isGrounded, this.activeInteraction);

    // -------------------------------------------------------------
    // 5. Update Third-Person Camera with Wall Occlusion
    // -------------------------------------------------------------
    const focusPoint = this.position.clone().add(this.camFocusOffset);

    // Ideal camera position behind player
    const idealOffset = new THREE.Vector3(
      Math.sin(this.camYaw) * Math.cos(this.camPitch) * this.camDistance,
      Math.sin(this.camPitch) * this.camDistance,
      Math.cos(this.camYaw) * Math.cos(this.camPitch) * this.camDistance
    );
    const idealCamPos = focusPoint.clone().add(idealOffset);

    // Safe camera position avoiding walls
    const safeCamPos = this.collision
      ? this.collision.resolveCamera(focusPoint, idealCamPos, 0.3)
      : idealCamPos;

    // Smoothly interpolate camera
    this.camCurrentPos.lerp(safeCamPos, Math.min(1.0, 18.0 * dt));
    this.camera.position.copy(this.camCurrentPos);
    this.camera.lookAt(focusPoint);
  }

  getPosition() {
    return this.position;
  }

  getFacingDirection() {
    return new THREE.Vector3(Math.sin(this.facingAngle), 0, Math.cos(this.facingAngle));
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('wheel', this._onWheel);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
  }
}
