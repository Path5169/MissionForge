// Planet GLB asset pipeline & part asset management
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map();
const imageCache = new Map();
const boxCache = new Map();
const planetCache = new Map();
const planetLoading = new Map();

const assetKey = value => String(value || '').toLowerCase().replace(/\.png$/i, '').replace(/[^a-z0-9]/g, '');

function loadImage(src) {
  if (!imageCache.has(src)) {
    const img = new Image();
    imageCache.set(src, img);
    img.src = src;
  }
  return imageCache.get(src);
}

export const assets = {
  registry: { parts: {}, bodies: {} },
  found: new Set(),
  partImages: new Map(),
  planets: {},

  init(info) {
    if (info) {
      this.registry = { parts: {}, bodies: {}, ...(info.registry || {}) };
      this.found = new Set(info.found || []);
      this.planets = info.planets || {};
    }
  },

  async discoverPartImages() {
    const res = await fetch('/api/part-assets');
    if (!res.ok) throw new Error('Part image list is unavailable.');
    const files = await res.json();
    this.partImages.clear();
    for (const file of files) {
      this.partImages.set(assetKey(file), '/assets/parts/' + encodeURIComponent(file));
    }
    for (const src of this.partImages.values()) {
      loadImage(src); // preload
    }
  },

  partSrc(def) {
    const keys = [def.catalogueId, def.id, def.name].map(assetKey);
    return keys.map(k => this.partImages.get(k)).find(Boolean) || null;
  },

  /** True when a PNG exists for this part (whether or not it has finished loading). */
  hasPartImage(def) {
    return !!this.partSrc(def);
  },

  /** Tight box around the visible pixels, so transparent padding in a PNG never shrinks the part. */
  artBox(image) {
    if (boxCache.has(image.src)) return boxCache.get(image.src);
    const W = image.naturalWidth, H = image.naturalHeight;
    let box = { sx: 0, sy: 0, sw: W, sh: H };
    try {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(image, 0, 0);
      const px = g.getImageData(0, 0, W, H).data;
      let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (px[(y * W + x) * 4 + 3]) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x1 >= x0 && y1 >= y0) box = { sx: x0, sy: y0, sw: x1 - x0 + 1, sh: y1 - y0 + 1 };
    } catch { }
    boxCache.set(image.src, box);
    return box;
  },

  partImage(def, onload) {
    const src = this.partSrc(def);
    if (!src) return null;
    const img = loadImage(src);
    if (onload && !img.complete) img.addEventListener('load', onload, { once: true });
    return img.complete && img.naturalWidth ? img : null;
  },

  /** Returns a Promise of a normalized Object3D for the component, or null when not registered / not present. */
  async part(def) {
    const rel = this.registry.parts?.[def.id];
    if (!rel || !this.found.has(rel) || !rel.endsWith('.glb')) return null;
    if (!cache.has(rel)) {
      const path = rel.startsWith('/') ? rel : (rel.startsWith('assets/') ? '/' + rel : '/assets/' + rel);
      cache.set(rel, loader.loadAsync(path).then(g => g.scene).catch(e => {
        console.warn('GLB failed:', rel, e);
        return null;
      }));
    }
    const src = await cache.get(rel);
    return src ? fit(src.clone(true), def) : null;
  },

  // ==========================================
  // PLANET GLB ASSET PIPELINE
  // ==========================================

  /** Returns true if a 3D GLB model is available for the given celestial body ID. */
  hasPlanet(planetId) {
    const id = String(planetId || '').toLowerCase();
    return !!(this.planets[id]?.file || this.registry.bodies?.[id]);
  },

  /**
   * Asynchronously loads a planetary GLB model and returns a standardized,
   * centered, and properly scaled Three.js Group with update() and dispose() methods.
   * Returns null gracefully if no GLB is found.
   */
  async loadPlanet(planetId, { radius = 1.0, quality = 'high' } = {}) {
    const id = String(planetId || '').toLowerCase();
    const meta = this.planets[id] || (this.registry.bodies?.[id] ? { id, file: this.registry.bodies[id] } : null);
    if (!meta || !meta.file) return null;

    const relPath = meta.file.replace(/^\//, '');
    const cacheKey = `${id}:${relPath}`;

    if (!planetCache.has(cacheKey)) {
      if (!planetLoading.has(cacheKey)) {
        const loadPromise = loader.loadAsync('/' + relPath)
          .then(gltf => {
            const scene = gltf.scene;
            scene.traverse(child => {
              if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material) {
                  child.material.roughness = child.material.roughness ?? 0.8;
                  child.material.metalness = child.material.metalness ?? 0.05;
                }
              }
            });
            return scene;
          })
          .catch(err => {
            console.warn(`[PlanetPipeline] Failed to load 3D GLB model for ${id} (${relPath}):`, err);
            return null;
          })
          .finally(() => {
            planetLoading.delete(cacheKey);
          });
        planetLoading.set(cacheKey, loadPromise);
      }
      const scene = await planetLoading.get(cacheKey);
      if (!scene) return null;
      planetCache.set(cacheKey, scene);
    }

    const baseScene = planetCache.get(cacheKey);
    if (!baseScene) return null;

    // Clone and normalize geometry inside a container group
    const planetClone = baseScene.clone(true);

    const box = new THREE.Box3().setFromObject(planetClone);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const center = sphere.center;
    const currentRadius = sphere.radius || 1.0;

    planetClone.position.sub(center);

    const targetRadius = Number(radius) || Number(meta.radius) || 1.0;
    const scaleFactor = targetRadius / currentRadius;

    const modelWrapper = new THREE.Group();
    modelWrapper.add(planetClone);
    modelWrapper.scale.setScalar(scaleFactor);

    if (meta.axialTilt) {
      modelWrapper.rotation.z = (meta.axialTilt * Math.PI) / 180;
    }

    const container = new THREE.Group();
    container.add(modelWrapper);

    container.userData = {
      planetId: id,
      meta,
      radius: targetRadius,
      rotationPeriod: meta.rotationPeriod || 86400,
      axialTilt: meta.axialTilt || 0.0,
      modelWrapper,
    };

    container.update = function(dt, warp = 1) {
      if (!dt) return;
      const period = this.userData.rotationPeriod || 86400;
      const angularSpeed = (2 * Math.PI) / period;
      modelWrapper.rotation.y += angularSpeed * dt * warp;
    };

    container.dispose = function() {
      container.traverse(obj => {
        if (obj.isMesh) {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) {
              obj.material.forEach(m => {
                if (m.map) m.map.dispose();
                m.dispose();
              });
            } else {
              if (obj.material.map) obj.material.map.dispose();
              obj.material.dispose();
            }
          }
        }
      });
    };

    return container;
  },

  /**
   * Asynchronously loads any registered 3D GLB model by registry key (e.g. 'launch_complex', 'hangar_interior', etc.)
   */
  async loadModel(key) {
    const rel = this.registry.models?.[key] || this.registry.bodies?.[key];
    if (!rel) return null;
    const url = rel.startsWith('/') ? rel : '/' + rel;
    if (!cache.has(url)) {
      cache.set(url, loader.loadAsync(url).then(g => g.scene).catch(e => {
        console.warn('[AssetPipeline] Failed to load 3D model:', url, e);
        return null;
      }));
    }
    const scene = await cache.get(url);
    return scene ? scene.clone(true) : null;
  },

  /** Disposes a planet container and frees all GPU buffers. */
  disposePlanet(container) {
    if (container && typeof container.dispose === 'function') {
      container.dispose();
    }
  },
};

function fit(obj, def) {
  const box = new THREE.Box3().setFromObject(obj),
    size = box.getSize(new THREE.Vector3()),
    c = box.getCenter(new THREE.Vector3());
  const s = def.height / (size.y || 1),
    g = new THREE.Group();
  obj.position.sub(c);
  g.add(obj);
  g.scale.setScalar(s);
  const w = new THREE.Group();
  w.add(g);
  return w;
}
