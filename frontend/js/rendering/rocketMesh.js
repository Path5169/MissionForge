
export function buildFairingShroud(p, vehicleParts = []) {
  const def = p.def;
  let spanH = def.height || 1.5;
  const childParts = vehicleParts.filter(q => q.parent === p.uid && q.mount === 'below');
  if (childParts.length) {
    let curr = childParts[0];
    let hAcc = 0;
    while (curr) {
      hAcc += Math.max(0.4, (Number(curr.y1) - Number(curr.y0)) || (Number(curr.def?.height) || 1.0));
      const next = vehicleParts.find(q => q.parent === curr.uid && q.mount === 'below');
      if (!next || next.def?.separator) break;
      curr = next;
    }
    if (hAcc > 0.5) spanH = hAcc + 0.2;
  }

  const d = Math.max(def.diameter || 1.2, 1.2);
  const r = (d / 2) * 1.08;
  const g = new THREE.Group();

  if (def.shape === 'ogive') {
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      pts.push([r * Math.sin(Math.PI / 2 * Math.pow(t, 0.62)), spanH / 2 - t * spanH]);
    }
    g.add(lathe(pts, MATS.paint));
    g.add(ring(r * 1.01, -spanH / 2 + 0.08, 0.04, MATS.graphite));
  } else {
    const topR = r * 0.98;
    const pts = [
      [topR, spanH / 2],
      [r, -spanH / 2 + 0.08],
      [r * 0.98, -spanH / 2]
    ];
    g.add(lathe(pts, MATS.paint));
    g.add(ring(r * 1.01, -spanH / 2 + 0.06, 0.04, MATS.graphite));
    g.add(ring(topR * 1.01, spanH / 2 - 0.04, 0.03, MATS.amber));
  }

  g.add(box(0.015, spanH * 0.98, r * 2.02, MATS.graphite, 0, 0, 0));
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.isFairing = true; } });
  g.userData.spanH = spanH;
  return g;
}

import * as THREE from 'three';
import { assets } from './assets.js';
import { paintPart, tankLinks } from '../../ui/shared/partArt.js';

function getPartSprite(part, vehicleParts) {
  const def = part.def;
  if (!assets.partSrc(def)) return null;
  const scale = 128;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.ceil(def.diameter * scale));
  canvas.height = Math.max(2, Math.ceil(def.height * scale));
  const ctx = canvas.getContext('2d');
  const layout = {
    items: vehicleParts.map(item => ({
      ...item,
      yTop: item.y0,
      yBottom: item.y1,
    })),
  };
  const item = layout.items.find(entry => entry.uid === part.uid);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    paintPart(ctx, def, {
      x: canvas.width / 2,
      y: 0,
      S: scale,
      dir: part.dir || 1,
      ...tankLinks(layout, item),
      onload: draw,
    });
    tex.needsUpdate = true;
  };
  draw();
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  mat.userData.partArt = true;
  const geom = new THREE.PlaneGeometry(def.diameter, def.height);
  return new THREE.Mesh(geom, mat);
}

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .55, metalness: .2, ...o });
export const MATS = {
  paint: mat(0xe9ecf1, { roughness: .5, metalness: .12 }), graphite: mat(0x2b313c, { roughness: .45, metalness: .55 }), black: mat(0x0f1218, { roughness: .6, metalness: .1 }),
  copper: mat(0xb8743f, { roughness: .32, metalness: .85, side: THREE.DoubleSide }), amber: mat(0xffb02e, { roughness: .5, metalness: .2, emissive: 0x3a2400 }),
  gold: mat(0xc99a3b, { roughness: .28, metalness: .9 }), steel: mat(0x9aa3b2, { roughness: .4, metalness: .7 }), panel: mat(0x1b2c52, { roughness: .35, metalness: .5 }),
  window: mat(0x52d6ea, { emissive: 0x52d6ea, emissiveIntensity: 1.1, roughness: .2 }), red: mat(0xc7442f, { roughness: .55 }),
};
const lathe = (pts, m, seg = 32) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), m);
const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); return b; };
const ring = (r, y, hh, m) => lathe([[r, y - hh], [r * 1.008, y - hh], [r * 1.008, y + hh], [r, y + hh]], m);
function bell(r0, r1, ytop, hgt, m, n = 10) { const pts = []; for (let i = 0; i <= n; i++) { const t = i / n; pts.push([r0 + (r1 - r0) * Math.pow(t, .55), ytop - t * hgt]); } return lathe(pts, m, 28); }

const SHAPES = {
  cylinder(d, h) {
    const r = d / 2, g = new THREE.Group();
    g.add(lathe([[r * .96, -h / 2], [r, -h / 2 + .07], [r, h / 2 - .07], [r * .96, h / 2]], MATS.paint)); g.add(ring(r, h * .3, .05, MATS.graphite), ring(r, -h * .3, .05, MATS.graphite), ring(r, h * .02, h * .07, MATS.black)); return g;
  },
  core(d, h) {
    const r = d / 2, g = new THREE.Group(); g.add(lathe([[r * .9, -h / 2], [r, -h / 2 + .08], [r, h / 2 - .08], [r * .9, h / 2]], MATS.graphite)); g.add(ring(r, h * .32, .04, MATS.steel));
    g.add(box(d * .34, h * .2, .08, MATS.window, 0, h * .06, r * .985)); return g;
  },
  ogive(d, h) {
    const r = d / 2, g = new THREE.Group(), pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push([r * Math.sin(Math.PI / 2 * Math.pow(t, .62)), h / 2 - t * h * .86]); }
    g.add(lathe(pts, MATS.paint)); g.add(lathe([[r, -h / 2 + h * .14], [r * 1.004, -h / 2 + h * .14], [r * 1.004, -h / 2], [r, -h / 2]], MATS.black)); g.add(ring(r * 1.01, -h / 2 + h * .13, h * .018, MATS.graphite)); g.add(box(.018, h * .76, .012, MATS.graphite, 0, h * .03, r * 1.006)); return g;
  },
  satellite(d, h) {
    const r = d / 2 * .8, g = new THREE.Group(); g.add(lathe([[r, -h / 2], [r, h / 2]], MATS.gold)); g.add(box(.9, .02, .5, MATS.panel, r + .5, 0, 0), box(.9, .02, .5, MATS.panel, -r - .5, 0, 0));
    g.add(lathe([[0, h / 2], [r * .5, h / 2 + .18]], MATS.steel)); return g;
  },
  taper(d, h, def) { return lathe([[(def.shapeTopD ?? def.topD ?? 0) / 2, h / 2], [def.bottomD / 2, -h / 2]], MATS.steel); },
  ring(d, h) { const r = d / 2, g = new THREE.Group(); g.add(lathe([[r, -h / 2], [r * 1.03, -h / 2], [r * 1.03, h / 2], [r, h / 2]], MATS.amber)); g.add(ring(r * 1.03, 0, .012, MATS.black)); return g; },
  nozzle(d, h) { const r = d / 2, g = new THREE.Group(); g.add(lathe([[r * .5, h / 2], [r * .5, h * .12]], MATS.graphite)); g.add(bell(r * .2, r * .78, h * .12, h * .62, MATS.copper)); return g; },
  nozzle_long(d, h) { const r = d / 2, g = new THREE.Group(); g.add(lathe([[r * .5, h / 2], [r * .5, h * .3]], MATS.graphite)); g.add(bell(r * .16, r * .92, h * .3, h * .8, MATS.copper)); return g; },
  cluster(d, h) {
    const r = d / 2, g = new THREE.Group(); g.add(lathe([[r * .96, h / 2], [r * .96, h * .3]], MATS.graphite));
    for (const [x, z] of [[-.55, 0], [.28, .45], [.28, -.45]]) { const b = bell(r * .12, r * .42, h * .3, h * .7, MATS.copper); b.position.set(x * r, 0, z * r); g.add(b); } return g;
  },
  srb(d, h) {
    const r = d / 2, g = new THREE.Group(); g.add(lathe([[r, -h / 2 + .5], [r, h / 2 - h * .2]], MATS.paint)); g.add(ring(r, h * .1, .05, MATS.red));
    const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([r * Math.sin(Math.PI / 2 * Math.pow(t, .7)), h / 2 - t * h * .2]); } g.add(lathe(pts, MATS.red));
    g.add(bell(r * .3, r * .72, -h / 2 + .5, .5, MATS.graphite)); return g;
  },
  clamp(d, h) {
    const g = new THREE.Group(); g.add(box(d, h, d * 1.6, MATS.graphite)); g.add(box(d * 1.04, h * .22, d * 1.66, MATS.amber, 0, h * .18, 0)); g.add(box(d * 1.06, h * .08, d * 1.7, MATS.black, 0, -h * .3, 0)); return g;
  },
  legs(d, h, def) {
    const g = new THREE.Group(), drop = def.landing?.drop || 0, top = h / 2, bot = -h / 2 - drop, ax = -d / 2 - .03, fx = .55, len = Math.hypot(fx - ax, top - bot), ang = Math.atan2(fx - ax, top - bot);
    const strut = box(.06, len, .06, MATS.steel, (ax + fx) / 2, (top + bot) / 2, 0); strut.rotation.z = -ang; g.add(strut);
    g.add(box(.5, .05, .5, MATS.graphite, fx, bot, 0), box(.16, .16, .16, MATS.graphite, ax, top - .05, 0)); return g;
  },
};

export async function buildPart(p, vehicleParts = []) {
  const def = p.def;
  if (def.category === 'fairing') {
    return buildFairingShroud(p, vehicleParts);
  }
  const single = async () => (await assets.part(def)) || (SHAPES[def.shape] || SHAPES.cylinder)(def.diameter, def.height, def) || getPartSprite(p, vehicleParts);
  const g = new THREE.Group();
  if (p.side && p.dir) { const a = await single(); a.position.x = p.dir * p.x; a.position.z = 0.02; if (p.dir < 0) a.scale.x = -1; g.add(a); }
  else if (p.side) { const a = await single(), b = a.clone(true); a.position.x = p.x; a.position.z = 0.02; b.scale.x = -1; b.position.x = -p.x; b.position.z = 0.02; g.add(a, b); } else g.add(await single());
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function buildPayloadMesh(payload = {}) {
  const g = new THREE.Group();
  const summary = payload?.summary || {};
  const w = Math.max(0.6, Math.min(2.8, Number(summary.width) || 1.2));
  const h = Math.max(0.6, Math.min(3.2, Number(summary.height) || 1.3));

  const busW = w * 0.65;
  const busH = h * 0.6;
  const bus = box(busW, busH, busW * 0.8, MATS.gold, 0, 0, 0);
  g.add(bus);

  const wingW = Math.max(0.7, w * 0.85);
  const wingH = busH * 0.65;
  const leftWing = box(wingW, wingH, 0.02, MATS.panel, -busW / 2 - wingW / 2, 0, 0);
  const rightWing = box(wingW, wingH, 0.02, MATS.panel, busW / 2 + wingW / 2, 0, 0);
  g.add(leftWing, rightWing);

  const dish = bell(0.08, busW * 0.42, busH / 2 + 0.3, 0.3, MATS.steel);
  dish.position.set(0, busH / 2 + 0.05, 0);
  g.add(dish);

  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export async function buildVehicle(parts, payload = null) {
  const root = new THREE.Group(), model = new THREE.Group(), meshes = new Map(); root.add(model);
  await Promise.all(parts.map(async p => { const m = await buildPart(p, parts); if (p.def?.category === 'fairing') {
      const spanH = m.userData.spanH || (p.def.height || 1.5);
      m.position.y = -p.y0 - spanH / 2;
    } else {
      m.position.y = -(p.y0 + p.y1) / 2;
    } model.add(m); meshes.set(p.uid, m); }));
  
  if (payload && payload.parts && payload.parts.length) {
    const payloadGroup = buildPayloadMesh(payload);
    const nonFairing = parts.filter(p => !p.detached && p.def?.category !== 'fairing');
    const minY = nonFairing.length ? Math.min(...nonFairing.map(p => Number(p.y0) || 0)) : 0;
    const pHgt = Math.max(0.6, Math.min(3.2, Number(payload.summary?.height) || 1.3));
    payloadGroup.position.set(0, -minY + pHgt / 2, 0.01);
    model.add(payloadGroup);
    meshes.set('payload', payloadGroup);
  }

  return { root, model, meshes };
}
