// crazy ass cinematic view uggh i am in love with it 
import * as THREE from 'three';
import { api } from '../core/api.js';

const EARTH_VERT = `varying vec3 vN; varying vec3 vP; void main(){ vP = position; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const EARTH_FRAG = `precision highp float; varying vec3 vN; varying vec3 vP; uniform vec3 uSun; uniform float uTime;
float h3(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f); return mix(mix(mix(h3(i), h3(i+vec3(1,0,0)), f.x), mix(h3(i+vec3(0,1,0)), h3(i+vec3(1,1,0)), f.x), f.y), mix(mix(h3(i+vec3(0,0,1)), h3(i+vec3(1,0,1)), f.x), mix(h3(i+vec3(0,1,1)), h3(i+vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float a = .5, s = 0.; for (int i = 0; i < 6; i++){ s += a * n3(p); p = p * 2.03 + 11.7; a *= .5; } return s; }
void main(){
  vec3 p = normalize(vP); float c = cos(uTime * .012), s = sin(uTime * .012); p = vec3(c*p.x + s*p.z, p.y, -s*p.x + c*p.z);
  float elev = fbm(p * 2.4 + 3.0), land = smoothstep(.52, .56, elev);
  vec3 ocean = mix(vec3(.01, .05, .16), vec3(.03, .16, .34), smoothstep(.3, .52, elev));
  float lat = abs(p.y), dry = fbm(p * 5.0 + 9.0);
  vec3 ground = mix(mix(vec3(.10, .24, .08), vec3(.42, .36, .2), smoothstep(.45, .7, dry)), vec3(.5, .45, .35), smoothstep(.16, .4, 1. - lat) * .0);
  ground = mix(ground, vec3(.16, .3, .1), smoothstep(.5, .3, dry) * (1. - lat));
  vec3 surf = mix(ocean, ground, land); surf = mix(surf, vec3(.78, .82, .88), smoothstep(.86, .95, lat + (elev - .5) * .2));
  float cl = smoothstep(.5, .74, fbm(p * 4.6 + vec3(uTime * .01, 0., 3.)));
  vec3 n = normalize(vN); float ndl = dot(n, normalize(uSun)), day = smoothstep(-.06, .22, ndl);
  vec3 lit = mix(surf, vec3(.8, .84, .9), cl * .62) * (.015 + day * 1.25);
  float city = step(.78, n3(p * 60.)) * land * smoothstep(.45, .6, fbm(p * 8.)) * (1. - day);
  vec3 spec = vec3(1., .92, .8) * pow(max(dot(reflect(-normalize(uSun), n), vec3(0, 0, 1)), 0.), 40.) * (1. - land) * (1. - cl) * day * .8;
  float fres = pow(1. - max(n.z, 0.), 3.); vec3 col = lit + spec + city * vec3(1., .66, .28) * .9 + vec3(.25, .5, 1.) * fres * (.1 + .9 * smoothstep(-.3, .3, ndl)) * .8;
  gl_FragColor = vec4(col, 1.);
#include <colorspace_fragment>
}`;
const ATMO_FRAG = `precision highp float; varying vec3 vN; uniform vec3 uSun; void main(){ float i = pow(max(0., .72 - dot(vN, vec3(0,0,1))), 2.6); float d = smoothstep(-.35, .35, dot(normalize(vN), normalize(uSun)) ); gl_FragColor = vec4(vec3(.28, .52, 1.) * i * (.15 + .95 * d) * 2.2, 1.);
#include <colorspace_fragment>
}`;
const ATMO_VERT = `varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export class MenuScene {
  constructor(canvas, labelRoot, { reduceMotion = false, quality = 'high' } = {}) {
    this.canvas = canvas; this.labelRoot = labelRoot; this.reduce = reduceMotion; this.running = false; this.frameId = null; this.disposed = false;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true }); this.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene(); this.cam = new THREE.PerspectiveCamera(36, 1, 1, 600); this.cam.position.set(0, 0, 33);
    this.quality = null; this.setQuality(quality);
    this.sun = new THREE.Vector3(-.55, .42, .72).normalize(); this.uni = { uSun: { value: this.sun.clone() }, uTime: { value: 0 } };
    this.earthC = new THREE.Vector3(9.5, -13.4, 0);
    const detail = quality === 'high' ? [128, 96] : [72, 54];
    const earth = new THREE.Mesh(new THREE.SphereGeometry(10, detail[0], detail[1]), new THREE.ShaderMaterial({ vertexShader: EARTH_VERT, fragmentShader: EARTH_FRAG, uniforms: this.uni })); earth.position.copy(this.earthC);
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(10.55, Math.ceil(detail[0] * .6), Math.ceil(detail[1] * .6)), new THREE.ShaderMaterial({ vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG, uniforms: this.uni, side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })); atmo.position.copy(this.earthC);
    this.scene.add(earth, atmo);
    const N = quality === 'high' ? 1800 : 900, pos = new Float32Array(N * 3), col = new Float32Array(N * 3); for (let i = 0; i < N; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(300), b = .25 + Math.pow(Math.random(), 3) * .75; pos.set([v.x, v.y, v.z], i * 3); col.set([b, b * (.88 + Math.random() * .2), b * (.8 + Math.random() * .3)], i * 3); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.5, sizeAttenuation: false, vertexColors: true, transparent: true })); this.scene.add(this.stars);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(1.7, 48, 32), new THREE.MeshStandardMaterial({ color: 0x9a978f, roughness: 1 })); moon.position.set(-23, 10, -70); this.scene.add(moon);
    const dl = new THREE.DirectionalLight(0xfff2de, 3); dl.position.copy(this.sun).multiplyScalar(50); this.scene.add(dl, new THREE.AmbientLight(0x202a40, .6));
    // real orbit, scene units: mu = 1, Earth radius 10
    this.rp = 11.4; this.ra = 17.2; const a = (this.rp + this.ra) / 2, w = 4.95; this.mu = 1;
    const vp = Math.sqrt(this.mu * (2 / this.rp - 1 / a)); this.state = { x: this.rp * Math.cos(w), y: this.rp * Math.sin(w), vx: vp * Math.sin(w), vy: -vp * Math.cos(w) };
    this.el = null; this.orbit = null; this.orbitRequest = null; this.orbitStep = 0;
    this.initializeOrbit();
    const g = document.createElement('canvas'); g.width = g.height = 64; const x = g.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    this.craft = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(g), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); this.craft.scale.setScalar(2.6); this.scene.add(this.craft);
    const tri = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, .5), new THREE.Vector2(.28, -.36), new THREE.Vector2(-.28, -.36)])), new THREE.MeshBasicMaterial({ color: 0xffffff })); this.tri = tri; this.scene.add(tri);
    this.lApo = this.label(); this.lPer = this.label(); this.lNow = this.label(); this.mouse = { x: 0, y: 0 }; this.t = 0;
    this.onMouseMove = e => { this.mouse.x = e.clientX / innerWidth - .5; this.mouse.y = e.clientY / innerHeight - .5; };
    window.addEventListener('mousemove', this.onMouseMove, { passive: true });
    this.resize();
  }
  label() { const e = document.createElement('div'); e.className = 'olabel'; this.labelRoot.append(e); return e; }
  async initializeOrbit() {
    try {
      const state = { mu: this.mu, ...this.state };
      this.el = await api.orbitElements(state);
      const { points } = await api.orbitConic(this.el, 300);
      if (this.disposed) return;
      const pts = points.map(([x, y]) => new THREE.Vector3(x + this.earthC.x, y + this.earthC.y, 0));
      this.orbit = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xe264c8, transparent: true, opacity: .95 }));
      this.scene.add(this.orbit);
      for (const [dx, dy] of [[.035, 0], [-.035, 0], [0, .035], [0, -.035]]) {
        const line = this.orbit.clone();
        line.position.set(dx, dy, 0);
        line.material = new THREE.LineBasicMaterial({ color: 0xe264c8, transparent: true, opacity: .45 });
        this.scene.add(line);
      }
    } catch (error) {
      console.error('Could not load menu orbit from the simulation service.', error);
    }
  }
  resize() { const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight; this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
  setQuality(quality) {
    if (this.quality === quality) return;
    this.quality = quality;
    const ratio = quality === 'low' ? Math.min(window.devicePixelRatio || 1, .8) : Math.min(window.devicePixelRatio || 1, 2);
    this.r.setPixelRatio(ratio);
    this.resize();
  }
  start() { if (this.running) return; this.running = true; this.last = performance.now(); const loop = t => { if (!this.running) return; this.frameId = requestAnimationFrame(loop); this.tick(Math.min(.1, (t - this.last) / 1000)); this.last = t; }; this.frameId = requestAnimationFrame(loop); }
  stop() { this.running = false; if (this.frameId !== null) cancelAnimationFrame(this.frameId); this.frameId = null; }
  place(el, v, html) { const p = v.clone().project(this.cam), w = this.canvas.clientWidth, h = this.canvas.clientHeight; el.style.left = ((p.x + 1) / 2 * w) + 'px'; el.style.top = ((1 - p.y) / 2 * h) + 'px'; if (el.dataset.flightLabel !== html) { el.innerHTML = html; el.dataset.flightLabel = html; } el.style.display = p.z < 1 && p.x > -.96 && p.x < .96 && p.y > -.9 && p.y < .96 ? '' : 'none'; }
  tick(dt) {
    if (!this.reduce) this.t += dt; this.uni.uTime.value = this.t; const s = this.state;
    if (!this.reduce && this.el && !this.orbitRequest) {
      this.orbitStep += dt * 5;
      if (this.orbitStep >= .5) {
        const elapsed = this.orbitStep;
        this.orbitStep = 0;
        this.orbitRequest = api.orbitPropagate({ mu: this.mu, ...s, dt: elapsed })
          .then(next => Object.assign(s, next))
          .catch(error => console.error('Could not advance menu orbit through the simulation service.', error))
          .finally(() => { this.orbitRequest = null; });
      }
    }
    if (!this.reduce) { this.cam.position.x = -this.mouse.x * 1.6 + Math.sin(this.t * .05) * .6; this.cam.position.y = this.mouse.y * -.9; this.cam.lookAt(0, -.5, 0); this.stars.rotation.z = this.t * .0012; }
    const P = new THREE.Vector3(s.x + this.earthC.x, s.y + this.earthC.y, 0); this.craft.position.copy(P); this.tri.position.copy(P); this.tri.rotation.z = Math.atan2(s.vy, s.vx) - Math.PI / 2; this.tri.scale.setScalar(1.15);
    const el = this.el;
    if (el) {
      const KM = 6371 / 10, VS = 7.905 / Math.sqrt(1 / 10), W = (a) => new THREE.Vector3(a * Math.cos(el.w) + this.earthC.x, a * Math.sin(el.w) + this.earthC.y, 0);
      const r = Math.hypot(s.x, s.y), v = Math.hypot(s.vx, s.vy);
      this.place(this.lPer, W(el.rp), `Periapsis ${Math.round((el.rp - 10) * KM).toLocaleString('en')} km`); this.place(this.lApo, W(-el.ra), `Apoapsis ${Math.round((el.ra - 10) * KM).toLocaleString('en')} km`);
      this.place(this.lNow, P, `<small>${Math.round((r - 10) * KM).toLocaleString('en')} km · ${(v * VS).toFixed(2)} km/s</small>`);
    }
    this.r.render(this.scene, this.cam);
  }
  dispose() { this.disposed = true; this.stop(); window.removeEventListener('mousemove', this.onMouseMove); for (const label of [this.lApo, this.lPer, this.lNow]) label.remove(); this.scene.traverse(object => { if (object.isMesh || object.isPoints || object.isLine || object.isSprite) { object.geometry?.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; for (const material of materials) { material?.map?.dispose(); material?.dispose(); } } }); this.r.dispose(); this.r.forceContextLoss(); }
}
