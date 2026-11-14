import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildVehicle, buildPayloadMesh, MATS } from './rocketMesh.js';
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
  if (r > 1.0) discard;

  float t = 1.0 - vLife;
  vec3 hot = mix(
    vec3(0.75, 0.88, 1.0),
    vec3(1.0, 0.62, 0.18),
    smoothstep(0.0, 0.35, t)
  );

  vec3 cool = mix(
    hot,
    vec3(0.45, 0.2, 0.08),
    smoothstep(0.35, 1.0, t)
  );

  float a = pow(1.0 - r, 1.8) * (0.45 + 0.55 * vLife);
  gl_FragColor = vec4(cool * (1.5 - 0.25 * t), a);
}`;

const FLAME_VERT = `
uniform float uTime;
uniform float uPower;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec3 p = position;
  float edge = sin(uv.y * 18.0 + uTime * 18.0) * 0.045;
  p.x += edge * (1.0 - uv.y) * uPower;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const FLAME_FRAG = `
precision highp float;
uniform float uTime;
uniform float uPower;
uniform float uCore;
varying vec2 vUv;

float noise(vec2 p) {
  return 0.5 + 0.5 * sin(p.x * 13.7 + sin(p.y * 7.1 + uTime * 7.0) * 2.0);
}

void main() {
  float t = 1.0 - vUv.y;
  float n = noise(vec2(vUv.x * 2.0, t * 3.0));
  float width = mix(.10, .48, t) + (n - .5) * .13 * t;
  if (uCore > .5) width *= .48;
  float edge = abs(vUv.x - .5) * 2.0;
  float plume = 1.0 - smoothstep(width * .56, width, edge);
  float tip = 1.0 - smoothstep(.72, 1.0, t);
  float root = smoothstep(0.0, .06, t);
  float a = plume * tip * root * (.8 + .2 * uPower);
  if (a < .012) discard;

  vec3 orange = vec3(1.0, .18, .015);
  vec3 gold = vec3(1.0, .66, .08);
  vec3 white = vec3(1.0, .98, .78);
  vec3 col = mix(white, gold, smoothstep(.02, .42, t));
  col = mix(col, orange, smoothstep(.42, 1.0, t));
  if (uCore > .5) col = mix(white, vec3(1.0, .72, .24), smoothstep(.05, .8, t));
  gl_FragColor = vec4(col * (1.15 + 1.15 * uPower), a * (uCore > .5 ? .98 : .72));
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
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    this.cam.position.z = 100;
    this.trauma = 0;

    // True 3D Perspective Camera System with Hollywood-grade Cinematic Perspectives
    this.aspect = (canvas.clientWidth || window.innerWidth || 1280) / (canvas.clientHeight || window.innerHeight || 720);
    this.pCam = new THREE.PerspectiveCamera(52, this.aspect, 0.1, 800000);
    this.cameraMode = 'track'; // 'track', 'pad_wide', 'pad_low', 'engine_close', 'distant', 'free', 'surface'
    this.camCurrentPos = new THREE.Vector3(0, 6, 26);
    this.camCurrentLook = new THREE.Vector3(0, 6, 0);
    this.freeCamTheta = Math.PI / 4;
    this.freeCamPhi = Math.PI / 3.4;
    this.freeCamRadius = 26;
    this.isDragging = false;
    this.lastPointer = { x: 0, y: 0 };

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
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.width = 2048;
    this.sun.shadow.mapSize.height = 2048;
    this.hemi = new THREE.HemisphereLight(0x9bbcff, 0x2a2420, 0.45);
    this.scene.add(this.sun, this.hemi);

    // Dynamic Flame Trench & Platform Illumination
    this.trenchLight = new THREE.PointLight(0xff6a22, 0, 65);
    this.trenchLight.position.set(0, 1.2, 0);
    this.scene.add(this.trenchLight);

    this.holder = new THREE.Group();
    this.scene.add(this.holder);

    this.freeGroups = new Map();
    this.blastMeshes = new Map();
    this.flames = new Map();
    this.pad = this._buildPad();
    this.scene.add(this.pad);
    this.launchArtwork = this._createLaunchArtwork();
    this.scene.add(this.launchArtwork.group);

    this.launchComplex3D = null;
    this.lunarEnvironment3D = null;
    this.landerRover3D = null;
    this._load3DEnvironments();

    this.groundSmokeGroup = new THREE.Group();
    this.scene.add(this.groundSmokeGroup);
    this._initGroundSmoke();

    this.lunarDustGroup = new THREE.Group();
    this.scene.add(this.lunarDustGroup);
    this._initLunarDust();

    this._initParticles();
    this._bindPointerEvents();

    this.vehicle = null;
    this.body = null;
    this._building = null;

    if (quality === 'high') {
      const s = r.getSize(new THREE.Vector2());
      this.composer = new EffectComposer(r);
      this.renderPass = new RenderPass(this.scene, this.pCam);
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

  _buildPad() {
    const g = new THREE.Group();

    const conc = new THREE.MeshStandardMaterial({
      color: 0x777e89,
      roughness: .9
    });

    const steel = new THREE.MeshStandardMaterial({
      color: 0x687889,
      roughness: .48,
      metalness: .68
    });

    const trim = new THREE.MeshStandardMaterial({
      color: 0xb9c2ca,
      roughness: .48,
      metalness: .58
    });

    const dark = new THREE.MeshStandardMaterial({
      color: 0x252d37,
      roughness: .82,
      metalness: .25
    });

    const hazard = new THREE.MeshStandardMaterial({
      color: 0xe7a843,
      roughness: .66,
      metalness: .1
    });

    const add = (w, h, d, m, x, y, z = 0) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z);
      g.add(b);
    };

    const towerX = -7.5, towerW = 2.8, towerH = 34;

    add(32, 1.2, 18, conc, 2.5, -.6);
    add(7, .45, 7, dark, 0, .12);
    add(3.2, .32, 5.2, trim, 0, .48);
    add(2.4, .18, 8, dark, 2.6, -.22);
    add(1.4, .16, 5.5, steel, 6, -.23);

    for (const x of [-1.2, 1.2]) {
      for (const z of [-1.2, 1.2]) {
        add(.25, 1.05, .25, trim, x, .5, z);
      }
    }

    for (const x of [-10.3, -4.7]) {
      for (const z of [-.2, 3]) {
        add(.34, towerH, .34, steel, x, towerH / 2, z);
      }
    }

    for (let i = 0; i <= 8; i++) {
      const y = i * 4;

      add(towerW, .2, .2, trim, towerX, y, -.2);
      add(towerW, .2, .2, trim, towerX, y, 3);

      if (i < 8) {
        for (const z of [-.2, 3]) {
          const brace = new THREE.Mesh(
            new THREE.BoxGeometry(.13, 4.3, .13),
            steel
          );

          brace.position.set(towerX, y + 2, z);
          brace.rotation.z = i % 2 ? .62 : -.62;
          g.add(brace);
        }
      }
    }

    for (const y of [10, 20, 29]) {
      add(4.5, .3, 4.6, dark, -4.1, y, .9);
      add(4.2, .14, .24, trim, -4, y + .24, 2.9);
      add(4.2, .14, .24, trim, -4, y + .24, -1.1);

      for (const x of [-5.7, -2.2]) {
        add(.13, 1.25, .13, steel, x, y - .65, .9);
      }

      const arm = new THREE.Group();
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(5.2, .24, .38),
        trim
      );

      arm.position.set(towerX, y + .65, .9);
      beam.position.set(3.05, 0, 0);
      arm.add(beam);

      const head = new THREE.Mesh(
        new THREE.BoxGeometry(.55, .65, .55),
        hazard
      );

      head.position.set(5.65, 0, 0);
      arm.add(head);

      arm.userData.launchArm = true;
      g.add(arm);
    }

    const beacon = new THREE.MeshStandardMaterial({
      color: 0xffb02e,
      emissive: 0xff9a26,
      emissiveIntensity: 1.4,
      roughness: .45
    });

    add(1.2, 1.6, 1.2, beacon, towerX, towerH + .8, 1.4);

    for (const x of [-15, 15]) {
      add(.36, 18, .36, steel, x, 9, 5);
      add(1.3, .55, .8, beacon, x, 18.5, 5);
      add(2.2, .3, 1.5, dark, x, .15, 5);
    }

    for (let i = 0; i < 8; i++) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(1.15, .035, .42),
        i % 2 ? dark : hazard
      );

      stripe.position.set(-13 + i * 1.7, .03, -6.5);
      g.add(stripe);
    }

    for (const x of [-12, 12]) {
      add(.22, .09, 1.2, trim, x, .03, -5);
      add(.22, .09, 1.2, trim, x, .03, 5);
    }

    g.userData.launchArms = g.children.filter(
      o => o.userData.launchArm
    );

    g.visible = false;
    return g;
  }

  async _load3DEnvironments() {
    try {
      const launchComplex = await assets.loadModel('launch_complex');
      if (launchComplex) {
        this.launchComplex3D = launchComplex;
        this.launchComplex3D.position.set(0, 0, 0);
        this.launchComplex3D.traverse(c => {
          if (c.isMesh) {
            c.castShadow = true;
            c.receiveShadow = true;
          }
        });
        this.scene.add(this.launchComplex3D);
      }
    } catch (e) {
      console.warn('[FlightView] 3D Launch complex notice:', e);
    }

    try {
      const lunar = await assets.loadModel('lunar_surface');
      if (lunar) {
        this.lunarEnvironment3D = lunar;
        this.lunarEnvironment3D.position.set(0, 0, 0);
        this.lunarEnvironment3D.traverse(c => {
          if (c.isMesh) {
            c.receiveShadow = true;
          }
        });
        this.lunarEnvironment3D.visible = false;
        this.scene.add(this.lunarEnvironment3D);
      }
    } catch (e) {
      console.warn('[FlightView] 3D Lunar surface notice:', e);
    }

    try {
      const vehicleLander = await assets.loadModel('lander_rover');
      if (vehicleLander) {
        this.landerRover3D = vehicleLander;
        this.landerRover3D.position.set(0, 0, 0);
        this.landerRover3D.traverse(c => {
          if (c.isMesh) {
            c.castShadow = true;
            c.receiveShadow = true;
          }
        });
        this.landerRover3D.visible = false;
        this.scene.add(this.landerRover3D);
      }
    } catch (e) {
      console.warn('[FlightView] 3D Lander/Rover notice:', e);
    }
  }

  // ==========================================
  // PROCEDURAL 3D SMOKE & LUNAR DUST SYSTEMS
  // ==========================================

  _initGroundSmoke() {
    this.smokeParticles = [];
    const smokeGeo = new THREE.DodecahedronGeometry(0.8, 1);
    const smokeMat = new THREE.MeshStandardMaterial({
      color: 0x98a0ab,
      roughness: 0.95,
      metalness: 0.05,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });

    for (let i = 0; i < 48; i++) {
      const mesh = new THREE.Mesh(smokeGeo, smokeMat.clone());
      mesh.visible = false;
      this.groundSmokeGroup.add(mesh);
      this.smokeParticles.push({
        mesh,
        active: false,
        age: 0,
        maxLife: 2.8,
        vel: new THREE.Vector3(),
        rotSpeed: (Math.random() - 0.5) * 1.5,
      });
    }
  }

  _emitGroundSmoke(dt, thr = 1.0) {
    if (!this.smokeParticles) return;
    const count = Math.min(3, Math.ceil(thr * 2.5));
    let spawned = 0;

    for (const p of this.smokeParticles) {
      if (!p.active) {
        p.active = true;
        p.age = 0;
        p.maxLife = 2.2 + Math.random() * 1.2;
        p.mesh.visible = true;

        // Emit from flame trench openings (-X and +X directions primarily)
        const side = Math.random() < 0.5 ? -1 : 1;
        const angle = (side > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 1.2;
        const speed = (9 + Math.random() * 8) * thr;

        p.mesh.position.set(
          side * (1.5 + Math.random() * 2),
          0.4 + Math.random() * 0.8,
          (Math.random() - 0.5) * 4.5
        );
        p.vel.set(Math.cos(angle) * speed, 0.4 + Math.random() * 1.2, Math.sin(angle) * speed * 0.6);
        p.mesh.scale.setScalar(0.9 + Math.random() * 0.7);
        p.mesh.material.opacity = 0.55 * thr;

        spawned++;
        if (spawned >= count) break;
      }
    }
  }

  _updateGroundSmoke(dt) {
    if (!this.smokeParticles) return;
    for (const p of this.smokeParticles) {
      if (p.active) {
        p.age += dt;
        if (p.age >= p.maxLife) {
          p.active = false;
          p.mesh.visible = false;
        } else {
          const progress = p.age / p.maxLife;
          p.mesh.position.addScaledVector(p.vel, dt);
          p.vel.multiplyScalar(0.94); // Ground drag deceleration
          p.vel.y += 0.4 * dt; // Thermal buoyancy
          p.mesh.rotation.y += p.rotSpeed * dt;
          p.mesh.scale.addScalar(dt * 2.2); // Cloud expansion
          p.mesh.material.opacity = (1 - progress) * 0.55;
        }
      }
    }
  }

  _initLunarDust() {
    this.lunarDust = [];
    const dustGeo = new THREE.DodecahedronGeometry(0.35, 1);
    const dustMat = new THREE.MeshStandardMaterial({
      color: 0x484b50,
      roughness: 0.98,
      metalness: 0.02,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });

    for (let i = 0; i < 32; i++) {
      const mesh = new THREE.Mesh(dustGeo, dustMat.clone());
      mesh.visible = false;
      this.lunarDustGroup.add(mesh);
      this.lunarDust.push({
        mesh,
        active: false,
        age: 0,
        maxLife: 1.8,
        vel: new THREE.Vector3(),
      });
    }
  }

  _emitLunarDust(dt, thr = 0.5) {
    if (!this.lunarDust) return;
    for (const d of this.lunarDust) {
      if (!d.active && Math.random() < 0.4) {
        d.active = true;
        d.age = 0;
        d.maxLife = 1.4 + Math.random() * 0.8;
        d.mesh.visible = true;

        const ang = Math.random() * Math.PI * 2;
        const spd = (5 + Math.random() * 7) * thr;
        d.mesh.position.set(0.5 * Math.cos(ang), 0.1, 0.5 * Math.sin(ang));
        d.vel.set(Math.cos(ang) * spd, 0.6 + Math.random() * 1.2, Math.sin(ang) * spd);
        d.mesh.scale.setScalar(0.4 + Math.random() * 0.4);
        d.mesh.material.opacity = 0.45;
        break;
      }
    }
  }

  _updateLunarDust(dt) {
    if (!this.lunarDust) return;
    for (const d of this.lunarDust) {
      if (d.active) {
        d.age += dt;
        if (d.age >= d.maxLife) {
          d.active = false;
          d.mesh.visible = false;
        } else {
          const prog = d.age / d.maxLife;
          d.mesh.position.addScaledVector(d.vel, dt);
          d.vel.y -= 1.62 * dt; // Lunar gravity
          d.mesh.scale.addScalar(dt * 0.8);
          d.mesh.material.opacity = (1 - prog) * 0.45;
        }
      }
    }
  }

  // ==========================================
  // CAMERA CONTROLS & POINTER HANDLING
  // ==========================================

  setCameraMode(mode) {
    const valid = ['track', 'pad_wide', 'pad_low', 'engine_close', 'distant', 'free', 'surface'];
    if (valid.includes(mode)) {
      this.cameraMode = mode;
      return true;
    }
    return false;
  }

  _bindPointerEvents() {
    this.canvas.addEventListener('mousedown', e => {
      this.isDragging = true;
      this.lastPointer.x = e.clientX;
      this.lastPointer.y = e.clientY;
    });

    window.addEventListener('mousemove', e => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      this.lastPointer.x = e.clientX;
      this.lastPointer.y = e.clientY;

      this.freeCamTheta -= dx * 0.007;
      this.freeCamPhi = Math.max(0.05, Math.min(Math.PI / 2 - 0.05, this.freeCamPhi - dy * 0.007));
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    this.canvas.addEventListener('wheel', e => {
      this.freeCamRadius = Math.max(5, Math.min(180, this.freeCamRadius + e.deltaY * 0.04));
    }, { passive: true });
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

    if (this.launchComplex3D) {
      this.launchComplex3D.visible = near > 0.005;
      art.pad.visible = false;
      art.tower.visible = false;
    } else {
      // pad: deck line at y = 0, centred under the rocket
      put(art.pad, A.pad.w * padS, A.pad.h * padS, 0, (A.pad.deck - A.pad.h / 2) * padS, near);

      // tower: foot on the deck, arm tips just clear of the rocket on the left
      put(art.tower, A.tower.w * towerS, A.tower.h * towerS,
        -(halfW + gap) + (A.tower.w / 2 - A.tower.armTip) * towerS,
        (A.tower.foot - A.tower.h / 2) * towerS, near);
    }

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

    if (this.pad) {
      this.pad.visible = b.id === 'earth';
    }
    if (this.launchArtwork?.group) {
      this.launchArtwork.group.visible = b.id === 'earth';
    }
    if (this.lunarEnvironment3D) {
      this.lunarEnvironment3D.visible = b.id === 'moon';
    }
  }

  async setVehicle(parts, payload = null) {
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
        uniforms: { uTime: { value: 0 }, uPower: { value: 0 }, uCore: { value: core } },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const outer = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 1, 12), material(0));
      const inner = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 1, 12), material(1));
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
      const spec = runtime?.spec || runtime?.def?.engine || flame.part.def.engine;
      const output = spec?.type === 'solid' ? (runtime?.firing ? 1 : 0) : Math.max(0, Number(runtime?.throttle ?? sim.throttle ?? 0));
      const active = part?.alive !== false && runtime?.alive !== false && output > .015 && runtime?.firing !== false && !sim.crashed;
      flame.group.visible = active;
      if (!active) continue;
      const pulse = .92 + .12 * Math.sin((sim.t || 0) * 38 + uid.length);
      const pressure = Math.max(.72, Math.min(1.18, Number(sim.pressureRatio) || 1));
      const diameter = Math.max(.28, Number(flame.part.def.diameter) || 1);
      const length = diameter * (.55 + output * 1.35) * pulse * (1.08 - .14 * pressure);
      const width = diameter * (.5 + output * .16);
      flame.group.position.y = -flame.part.y1 + .02 - length * .5;
      flame.group.scale.set(width, length, 1);
      for (const mesh of [flame.outer, flame.inner]) {
        mesh.material.uniforms.uTime.value = sim.t || 0;
        mesh.material.uniforms.uPower.value = output;
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

    const L = Math.max(4, sim.botY - sim.topY);

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

    // Cinematic launch rumble & camera trauma
    let rumble = 0;
    const hasFiringEngine = sim.engines && sim.engines.some(e => e.alive && e.ignited);
    if (hasFiringEngine && (sim.status === 'flying' || sim.status === 'prelaunch')) {
      const thr = sim.throttle || 0;
      const altFactor = Math.max(0.18, 1.0 - Math.min(1.0, Math.max(0, alt) / 22000));
      rumble = thr * 0.42 * altFactor;
    }
    this.trauma = Math.max(0, (this.trauma || 0) - (dt || 0.016) * 1.5);
    const shakePower = Math.min(1.0, rumble + this.trauma * this.trauma);

    let shakeX = 0;
    let shakeY = 0;
    if (shakePower > 0.004) {
      const shakeMag = hv * 0.0045 * shakePower;
      shakeX = (Math.random() - 0.5) * 2 * shakeMag;
      shakeY = (Math.random() - 0.5) * 2 * shakeMag;
    }

    Object.assign(this.cam, {
      left: -halfX + shakeX,
      right: halfX + shakeX,
      top: halfY + frame + shakeY,
      bottom: -halfY + frame + shakeY
    });

    this.cam.updateProjectionMatrix();
    this.pxPerM = this.pxH / hv;

    if (this.pCam) {
      this.pCam.aspect = this.aspect;
      this.pCam.updateProjectionMatrix();
    }

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

  
    if (this.vehicle) {
      const h = this.holder;

      h.rotation.z = -(sim.th - phi);
      h.scale.set(1, 1, 1);

      let lowest = 0;
      for (const p of (sim.parts || [])) {
        if (p.alive === false) continue;
        lowest = Math.max(lowest, this._partBottoms?.get(p.uid) ?? 0);
      }
      this.vehicle.model.position.y = lowest || sim.com || 0;
      if (lowest && Math.abs(lowest - (sim.com || 0)) > 0.05 && !this._warnedCom) {
        this._warnedCom = true;
        console.warn('Rocket geometry mismatch: frontend bottom', lowest, 'vs backend centerOfMass', sim.com,
          '. Keep frontend/js/vehicle/vehicle.js layout() and backend/vehicle/geometry.py in sync.');
      }

      for (const p of (sim.parts || [])) {
        const m = this.vehicle.meshes.get(p.uid);
        if (m) {
          if (p.def?.category === 'fairing' && sim.fairingJettisoned) {
            m.visible = false;
          } else {
            m.visible = p.alive !== false;
          }
        }
      }
      const payloadMesh = this.vehicle?.meshes?.get('payload');
      if (payloadMesh) {
        payloadMesh.visible = !sim.payloadDeployed;
      }
      this._syncFlames(sim);
    }

    this._syncFree(sim, toL, phi);
    this._syncBlasts(sim, toL);

    // Launch pad.
    const pad = this.pad;
    const artwork = this.launchArtwork;
    const siteArtVisible = b.id === 'earth' && sim.padWorld && alt < 12000 && hv < 24000;
    artwork.group.visible = siteArtVisible;

    if (sim.padWorld) {
      const rel = toL(
        sim.padWorld[0] - sim.x,
        sim.padWorld[1] - sim.y
      );

      pad.visible = b.id === 'earth' &&
        Math.hypot(rel[0], rel[1]) < hv * 2.5 &&
        hv < 6000;
      const padPhi = Math.atan2(sim.padWorld[0], sim.padWorld[1]);

      const padScale = Math.max(.48, Math.min(1, L / 20));
      pad.scale.setScalar(padScale);
      pad.position.set(rel[0], rel[1], -6);
      pad.rotation.z = phi;

      const retract = smooth(0, 3, Math.max(0, sim.maxAlt || 0));

      for (const arm of pad.userData.launchArms) {
        arm.rotation.z = retract * .9;
      }

      if (this.launchComplex3D) {
        this.launchComplex3D.position.set(rel[0], rel[1], -5.5);
        this.launchComplex3D.rotation.z = phi;
        this.launchComplex3D.visible = pad.visible;
      }

      if (siteArtVisible) {
        this._placeLaunchArtwork({ halfX, halfY, frame, hv, alt, L, rel, phi, padPhi });
      }
    } else {
      pad.visible = false;
      artwork.group.visible = false;
      if (this.launchComplex3D) this.launchComplex3D.visible = false;
    }

    // Engine ignition effects & flame trench smoke
    const isFiring = sim.engines && sim.engines.some(e => e.alive && e.ignited);
    if (isFiring && (sim.status === 'prelaunch' || alt < 80)) {
      const thr = sim.throttle || 0.85;
      this.trenchLight.intensity = thr * (22 + 8 * Math.sin(performance.now() * 0.025));
      this._emitGroundSmoke(dt || 0.016, thr);
    } else {
      this.trenchLight.intensity = Math.max(0, this.trenchLight.intensity - (dt || 0.016) * 15);
    }
    this._updateGroundSmoke(dt || 0.016);

    // 3D Lunar Environment
    if (this.lunarEnvironment3D && b.id === 'moon') {
      const surfaceVisible = alt < 25000;
      this.lunarEnvironment3D.visible = surfaceVisible;
      if (surfaceVisible) {
        this.lunarEnvironment3D.position.set(0, -alt, 0);
      }
      if (alt < 20 && isFiring) {
        this._emitLunarDust(dt || 0.016, sim.throttle || 0.6);
      }
    }
    this._updateLunarDust(dt || 0.016);

    // ==========================================
    // CINEMATIC PERSPECTIVE CAMERA UPDATE
    // ==========================================
    const vehH = L || 14;
    const targetLook = new THREE.Vector3(0, 0, 0);
    const targetCamPos = new THREE.Vector3();

    if (this.cameraMode === 'pad_wide') {
      const pDist = Math.max(38, vehH * 2.2);
      targetCamPos.set(-pDist * 0.7, Math.max(8, alt * 0.4 + 10), pDist);
      targetLook.set(0, Math.min(alt * 0.8, 120), 0);
    } else if (this.cameraMode === 'pad_low') {
      targetCamPos.set(4.5, 0.9, 14);
      targetLook.set(0, Math.max(4, alt * 0.6 + 6), 0);
    } else if (this.cameraMode === 'engine_close') {
      targetCamPos.set(0.6, -1.8, 6.2);
      targetLook.set(0, 0, 0);
    } else if (this.cameraMode === 'distant') {
      targetCamPos.set(-110, 24, 95);
      targetLook.set(0, Math.min(alt * 0.85, 200), 0);
    } else if (this.cameraMode === 'surface' || sim.status === 'landed') {
      const r = Math.max(8, Math.min(30, this.freeCamRadius));
      targetCamPos.set(r * Math.cos(this.freeCamTheta), 2.8, r * Math.sin(this.freeCamTheta));
      targetLook.set(0, 1.6, 0);
    } else if (this.cameraMode === 'free') {
      const r = this.freeCamRadius;
      const th = this.freeCamTheta;
      const ph = Math.max(0.06, Math.min(Math.PI / 2 - 0.04, this.freeCamPhi));
      targetCamPos.set(
        r * Math.sin(ph) * Math.sin(th),
        r * Math.cos(ph),
        r * Math.sin(ph) * Math.cos(th)
      );
      targetLook.set(0, 0, 0);
    } else {
      // 'track' chase mode
      const trackDist = Math.max(16, Math.min(65, vehH * 1.5 + (sim.speed || 0) * 0.015));
      const pitch = (sim.th || 0) - phi;
      targetCamPos.set(
        -Math.sin(pitch) * trackDist * 0.35,
        -Math.cos(pitch) * trackDist * 0.25 + 2.5,
        trackDist * 0.92
      );
      targetLook.set(0, 0, 0);
    }

    const sRate = Math.min(1.0, (dt || 0.016) * 6.0);
    this.camCurrentPos.lerp(targetCamPos, sRate);
    this.camCurrentLook.lerp(targetLook, sRate);

    this.pCam.position.copy(this.camCurrentPos);
    if (shakePower > 0.004) {
      this.pCam.position.x += (Math.random() - 0.5) * shakePower * 0.4;
      this.pCam.position.y += (Math.random() - 0.5) * shakePower * 0.4;
      this.pCam.position.z += (Math.random() - 0.5) * shakePower * 0.4;
    }
    this.pCam.lookAt(this.camCurrentLook);

    this._particles(sim, dt, toL, phi, cp, sp);

    this.pUni.uPx.value = this.pxPerM;

    if (this.renderPass) {
      this.renderPass.camera = this.pCam;
    }

    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.pCam);
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
          rotRateX: (Math.random() - 0.5) * 1.6,
          rotRateY: (Math.random() - 0.5) * 1.4,
          rotX: 0,
          rotY: 0
        };

        this.freeGroups.set(o.id, rec);
        this.scene.add(rec.group);

        const record = rec;

        if (o.type === 'payload' || o.payload) {
          const pMesh = buildPayloadMesh(o.payload || {});
          record.model = { root: pMesh, model: pMesh };
          record.group.add(pMesh);
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

      rec.group.visible = !o.dead;

      const rel = toL(
        (o.x || 0) - sim.x,
        (o.y || 0) - sim.y
      );

      rec.rotX += rec.rotRateX * dt;
      rec.rotY += rec.rotRateY * dt;

      rec.group.position.set(rel[0], rel[1], 0);
      rec.group.rotation.x = rec.rotX;
      rec.group.rotation.y = rec.rotY;
      rec.group.rotation.z = -((o.th || 0) - phi);
      rec.group.scale.set(1, 1, 1);

      if (rec.model?.model) {
        rec.model.model.position.y = o.com || 0;
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
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(1, 12, 8),
          new THREE.MeshBasicMaterial({
            color: 0xff8a3d,
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

    if (!rails && dt > 0 && dt < 0.2 && !sim.crashed) {
      for (const engine of engines) {
        if (
          !engine ||
          engine.alive === false ||
          engine.firing !== true
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
    this.pad.traverse(object => {
      if (object.isMesh) {
        object.geometry.dispose();
        object.material.dispose();
      }
    });
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