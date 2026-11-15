import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildVehicle, buildPayloadMesh, buildFairingShroud, buildFairingHalf, buildSatelliteVehicle, isFairingPart, isPayloadPart } from './rocketMesh.js';
import { assets } from './assets.js';

const SUN_ANGLE = 0.9;
const launchTextureLoader = new THREE.TextureLoader();

// Launch-site artwork (frontend/assets/launch). Pixel anchors are measured from the PNGs.
const LAUNCH_ART = {
  sky:   { src: '/assets/launch/earth-dawn-sky.png', aspect: 1456 / 819, horizon: 0.86 },
  pad:   { src: '/assets/launch/launch-pad.png', w: 2172, h: 724, centre: 1086, deck: 470, ground: 647 },
  tower: { src: '/assets/launch/service-tower.png', w: 1024, h: 1536, armTip: 810, foot: 1510, top: 13 },
};

// Smooth value noise that repeats every `period` units, so textures tile without a seam.
function periodicNoise(seed, period) {
  const v = Array.from({ length: period }, (_, i) => {
    const s = Math.sin(seed * 127.1 + i * 311.7) * 43758.5453;
    return s - Math.floor(s);
  });
  return x => {
    const i = Math.floor(x), f = x - i, t = f * f * (3 - 2 * f);
    const a = v[((i % period) + period) % period];
    const b = v[(((i + 1) % period) + period) % period];
    return a + (b - a) * t;
  };
}

// Distant mountains, hills and tree line in the colours of the dawn artwork. Tiles horizontally.
function makeHorizonTexture() {
  const W = 4096, H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const ridge = (base, amp, k1, k2, seed, top, bottom) => {
    const n1 = periodicNoise(seed, k1), n2 = periodicNoise(seed + 7, k2);
    const grad = g.createLinearGradient(0, base - amp, 0, H);
    grad.addColorStop(0, top); grad.addColorStop(1, bottom);
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 2) {
      const u = x / W;
      g.lineTo(x, base - amp * (0.65 * n1(u * k1) + 0.35 * n2(u * k2)));
    }
    g.lineTo(W, H); g.closePath(); g.fill();
  };
  ridge(118, 44, 7, 23, 1, '#76819f', '#b58f96');      // far mountains, hazy
  ridge(160, 30, 10, 37, 3, '#4b5572', '#86707c');     // mid hills
  ridge(208, 20, 46, 190, 5, '#1f2a29', '#394337');    // tree line, ragged top
  const mist = g.createLinearGradient(0, 140, 0, H);
  mist.addColorStop(0, 'rgba(230,160,140,0)');
  mist.addColorStop(1, 'rgba(230,160,140,.38)');
  g.fillStyle = mist; g.fillRect(0, 140, W, H - 140);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

// Ground below the pad: dusky earth that darkens with depth, with a little grain.
function makeGroundTexture() {
  const W = 256, H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#4a4f3c');
  grad.addColorStop(0.08, '#363a2e');
  grad.addColorStop(0.35, '#22241c');
  grad.addColorStop(1, '#0c0d0a');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = Math.random() < .5 ? 'rgba(0,0,0,.10)' : 'rgba(255,230,200,.05)';
    g.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 3, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

const SKY_VERT = `
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}`;

const SKY_FRAG = /* glsl */`
precision highp float;
varying vec2 vNdc;
uniform vec2 uHalf, uSun;
uniform float uAlt, uR, uRc, uPhi, uH, uTop, uRho, uStyle, uS0, uFine, uRidge;
uniform vec3 uSky, uGround, uGroundDark, uSpace;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  return mix(
    mix(hash(i), hash(i+vec2(1,0)), f.x),
    mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = p * 2.02 + vec2(17.1, 9.7);
    a *= 0.5;
  }
  return s;
}

float fbm3(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p);
    p = p * 2.02 + vec2(17.1, 9.7);
    a *= 0.5;
  }
  return s;
}

float pnoise(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  float a = hash(vec2(mod(i.x, per), i.y));
  float b = hash(vec2(mod(i.x+1.0, per), i.y));
  float c = hash(vec2(mod(i.x, per), i.y+1.0));
  float d = hash(vec2(mod(i.x+1.0, per), i.y+1.0));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}

float stars(vec2 uv) {
  vec2 g = uv * 70.0, id = floor(g), f = fract(g) - 0.5;
  float r = hash(id);
  vec2 off = (vec2(hash(id + 1.7), hash(id + 9.1)) - 0.5) * 0.6;
  float tw = step(0.962, r) *
    smoothstep(0.15 + 0.1 * r, 0.0, length(f - off));
  return tw * (0.35 + 0.65 * hash(id + 3.3));
}

void main() {
  vec2 P = vNdc * uHalf;
  float X = P.x, Y = P.y, W = Y + uRc;
  float d = sqrt(X*X + W*W);

  float h = (
    X*X + (Y + uAlt) * (Y + uRc + uR)
  ) / (d + uR);

  vec2 n = vec2(X, W) / d;
  float lit = dot(n, uSun);
  float day = smoothstep(-0.08, 0.28, lit);

  float cp = cos(uPhi), sp = sin(uPhi);

  vec2 uv = vNdc * vec2(uHalf.x / uHalf.y, 1.0);
  uv = vec2(
    uv.x*cp + uv.y*sp,
    -uv.x*sp + uv.y*cp
  );

  vec3 col = uSpace
    + vec3(0.8, 0.86, 1.0) * stars(uv)
    + vec3(0.30, 0.34, 0.5) * 0.035 *
      smoothstep(0.55, 0.95, fbm3(uv * vec2(1.3, 4.0) + 3.0));

  float dens = 0.0;

  if (uRho > 0.0) {
    float hh = max(h, 0.0);
    dens = exp(-hh / uH) *
      (1.0 - smoothstep(0.6 * uTop, uTop, hh));

    float twi = exp(-pow((lit - 0.04) / 0.14, 2.0));
    float zen = clamp(max(h, 0.0) / (uHalf.y * 1.15), 0.0, 1.0);

    vec3 hor = mix(uSky, vec3(0.86, 0.92, 1.0), 0.5);
    vec3 top = uSky * 0.52;

    vec3 scat = mix(hor, top, pow(zen, 0.5)) *
      (0.03 + 0.97 * day)
      + vec3(1.0, 0.42, 0.16) * twi * 0.5;

    col = mix(col, scat, clamp(dens * 1.2, 0.0, 1.0));
  }

  if (uRidge > 0.0 && h >= 0.0) {
    for (int k = 0; k < 2; k++) {
      float fk = float(k), par = 0.55 + 0.25 * fk;
      float sx = (X + uS0 * par) /
        (uHalf.y * (2.4 - 0.8 * fk));

      float rh = uHalf.y * (0.15 - 0.05 * fk) *
        (0.3 + 0.95 * fbm(vec2(
          sx * 2.0 + fk * 13.0,
          fk * 3.1
        ))) * uRidge;

      if (h < rh) {
        vec3 rc = uRho > 0.0
          ? mix(uGroundDark, uSky * 0.6, 0.35 + 0.22 * fk) *
            (0.08 + 0.92 * day)
          : uGroundDark * (0.06 + 0.94 * day) *
            (0.65 + 0.35 * fk);

        col = mix(col, rc, 0.96);
      }
    }
  }

  if (h < 0.0) {
    float depth = -h;
    vec2 q = vec2(
      X*cp + W*sp,
      -X*sp + W*cp
    ) / uR;

    vec3 base = uGround;

    if (uFine < 0.999) {
      if (uStyle < 0.5) {
        float land = smoothstep(0.50, 0.56, fbm(q * 3.1 + 3.0));
        vec3 landc = mix(uGroundDark, uGround, fbm3(q * 9.0));

        base = mix(vec3(0.02, 0.09, 0.22), landc, land);
        base = mix(
          base,
          vec3(0.92),
          smoothstep(0.52, 0.8, fbm3(q * 5.2 + vec2(7.0, 1.0))) * 0.7
        );
      } else if (uStyle < 1.5) {
        base = mix(uGroundDark, uGround, fbm(q * 5.0));
        base = mix(
          base,
          base * 0.7,
          smoothstep(0.5, 0.8, fbm3(q * 14.0))
        );
      } else if (uStyle < 2.5) {
        base = mix(uGroundDark, uGround, fbm(q * 4.0) * 0.7 + fbm3(q * 12.0) * 0.3);
        base = mix(
          base,
          uGroundDark * 0.75,
          smoothstep(0.42, 0.75, fbm(q * 8.0 + vec2(3.1, 1.7)))
        );
      } else if (uStyle < 3.5) {
        float boulder = fbm(q * 8.0);
        base = mix(uGroundDark, uGround, boulder) *
          (0.5 + 0.9 * fbm3(q * 24.0));
        base = mix(base, uGroundDark * 0.5, smoothstep(0.6, 0.85, fbm3(q * 32.0)));
      } else {
        float band = 0.5 + 0.5 * sin(q.y * 38.0 + 3.0 * fbm(q * 5.0));
        base = mix(uGroundDark, uGround, band);
      }
    } else {
      if (uStyle < 1.5) {
        base = mix(uGroundDark, uGround, fbm(q * 5.0));
        base = mix(
          base,
          base * 0.7,
          smoothstep(0.5, 0.8, fbm3(q * 14.0))
        );
      } else if (uStyle < 2.5) {
        base = mix(uGroundDark, uGround, fbm(q * 4.0) * 0.7 + fbm3(q * 12.0) * 0.3);
      } else if (uStyle < 3.5) {
        base = mix(uGroundDark, uGround, fbm(q * 8.0)) * (0.5 + 0.9 * fbm3(q * 24.0));
      } else {
        base = mix(uGroundDark, uGround, fbm(q * 5.0));
      }
    }

    float sa = X + uS0;
    vec3 fine = uGround;

    if (uFine > 0.001) {
      float f1 = pnoise(vec2(sa / 64.0, depth / 64.0), 128.0);
      float f2 = pnoise(vec2(sa / 8.0, depth / 8.0), 1024.0);
      float f3 = pnoise(vec2(sa, depth), 8192.0);

      fine = mix(
        uGroundDark,
        uGround,
        0.3 + 0.7 * (0.5 * f1 + 0.3 * f2 + 0.2 * f3)
      );

      fine *= 1.0 - 0.4 *
        smoothstep(0.0, uHalf.y * 0.6, depth);
    }

    vec3 sc = mix(base, fine, uFine) *
      (0.035 + 0.965 * day);

    if (uRho > 0.0) {
      float rim = exp(-depth / (uHalf.y * 0.05)) *
        smoothstep(12000.0, 60000.0, uHalf.y);

      sc = mix(sc, uSky * (0.15 + 0.85 * day), rim * 0.55);
    }

    col = sc;
  }

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const PART_VERT = `
attribute float aSize;
attribute float aLife;
uniform float uPx;
varying float vLife;

void main() {
  vLife = aLife;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uPx, 3.0, 16.0);
}`;

const PART_FRAG = `
precision highp float;
varying float vLife;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  // Soft diffuse radial bell curve instead of hard pixelated discard circle
  float alpha = smoothstep(1.0, 0.0, r) * pow(vLife, 1.5) * 0.22;
  if (alpha <= 0.003) discard;

  float t = 1.0 - vLife;
  vec3 smoke = mix(
    vec3(0.95, 0.76, 0.45), // Warm glow vapor near nozzle
    vec3(0.55, 0.58, 0.62), // Cooling grayish condensation trail
    smoothstep(0.15, 0.85, t)
  );

  gl_FragColor = vec4(smoke, alpha);
}`;

const FLAME_VERT = `
uniform float uTime;
uniform float uPower;
uniform float uPressure;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec3 p = position;
  float t = 1.0 - uv.y; // 0 at nozzle, 1 at plume tip
  // Supersonic bell expansion & aerodynamic turbulence
  float expansion = mix(0.35, 1.0 + (1.0 - clamp(uPressure, 0.0, 1.0)) * 0.65, pow(t, 0.7));
  float ripple = sin(uv.y * 22.0 - uTime * 28.0) * 0.035 * t * uPower;
  p.x *= expansion;
  p.x += ripple;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const FLAME_FRAG = `
precision highp float;
uniform float uTime;
uniform float uPower;
uniform float uCore;
uniform float uPressure;
varying vec2 vUv;

void main() {
  float t = 1.0 - vUv.y; // 0 at nozzle throat, 1 at tail
  float xDist = abs(vUv.x - 0.5) * 2.0; // 0 at center, 1 at sides

  // Mach diamond shock disks (standing shock cones along exhaust column)
  float shockFreq = 26.0;
  float diamonds = sin(t * shockFreq - uTime * 6.0);
  float shockGlow = smoothstep(0.4, 0.98, diamonds) * smoothstep(0.7, 0.08, t) * (1.0 - xDist);

  // Smooth Gaussian bell profile across the plume
  float plumeRadius = mix(0.35, 0.95, pow(t, 0.6));
  if (uCore > 0.5) plumeRadius *= 0.55;
  float radialFalloff = exp(-pow(xDist / max(0.01, plumeRadius), 2.2) * 2.8);

  // Longitudinal intensity falloff: intense white at throat, soft fade at tip
  float throatGlow = smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(0.75, 1.0, t));
  float a = radialFalloff * throatGlow * (0.85 + 0.25 * uPower);

  // Temperature / Radiation color ramp
  // Throat / Core: incandescent brilliant white-blue
  // Intermediate: golden amber
  // Outer expansion: luminous rocket orange
  // Wake / Fringe: deep ruby
  vec3 colThroat = vec3(1.0, 0.98, 0.94);
  vec3 colGold   = vec3(1.0, 0.74, 0.20);
  vec3 colOrange = vec3(1.0, 0.38, 0.05);
  vec3 colRuby   = vec3(0.92, 0.12, 0.02);

  vec3 col = mix(colThroat, colGold, smoothstep(0.05, 0.35, t));
  col = mix(col, colOrange, smoothstep(0.35, 0.70, t));
  col = mix(col, colRuby, smoothstep(0.70, 1.0, t));

  // Add shock diamond illumination
  col += vec3(0.9, 0.95, 1.0) * shockGlow * 1.6;

  if (uCore > 0.5) {
    // Inner hot supersonic core
    col = mix(vec3(1.0, 1.0, 1.0), colGold, smoothstep(0.1, 0.85, t));
    col *= 1.45 + 0.5 * uPower;
  } else {
    col *= 1.15 + 0.35 * uPower;
  }

  gl_FragColor = vec4(col, a * (uCore > 0.5 ? 0.95 : 0.65));
}`;

const srgb = c => new THREE.Color().setRGB(
  c[0] / 255,
  c[1] / 255,
  c[2] / 255,
  THREE.SRGBColorSpace
);

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const STYLE_IDS = { earth: 0, moon: 1, mars: 2, asteroid: 3, jupiter: 4, sun: 4 };

export class FlightView {
  constructor(canvas, { quality = 'high' } = {}) {
    this.canvas = canvas;
    this.quality = quality;
    this.zoom = 1;
    this.pxPerM = 1;
    this.viewH = 100;

    const r = this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });

    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : 1.25));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.1;

    this.scene = new THREE.Scene();
    // Pure 2D orthographic camera — the only camera used for rendering.
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    this.cam.position.z = 100;

    this.skyU = {
      uHalf: { value: new THREE.Vector2(1, 1) },
      uSun: { value: new THREE.Vector2(0, 1) },
      uAlt: { value: 0 },
      uR: { value: 1 },
      uRc: { value: 1 },
      uPhi: { value: 0 },
      uH: { value: 1 },
      uTop: { value: 1 },
      uRho: { value: 0 },
      uStyle: { value: 0 },
      uS0: { value: 0 },
      uFine: { value: 1 },
      uRidge: { value: 1 },
      uSky: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() },
      uGroundDark: { value: new THREE.Color() },
      uSpace: { value: srgb([3, 5, 12]) }
    };

    this.sky = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        uniforms: this.skyU,
        depthTest: false,
        depthWrite: false
      })
    );

    this.sky.frustumCulled = false;
    this.sky.renderOrder = -100;
    this.scene.add(this.sky);

    this.sun = new THREE.DirectionalLight(0xfff0dc, 3.2);
    this.hemi = new THREE.HemisphereLight(0x9bbcff, 0x2a2420, 0.45);
    this.scene.add(this.sun, this.hemi);

    this.holder = new THREE.Group();
    this.scene.add(this.holder);

    this.freeGroups = new Map();
    this.blastMeshes = new Map();
    this.flames = new Map();
    this.launchArtwork = this._createLaunchArtwork();
    this.scene.add(this.launchArtwork.group);

    this._initParticles();

    this.vehicle = null;
    this.body = null;
    this._building = null;

    if (quality === 'high') {
      const s = r.getSize(new THREE.Vector2());
      this.composer = new EffectComposer(r);
      this.renderPass = new RenderPass(this.scene, this.cam);
      this.composer.addPass(this.renderPass);

      this.bloom = new UnrealBloomPass(
        new THREE.Vector2(s.x, s.y),
        0.45,
        0.6,
        0.9
      );

      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }

    this.resize();
  }

  _createLaunchArtwork() {
    // root: toggled as a whole.  world: moves with the pad (metres, origin = pad ground point).
    // sky: stays on screen and fades out as the rocket climbs.
    const root = new THREE.Group();
    const world = new THREE.Group();
    root.add(world);
    root.visible = false;

    const load = src => {
      const t = launchTextureLoader.load(src);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    };
    const layer = (parent, map, z, color = 0xffffff) => {
      const material = new THREE.MeshBasicMaterial({ map, color, transparent: true, depthWrite: false, alphaTest: .01 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
      mesh.position.z = z;
      parent.add(mesh);
      return mesh;
    };

    return {
      group: root,
      world,
      sky: layer(root, load(LAUNCH_ART.sky.src), -150),
      hills: layer(world, makeHorizonTexture(), -120),
      ground: layer(world, makeGroundTexture(), -110),
      lip: layer(world, null, -109, 0x3d4630),
      pad: layer(world, load(LAUNCH_ART.pad.src), -60),
      tower: layer(world, load(LAUNCH_ART.tower.src), -50),
    };
  }

  // Half the rocket's width in metres (parts only, so flames do not count).
  _measureVehicle() {
    this._vehW = 1.5;
    if (!this.vehicle) return;
    this.vehicle.root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const mesh of this.vehicle.meshes.values()) box.expandByObject(mesh);
    if (!box.isEmpty()) this._vehW = Math.max(.6, (box.max.x - box.min.x) / 2);
  }

  // Lay out the launch site. Everything on the ground is anchored to the pad in the world,
  // so it falls away as the rocket climbs; only the sky stays with the camera.
  _placeLaunchArtwork({ halfX, halfY, frame, hv, alt, L, rel, phi, padPhi }) {
    const A = LAUNCH_ART;
    const art = this.launchArtwork;
    const ref = Math.max(34, L * 2.8);               // view height at the pad, metres
    const halfW = this._vehW ?? 1.5;

    const padS = ref * 1.75 / A.pad.w;               // metres per pixel
    const deckH = (A.pad.ground - A.pad.deck) * padS;
    const towerH = Math.max(1.15 * L, .62 * ref);
    const towerS = towerH / (A.tower.foot - A.tower.top);
    const gap = Math.max(.4, .04 * towerH);

    const near = 1 - smooth(1200, 4500, alt);        // pad + tower
    const far = 1 - smooth(500, 2500, alt);          // ground + hills
    const skyA = 1 - smooth(1500, 12000, alt);       // art sky -> procedural sky

    art.world.position.set(rel[0], rel[1], 0);
    art.world.rotation.z = phi - padPhi;

    const put = (mesh, w, h, x, y, opacity) => {
      mesh.visible = opacity > .004;
      mesh.scale.set(w, h, 1);
      mesh.position.x = x;
      mesh.position.y = y;
      mesh.material.opacity = opacity;
    };

    // pad: deck line at y = 0, centred under the rocket
    put(art.pad, A.pad.w * padS, A.pad.h * padS, 0, (A.pad.deck - A.pad.h / 2) * padS, near);

    // tower: foot on the deck, arm tips just clear of the rocket on the left
    put(art.tower, A.tower.w * towerS, A.tower.h * towerS,
      -(halfW + gap) + (A.tower.w / 2 - A.tower.armTip) * towerS,
      (A.tower.foot - A.tower.h / 2) * towerS, near);

    // terrain surface sits at the foot of the pad block
    const top = -deckH;
    const hillsH = .24 * ref;
    const hillsW = ref * 40;
    art.hills.material.map.repeat.x = hillsW / (hillsH * 16);
    put(art.hills, hillsW, hillsH, 0, top + hillsH / 2 - .02 * ref, far);

    const groundH = Math.max(ref * 3, hv * 1.6);
    art.ground.material.map.repeat.x = ref * 60 / (ref * .5);
    put(art.ground, ref * 60, groundH, 0, top - groundH / 2, far);

    const lipH = .035 * ref;
    put(art.lip, ref * 60, lipH, 0, top - lipH / 2, far);

    // sky: cover the screen; follow the horizon while it is in view, then keep the top aligned
    const ar = art.sky.material.map.image
      ? art.sky.material.map.image.width / art.sky.material.map.image.height
      : A.sky.aspect;
    const viewH = 2 * halfY, viewW = 2 * halfX;
    const h = Math.max(viewH, viewW / ar), w = h * ar;
    const wanted = top + (A.sky.horizon - .5) * h;
    const hi = -halfY + frame + h / 2;               // bottom edge may not rise above the view
    const lo = halfY + frame - h / 2;                // top edge may not fall below the view
    put(art.sky, w, h, 0, Math.min(hi, Math.max(lo, rel[1] + wanted)), skyA);
    art.sky.position.x = 0;
  }

  _initParticles() {
    const N = this.N = this.quality === 'high' ? 900 : 480;

    this.pw = {
      x: new Float64Array(N),
      y: new Float64Array(N),
      vx: new Float64Array(N),
      vy: new Float64Array(N),
      life: new Float64Array(N),
      max: new Float64Array(N),
      size: new Float64Array(N),
      grow: new Float64Array(N)
    };

    this.pHead = 0;

    const geo = new THREE.BufferGeometry();

    this.pPos = new Float32Array(N * 3);
    this.pSize = new Float32Array(N);
    this.pLife = new Float32Array(N);

    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.pPos, 3)
    );

    geo.setAttribute(
      'aSize',
      new THREE.BufferAttribute(this.pSize, 1)
    );

    geo.setAttribute(
      'aLife',
      new THREE.BufferAttribute(this.pLife, 1)
    );

    this.pUni = { uPx: { value: 1 } };

    this.points = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        vertexShader: PART_VERT,
        fragmentShader: PART_FRAG,
        uniforms: this.pUni,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );

    this.points.frustumCulled = false;
    this.points.position.z = -1;
    this.points.renderOrder = 5;
    this.scene.add(this.points);

    this.emitAcc = new Map();
  }

  setBody(b) {
    this.body = b;

    const u = this.skyU;
    const style = STYLE_IDS[b.style] ?? STYLE_IDS[b.id] ?? 1;

    Object.assign(u.uR, { value: b.R });
    u.uH.value = b.scaleHeight || 1;
    u.uTop.value = b.atmosphereTop || 1;
    u.uRho.value = b.rho0 > 0 ? 1 : 0;
    u.uStyle.value = style;

    u.uSky.value.copy(srgb(b.sky || [0, 0, 0]));
    u.uGround.value.copy(srgb(b.ground || [80, 80, 80]));
    u.uGroundDark.value.copy(
      srgb(b.groundDark || (b.ground ? b.ground.map(v => v * .5) : [40, 40, 40]))
    );

    if (this.launchArtwork?.group) {
      this.launchArtwork.group.visible = b.id === 'earth';
    }
  }

  async setVehicle(parts, payload = null) {
    this.payloadData = payload;
    const token = this._building = {};
    const v = await buildVehicle(parts, payload);

    if (token !== this._building) return;

    if (this.vehicle) {
      this.holder.remove(this.vehicle.root);
      this.vehicle.root.traverse(object => {
        if (object.isMesh) {
          object.geometry?.dispose();
          if (object.material?.userData.partArt) {
            object.material.map?.dispose();
            object.material.dispose();
          }
        }
      });
    }

    this.vehicle = v;
    this.holder.add(v.root);
   
    this._partBottoms = new Map(parts.filter(p => !p.detached).map(p => [p.uid, (Number(p.y1) || 0) + (Number(p.def?.landing?.drop) || 0)]));
    this._fairingUids = new Set(parts.filter(p => isFairingPart(p.def)).map(p => p.uid));
    this._payloadUids = new Set(parts.filter(p => isPayloadPart(p.def)).map(p => p.uid));
    this._measureVehicle();
    this._buildFlames(parts);
  }

  _buildFlames(parts) {
    for (const flame of this.flames.values()) {
      this.vehicle?.model.remove(flame.group);
      flame.group.traverse(o => {
        if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
      });
    }
    this.flames.clear();
    if (!this.vehicle?.model) return;

    for (const part of parts) {
      if (!part.def?.engine || !this.vehicle.meshes.has(part.uid)) continue;
      const group = new THREE.Group();
      const material = core => new THREE.ShaderMaterial({
        vertexShader: FLAME_VERT,
        fragmentShader: FLAME_FRAG,
        uniforms: { uTime: { value: 0 }, uPower: { value: 0 }, uCore: { value: core }, uPressure: { value: 1.0 } },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const outer = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 16, 48), material(0));
      const inner = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 16, 48), material(1));
      outer.renderOrder = 6;
      inner.renderOrder = 7;
      group.add(outer, inner);
      group.position.x = part.side ? (part.dir || 1) * part.x : 0;
      group.visible = false;
      this.vehicle.model.add(group);
      this.flames.set(part.uid, { group, outer, inner, part });
    }
  }

  _syncFlames(sim) {
    for (const [uid, flame] of this.flames) {
      const runtime = (sim.engines || []).find(e => e.uid === uid);
      const part = (sim.parts || []).find(p => p.uid === uid) || flame.part;
      const spec = runtime?.spec || runtime?.def?.engine || flame.part.def?.engine;
      const isSolid = spec?.type === 'solid';
      const isFiring = isSolid ? Boolean(runtime?.firing) : (Boolean(runtime?.ignited && runtime?.firing) || (sim.status === 'flying' && runtime?.firing !== false));
      const output = isSolid ? (isFiring ? 1.0 : 0.0) : Math.max(0, Number(runtime?.throttle ?? sim.throttle ?? 0));
      const active = sim.status !== 'prelaunch'
        && isFiring
        && part?.alive !== false
        && runtime?.alive !== false
        && !sim.crashed
        && output > 0.015;

      flame.group.visible = active;
      if (!active) continue;

      const pulse = 0.94 + 0.08 * Math.sin((sim.t || 0) * 45.0 + uid.length);
      const pr = Math.max(0.01, Math.min(1.2, Number(sim.pressureRatio) || 1.0));
      const expansion = 1.0 + (1.0 - Math.min(1.0, pr)) * 0.85;
      const diameter = Math.max(0.28, Number(flame.part.def?.diameter) || 1.0);
      const length = diameter * (0.8 + output * 1.8) * pulse * (1.1 - 0.15 * pr);
      const width = diameter * (0.55 + output * 0.22) * expansion;

      flame.group.position.y = -flame.part.y1 + 0.02 - length * 0.5;
      flame.group.scale.set(width, length, 1);
      for (const mesh of [flame.outer, flame.inner]) {
        mesh.material.uniforms.uTime.value = sim.t || 0;
        mesh.material.uniforms.uPower.value = output;
        mesh.material.uniforms.uPressure.value = pr;
      }
    }
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;

    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);

    this.aspect = w / h;
    this.pxH = this.renderer.getPixelRatio() * h;
  }

  render(sim, dt, opts = {}) {
    if (!this.body || !sim?.body) return;

    const b = sim.body;
    const R = b.R;
    const r = Math.hypot(sim.x, sim.y);
    const phi = Math.atan2(sim.x, sim.y);
    const alt = r - R;
    const baseAlt = alt - (sim.baseOffset || 0);

    const cp = Math.cos(phi);
    const sp = Math.sin(phi);

    const toL = (dx, dy) => [
      dx * cp - dy * sp,
      dx * sp + dy * cp
    ];

    const L = (sim.controlledVessel === 'satellite') ? 2.6 : Math.max(4, sim.botY - sim.topY);

    this.zoom = opts.zoom ?? this.zoom;

    const baseH = Math.max(
      .1,
      Math.min(Math.max(0, baseAlt) * 1.35, L * 8) + Math.max(34, L * 2.8)
    );

    this.minZoom = Math.max(
      .000001,
      Math.min(1, L * 1.25 / baseH)
    );

    this.zoom = Math.max(this.minZoom, this.zoom);

    const hv = Math.min(R * 6, baseH * this.zoom);
    this.viewH = hv;

    const halfY = hv / 2;
    const halfX = halfY * this.aspect;

    const frame = this.body?.id === 'earth' && sim.padWorld
      ? .2 * hv * (1 - smooth(40, 500, Math.max(0, alt)))
      : 0;

    // Camera shake from engine rumble
    let rumble = 0;
    const hasFiringEngine = sim.engines && sim.engines.some(e => e.alive && e.ignited);
    if (hasFiringEngine && (sim.status === 'flying' || sim.status === 'prelaunch')) {
      const thr = sim.throttle || 0;
      const altFactor = Math.max(0.18, 1.0 - Math.min(1.0, Math.max(0, alt) / 22000));
      rumble = thr * 0.42 * altFactor;
    }
    this.trauma = Math.max(0, (this.trauma || 0) - (dt || 0.016) * 1.5);
    const shakePower = Math.min(1.0, rumble + (this.trauma || 0) * (this.trauma || 0));

    let shakeX = 0;
    let shakeY = 0;
    if (shakePower > 0.004) {
      const shakeMag = hv * 0.0045 * shakePower;
      shakeX = (Math.random() - 0.5) * 2 * shakeMag;
      shakeY = (Math.random() - 0.5) * 2 * shakeMag;
    }

    // Update the orthographic camera
    Object.assign(this.cam, {
      left: -halfX + shakeX,
      right: halfX + shakeX,
      top: halfY + frame + shakeY,
      bottom: -halfY + frame + shakeY
    });

    this.cam.updateProjectionMatrix();
    this.pxPerM = this.pxH / hv;

    const sunL = toL(
      Math.sin(SUN_ANGLE),
      Math.cos(SUN_ANGLE)
    );

    const u = this.skyU;

    u.uHalf.value.set(halfX, halfY);
    u.uSun.value.set(sunL[0], sunL[1]);
    u.uAlt.value = alt;
    u.uRc.value = r;
    u.uPhi.value = phi;
    u.uS0.value = ((phi * R) % 8192 + 8192) % 8192;

    u.uFine.value = R < 100000
      ? 1 - smooth(Math.max(10, R * 0.05), Math.max(50, R * 0.4), hv)
      : 1 - smooth(8000, 40000, hv);

    u.uRidge.value =
      (1 - smooth(0.15 * hv, 1.1 * hv, Math.max(0, baseAlt))) *
      (1 - smooth(R < 100000 ? Math.max(50, R * 0.5) : 20000, R < 100000 ? Math.max(150, R * 1.5) : 60000, hv));

    const dayCam = smooth(-0.08, 0.28, sunL[1]);

    const skyBright = b.rho0 > 0
      ? Math.exp(-alt / b.scaleHeight) * dayCam
      : 0;

    this.sun.position.set(
      sunL[0] * 100,
      sunL[1] * 100,
      70
    );

    this.sun.intensity = 0.25 + 3.1 * dayCam;
    this.hemi.intensity = 0.12 + 0.55 * skyBright + 0.08 * dayCam;

    const controlledVessel = sim.controlledVessel || 'launcher';
    if (controlledVessel === 'satellite' && this._activeControlled !== 'satellite') {
      this._activeControlled = 'satellite';
      if (!this._satDeployStart) {
        this._satDeployStart = performance.now();
      }
      if (this.vehicle && !this.launcherVehicle) {
        this.launcherVehicle = this.vehicle;
      }
      if (!this.satelliteVehicle) {
        this.satelliteVehicle = buildSatelliteVehicle(this.payloadData || {}, 0.0);
      }
      if (this.launcherVehicle) this.holder.remove(this.launcherVehicle.root);
      this.vehicle = this.satelliteVehicle;
      this.holder.add(this.satelliteVehicle.root);
      if (!this._satZoomed) {
        this._satZoomed = true;
        this.zoom = 0.28;
      }
    } else if (controlledVessel === 'launcher' && this._activeControlled === 'satellite') {
      this._activeControlled = 'launcher';
      if (this.satelliteVehicle) this.holder.remove(this.satelliteVehicle.root);
      if (this.launcherVehicle) {
        this.vehicle = this.launcherVehicle;
        this.holder.add(this.launcherVehicle.root);
      }
    }

    if (sim.payloadDeployed && !this._satDeployStart && !this._satDeployDone) {
      this._satDeployStart = performance.now();
    }

    if (this.vehicle) {
      const h = this.holder;

      h.rotation.z = -(sim.th - phi);
      h.scale.set(1, 1, 1);

      if (this._activeControlled === 'satellite') {
        this.vehicle.model.position.set(0, 0, 0);
        // Animate smooth multi-stage slow-motion unfolding of solar arrays & antenna for active satellite
        const elapsed = this._satDeployStart ? (performance.now() - this._satDeployStart) / 1000 : 999;
        const duration = 6.8; // Cinematic slow-motion deployment (~7 seconds)
        const t = Math.min(1.0, elapsed / duration);
        // Majestic cubic S-curve ease-in-out
        const prog = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        const satMesh = this.satelliteVehicle?.payloadMesh;
        const thr = Number(sim.throttle) || 0;
        const rot = Number(sim.rotInput) || 0;
        if (satMesh?.userData?.updateState) {
          satMesh.userData.updateState(prog, thr, rot, sim.t || 0);
        } else if (satMesh?.userData?.updateProgress) {
          satMesh.userData.updateProgress(prog);
        }
        if (t >= 1.0) {
          this._satDeployStart = null;
          this._satDeployDone = true;
        }
      } else {
        let lowest = 0;
        for (const p of (sim.parts || [])) {
          if (p.alive === false) continue;
          lowest = Math.max(lowest, this._partBottoms?.get(p.uid) ?? 0);
        }
        if (lowest <= 0) {
          for (const m of this.vehicle.meshes.values()) {
            if (!m.visible) continue;
            const h = m.geometry?.parameters?.height || m.userData?.spanH || 0;
            const b = -(m.position.y - h / 2);
            if (b > lowest) lowest = b;
          }
        }
        this.vehicle.model.position.y = lowest || sim.botY || sim.com || 0;
      }

      const hasFairing = (sim.parts || []).some(
        p => (this._fairingUids?.has(p.uid) || isFairingPart(p.def)) && p.alive !== false
      );
      const fairingClosed = hasFairing && !sim.fairingJettisoned;

      const syncVehicleVisibility = (veh) => {
        if (!veh?.meshes) return;
        for (const p of (sim.parts || [])) {
          const m = veh.meshes.get(p.uid);
          if (m) {
            const isFairing = this._fairingUids?.has(p.uid) || m.userData.isFairing || isFairingPart(p.def);
            const isPayload = this._payloadUids?.has(p.uid) || m.userData.isPayload || isPayloadPart(p.def);

            if (isFairing) {
              m.visible = !sim.fairingJettisoned && p.alive !== false;
            } else if (isPayload) {
              m.visible = !sim.payloadDeployed && !fairingClosed && p.alive !== false;
            } else {
              m.visible = p.alive !== false;
            }
          }
        }
        const payloadMesh = veh.meshes.get('payload');
        if (payloadMesh) {
          payloadMesh.visible = !sim.payloadDeployed && !fairingClosed;
        }
      };

      syncVehicleVisibility(this.vehicle);
      if (this.launcherVehicle && this.launcherVehicle !== this.vehicle) {
        syncVehicleVisibility(this.launcherVehicle);
      }
      this._syncFlames(sim);
    }

    this._syncFree(sim, toL, phi);
    this._syncBlasts(sim, toL);

    // Launch site artwork
    const artwork = this.launchArtwork;
    const siteArtVisible = b.id === 'earth' && sim.padWorld && alt < 12000 && hv < 24000;
    artwork.group.visible = siteArtVisible;

    if (sim.padWorld) {
      const rel = toL(
        sim.padWorld[0] - sim.x,
        sim.padWorld[1] - sim.y
      );

      const padPhi = Math.atan2(sim.padWorld[0], sim.padWorld[1]);

      if (siteArtVisible) {
        this._placeLaunchArtwork({ halfX, halfY, frame, hv, alt, L, rel, phi, padPhi });
      }
    } else {
      artwork.group.visible = false;
    }

    this._particles(sim, dt, toL, phi, cp, sp);

    this.pUni.uPx.value = this.pxPerM;

    if (this.renderPass) {
      this.renderPass.camera = this.cam;
    }

    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.cam);
    }
  }

  _syncFree(sim, toL, phi, dt = 0.016) {
    const seen = new Set();

    for (const o of (Array.isArray(sim.free) ? sim.free : [])) {
      if (!o || o.id == null) continue;

      seen.add(o.id);

      let rec = this.freeGroups.get(o.id);

      if (!rec) {
        rec = {
          group: new THREE.Group(),
          model: null,
        };

        this.freeGroups.set(o.id, rec);
        this.scene.add(rec.group);

        const record = rec;

        const isPayloadObj = o.type === 'payload' || o.payload || (Array.isArray(o.parts) && o.parts.some(isPayloadPart));
        const isFairingObj = o.type === 'fairing' || o.label?.toLowerCase().includes('fairing') || (Array.isArray(o.parts) && o.parts.some(isFairingPart));

        if (isPayloadObj) {
          const payloadMeta = o.payload || this.payloadData || (o.parts ? o.parts.find(isPayloadPart)?.def : null) || {};
          rec._spawnTime = performance.now();
          rec.payloadMeta = payloadMeta;
          const pMesh = buildPayloadMesh(payloadMeta, true, 0.0);
          rec.pMesh = pMesh;
          record.model = { root: pMesh, model: pMesh };
          record.group.add(pMesh);
        } else if (isFairingObj) {
          const side = o.side || (o.id?.includes('stbd') || o.id?.includes('right') ? 'right' : 'left');
          const fairingPart = (o.parts || []).find(isFairingPart) || { def: { height: 1.8, diameter: 1.2 } };
          const fMesh = buildFairingHalf(side, fairingPart, 2.0, 1.3);
          record.model = { root: fMesh, model: fMesh };
          record.group.add(fMesh);
        } else if (o.id === 'launcher-core' && this.launcherVehicle) {
          record.model = this.launcherVehicle;
          record.group.add(this.launcherVehicle.root);
        } else {
          buildVehicle(Array.isArray(o.parts) ? o.parts : [])
            .then(v => {
              if (this.freeGroups.get(o.id) !== record) return;

              record.model = v;
              record.group.add(v.root);
            })
            .catch(error => {
              console.warn(
                'Could not build detached vehicle visual:',
                error
              );
            });
        }
      }

      // Smooth cinematic slow-motion solar array unfolding for deployed satellites
      if (rec.pMesh?.userData?.updateProgress && rec._spawnTime) {
        const elapsed = (performance.now() - rec._spawnTime) / 1000;
        const duration = 6.8; // Cinematic slow-motion deployment (~7 seconds)
        const t = Math.min(1.0, elapsed / duration);
        const progress = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        rec.pMesh.userData.updateProgress(progress);
      }

      rec.group.visible = !o.dead;

      const rel = toL(
        (o.x || 0) - sim.x,
        (o.y || 0) - sim.y
      );

      rec.group.position.set(rel[0], rel[1], 0);
      rec.group.rotation.z = -((o.th || 0) - phi);
      rec.group.scale.set(1, 1, 1);

      if (rec.model?.model) {
        if (o.id === 'launcher-core') {
          // Align separation plane at top of launcher booster so it decouples cleanly behind the deployed satellite
          const aliveParts = (sim.parts || []).filter(p => p.alive !== false && !this._payloadUids?.has(p.uid));
          const topY = aliveParts.length ? Math.min(...aliveParts.map(p => Number(p.y0) || 0)) : (o.com || 0);
          rec.model.model.position.y = topY;
        } else if (o.type === 'stage' || Array.isArray(o.parts)) {
          // Center detached stages at their true physical center so they decouple cleanly without jumping or clipping
          const yCenter = o.yCenter ?? (o.parts && o.parts.length
            ? (Math.min(...o.parts.map(p => Number(p.y0) || 0)) + Math.max(...o.parts.map(p => Number(p.y1) || 0))) / 2
            : (o.com || 0));
          rec.model.model.position.y = yCenter;
        } else {
          rec.model.model.position.y = o.com || 0;
        }
      }
    }

    for (const [id, rec] of this.freeGroups) {
      if (seen.has(id)) continue;

      this.scene.remove(rec.group);
      this.freeGroups.delete(id);
    }
  }

  _syncBlasts(sim, toL) {
    const seen = new Set();

    for (const blast of (Array.isArray(sim.blasts) ? sim.blasts : [])) {
      const age = sim.t - blast.t;

      if (age >= 1.1) continue;

      seen.add(blast.id);

      let mesh = this.blastMeshes.get(blast.id);

      if (!mesh) {
        // 2D circle for blast — PlaneGeometry with a radial gradient texture
        const size = 64;
        const bc = document.createElement('canvas');
        bc.width = bc.height = size;
        const bg = bc.getContext('2d');
        const grad = bg.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
        grad.addColorStop(0,   'rgba(255,220,100,1)');
        grad.addColorStop(0.3, 'rgba(255,100,30,0.9)');
        grad.addColorStop(0.7, 'rgba(200,60,10,0.4)');
        grad.addColorStop(1,   'rgba(100,30,5,0)');
        bg.fillStyle = grad;
        bg.fillRect(0, 0, size, size);
        const btex = new THREE.CanvasTexture(bc);
        btex.colorSpace = THREE.SRGBColorSpace;

        mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(1, 1),
          new THREE.MeshBasicMaterial({
            map: btex,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
          })
        );

        mesh.renderOrder = 8;
        this.blastMeshes.set(blast.id, mesh);
        this.scene.add(mesh);
      }

      const rel = toL(
        blast.x - sim.x,
        blast.y - sim.y
      );

      const size = .18 + age * 1.1;

      mesh.position.set(rel[0], rel[1], 2);
      mesh.scale.setScalar(size);
      mesh.material.opacity = 1 - age / 1.1;
    }

    for (const [id, mesh] of this.blastMeshes) {
      if (seen.has(id)) continue;

      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.map?.dispose();
      mesh.material.dispose();

      this.blastMeshes.delete(id);
    }
  }

  _particles(sim, dt, toL, phi, cp, sp) {
    const P = this.pw;
    const N = this.N;

    const L = Math.max(
      4,
      (sim.botY ?? 0) - (sim.topY ?? -4)
    );

    const beta = (sim.th ?? 0) - phi;
    const sb = Math.sin(beta);
    const cb = Math.cos(beta);

    const pressureRatio = Number.isFinite(sim.pressureRatio)
      ? sim.pressureRatio
      : Number.isFinite(sim.telemetry?.pressureRatio)
        ? sim.telemetry.pressureRatio
        : Number.isFinite(sim.atmosphere?.pressureRatio)
          ? sim.atmosphere.pressureRatio
          : 0;

    const pr = Math.max(0, pressureRatio);
    const rails = sim.lastRails === true;

    const drag = Math.exp(
      -3.2 * Math.min(1, pr * 4) * Math.max(0, dt)
    );

    for (let i = 0; i < N; i++) {
      if (P.life[i] <= 0) {
        this.pSize[i] = 0;
        this.pLife[i] = 0;
        continue;
      }

      P.life[i] -= dt;
      P.x[i] += P.vx[i] * dt;
      P.y[i] += P.vy[i] * dt;

      if (pr > 0.02) {
        P.vx[i] *= drag;
        P.vy[i] *= drag;
      }

      const life = Math.max(0, P.life[i] / P.max[i]);

      const rel = toL(
        P.x[i] - sim.x,
        P.y[i] - sim.y
      );

      this.pPos[i * 3] = rel[0];
      this.pPos[i * 3 + 1] = rel[1];
      this.pPos[i * 3 + 2] = 0;

      this.pSize[i] = P.size[i] + P.grow[i] * (1 - life);
      this.pLife[i] = life;
    }


    const engines = Array.isArray(sim.engines) ? sim.engines : [];

    if (!rails && dt > 0 && dt < 0.2 && !sim.crashed && sim.status !== 'prelaunch') {
      for (const engine of engines) {
        if (
          !engine ||
          engine.alive === false ||
          engine.firing !== true ||
          engine.ignited === false
        ) {
          continue;
        }

        const spec = engine.spec || engine.def?.engine;
        if (!spec) continue;

        const type = engine.type || spec.type || 'liquid';

        const output = type === 'solid'
          ? 1
          : Math.max(
              0,
              Number(engine.throttle ?? sim.throttle ?? 0)
            );

        if (output <= 0) continue;

        const rate = 24 * output *
          (engine.count > 1 ? 1.3 : 1);

        const accumulator =
          (this.emitAcc.get(engine.uid) || 0) + rate * dt;

        let count = Math.floor(accumulator);

        this.emitAcc.set(
          engine.uid,
          accumulator - count
        );

        const xs = engine.side
          ? (
              engine.dir
                ? [engine.dir * (engine.x || 0)]
                : [engine.x || 0, -(engine.x || 0)]
            )
          : [0];

        const diameter = Number(
          engine.diameter ?? engine.def?.diameter ?? 1
        );

        const radius = diameter *
          (type === 'solid' ? 0.3 : 0.38);

        const engineY = Number(engine.y1 ?? engine.y ?? 0);

        while (count-- > 0) {
          for (const x0 of xs) {
            const jitter =
              (Math.random() - 0.5) * radius * 1.2;

            const lx =
              (x0 + jitter) * cb +
              (-engineY + (sim.com || 0)) * sb;

            const ly =
              -(x0 + jitter) * sb +
              (-engineY + (sim.com || 0)) * cb;

            const spread = (Math.random() - 0.5) * 0.14;
            const ex = Math.sin(spread);
            const ey = -Math.cos(spread);

            const dlx = ex * cb + ey * sb;
            const dly = -ex * sb + ey * cb;

            const velocity = L *
              (pr > 0.05 ? 0.8 : 1.15) *
              (0.85 + Math.random() * 0.3);

            const wx = sim.x + lx * cp + ly * sp;
            const wy = sim.y - lx * sp + ly * cp;

            const wdx = dlx * cp + dly * sp;
            const wdy = -dlx * sp + dly * cp;

            const i = this.pHead;
            this.pHead = (i + 1) % N;

            P.x[i] = wx;
            P.y[i] = wy;

            P.vx[i] = (sim.vx || 0) + wdx * velocity;
            P.vy[i] = (sim.vy || 0) + wdy * velocity;

            P.max[i] = P.life[i] =
              (pr > 0.05 ? 0.38 : 0.65) *
              (0.75 + Math.random() * 0.25);

            P.size[i] =
              radius * (0.6 + Math.random() * 0.15);

            P.grow[i] =
              radius * (pr > 0.05 ? 0.8 : 1.1);

            const rel = toL(
              wx - sim.x,
              wy - sim.y
            );

            this.pPos[i * 3] = rel[0];
            this.pPos[i * 3 + 1] = rel[1];
            this.pPos[i * 3 + 2] = 0;

            this.pSize[i] = P.size[i];
            this.pLife[i] = 1;
          }
        }
      }
    }

    const geometry = this.points.geometry;

    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aSize.needsUpdate = true;
    geometry.attributes.aLife.needsUpdate = true;
  }

  addTrauma(amount) {
    this.trauma = Math.min(1.0, (this.trauma || 0) + Number(amount || 0));
  }

  reset() {
    this.pw.life.fill(0);
    this.emitAcc.clear();
    this.zoom = 1;
    this.pHead = 0;

    for (const mesh of this.blastMeshes.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.map?.dispose();
      mesh.material.dispose();
    }

    this.blastMeshes.clear();
    for (const flame of this.flames.values()) flame.group.visible = false;
  }

  dispose() {
    for (const flame of this.flames.values()) {
      flame.group.traverse(o => {
        if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
      });
    }
    this.flames.clear();
    this.points.geometry.dispose();
    this.points.material.dispose();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.launchArtwork.group.traverse(object => {
      if (object.isMesh) {
        object.geometry.dispose();
        object.material.map?.dispose();
        object.material.dispose();
      }
    });
    if (this.vehicle) {
      this.vehicle.root.traverse(object => {
        if (object.isMesh) {
          object.geometry?.dispose();
          if (object.material?.userData.partArt) {
            object.material.map?.dispose();
            object.material.dispose();
          }
        }
      });
    }
    this.composer?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
