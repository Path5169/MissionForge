import * as THREE from 'three';

/**
 * InteractionManager: Centralized detection, distance & facing angle checks,
 * context-sensitive prompt generation, and execution for all facility terminals,
 * doors, inspection zones, and launch consoles.
 */
export class InteractionManager {
  constructor() {
    this.interactables = new Map();
    this.current = null;
    this.listeners = new Set();
    this.isLocked = false; // When an overlay modal is open

    this._bindKeys();
  }

  _bindKeys() {
    this._onKeyDown = e => {
      if (this.isLocked) return;
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      if (e.code === 'KeyE') {
        this.trigger();
      }
    };
    window.addEventListener('keydown', this._onKeyDown);
  }

  register(id, options) {
    const item = {
      id,
      position: options.position || new THREE.Vector3(),
      radius: options.radius || 3.2,
      prompt: options.prompt || 'Interact',
      keyPrompt: options.keyPrompt || 'E',
      action: options.action || (() => {}),
      facingCone: options.facingCone ?? 1.4, // Max radian deviation (~80 deg)
      tag: options.tag || 'terminal',
      enabled: options.enabled ?? true,
    };
    this.interactables.set(id, item);
    return item;
  }

  unregister(id) {
    this.interactables.delete(id);
    if (this.current?.id === id) {
      this.current = null;
      this._notify();
    }
  }

  update(playerPos, playerFacing) {
    if (this.isLocked) {
      if (this.current) {
        this.current = null;
        this._notify();
      }
      return;
    }

    let bestItem = null;
    let closestDist = Infinity;

    for (const item of this.interactables.values()) {
      if (!item.enabled) continue;

      const toItem = item.position.clone().sub(playerPos);
      toItem.y = 0; // Check horizontal distance
      const dist = toItem.length();

      if (dist <= item.radius) {
        toItem.normalize();
        // Dot product with player's facing direction
        const dot = playerFacing.dot(toItem);
        const angle = Math.acos(THREE.MathUtils.clamp(dot, -1, 1));

        // Accept if within facing cone or very close proximity (< 1.5m)
        if (angle <= item.facingCone || dist < 1.4) {
          if (dist < closestDist) {
            closestDist = dist;
            bestItem = item;
          }
        }
      }
    }

    if (this.current !== bestItem) {
      this.current = bestItem;
      this._notify();
    }
  }

  trigger() {
    if (this.current && this.current.action) {
      this.current.action(this.current);
    }
  }

  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  _notify() {
    const promptData = this.current
      ? {
          id: this.current.id,
          prompt: this.current.prompt,
          key: this.current.keyPrompt,
          tag: this.current.tag,
        }
      : null;

    for (const cb of this.listeners) {
      cb(promptData);
    }
  }

  lock(locked = true) {
    this.isLocked = locked;
    if (locked && this.current) {
      this.current = null;
      this._notify();
    }
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    this.interactables.clear();
    this.listeners.clear();
  }
}
