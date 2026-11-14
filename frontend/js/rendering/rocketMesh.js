import * as THREE from 'three';
import { assets } from './assets.js';
import { paintPart, tankLinks } from '../../ui/shared/partArt.js';

// ─── 2D Sprite helpers ──────────────────────────────────────────────────────

/**
 * Build a 2D sprite for a part by painting it on a canvas (same art used in
 * the Vehicle Builder UI).  Returns a THREE.Mesh (PlaneGeometry + canvas
 * texture) that sits in the XY plane and needs no 3D camera.
 */
function getPartSprite(part, vehicleParts) {
  const def = part.def;
  const scale = 128;
  const canvas = document.createElement('canvas');
  canvas.width  = Math.max(2, Math.ceil(def.diameter * scale));
  canvas.height = Math.max(2, Math.ceil(def.height   * scale));
  const ctx = canvas.getContext('2d');

  const layout = {
    items: vehicleParts.map(item => ({
      ...item,
      yTop:    item.y0,
      yBottom: item.y1,
    })),
  };
  const item = layout.items.find(e => e.uid === part.uid);

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

// ─── Payload sprite ──────────────────────────────────────────────────────────

/**
 * 2D canvas-drawn payload placeholder (satellite bus + solar wings).
 * Keeps things consistent with the flat orthographic view.
 */
export function buildPayloadMesh(payload = {}) {
  const summary  = payload?.summary || {};
  const w = Math.max(0.6, Math.min(2.8, Number(summary.width)  || 1.2));
  const h = Math.max(0.6, Math.min(3.2, Number(summary.height) || 1.3));

  const scale  = 128;
  const cW     = Math.max(2, Math.ceil(w * scale));
  const cH     = Math.max(2, Math.ceil(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width  = cW;
  canvas.height = cH;
  const ctx = canvas.getContext('2d');

  // Bus body
  const busW = cW * 0.55;
  const busH = cH * 0.60;
  const bx   = (cW - busW) / 2;
  const by   = (cH - busH) / 2;
  ctx.fillStyle = '#c99a3b';
  ctx.fillRect(bx, by, busW, busH);

  // Solar panels
  const panW = cW * 0.38;
  const panH = busH * 0.55;
  const py   = (cH - panH) / 2;
  ctx.fillStyle = '#1b2c52';
  ctx.fillRect(bx - panW - 2, py, panW, panH);
  ctx.fillRect(bx + busW + 2, py, panW, panH);

  // Dish stub
  ctx.beginPath();
  ctx.arc(cW / 2, by - 6, busW * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = '#9aa3b2';
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  const mat  = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  mat.userData.partArt = true;

  const geom = new THREE.PlaneGeometry(w, h);
  const mesh = new THREE.Mesh(geom, mat);
  return mesh;
}

// ─── Fairing shroud (2D) ─────────────────────────────────────────────────────

export function buildFairingShroud(p, vehicleParts = []) {
  const def = p.def;
  let spanH = def.height || 1.5;

  // Measure total height of children
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

  const scale = 128;
  const cW    = Math.max(2, Math.ceil(d * scale));
  const cH    = Math.max(2, Math.ceil(spanH * scale));
  const canvas = document.createElement('canvas');
  canvas.width  = cW;
  canvas.height = cH;
  const ctx = canvas.getContext('2d');

  // Ogive or conic nose shape
  ctx.beginPath();
  if (def.shape === 'ogive') {
    const steps = 32;
    ctx.moveTo(cW / 2, 0); // tip
    for (let i = 1; i <= steps; i++) {
      const t  = i / steps;
      const rx = (d / 2) * Math.sin(Math.PI / 2 * Math.pow(t, 0.62)) * scale;
      const ry = t * cH;
      ctx.lineTo(cW / 2 + rx, ry);
    }
    for (let i = steps; i >= 0; i--) {
      const t  = i / steps;
      const rx = (d / 2) * Math.sin(Math.PI / 2 * Math.pow(t, 0.62)) * scale;
      const ry = t * cH;
      ctx.lineTo(cW / 2 - rx, ry);
    }
  } else {
    // Conic
    ctx.moveTo(cW / 2, 0);
    ctx.lineTo(cW, cH);
    ctx.lineTo(0,  cH);
  }
  ctx.closePath();
  ctx.fillStyle = '#e9ecf1';
  ctx.fill();

  // Seam line
  ctx.strokeStyle = '#2b313c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cW / 2, 0);
  ctx.lineTo(cW / 2, cH);
  ctx.stroke();

  // Bottom ring
  ctx.fillStyle = '#2b313c';
  ctx.fillRect(0, cH - 6, cW, 6);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  mat.userData.partArt = true;
  mat.userData.isFairing = true;

  const g = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(d, spanH), mat);
  g.add(mesh);
  g.userData.spanH = spanH;
  return g;
}

// ─── Single part builder (pure 2D) ───────────────────────────────────────────

export async function buildPart(p, vehicleParts = []) {
  const def = p.def;

  if (def.category === 'fairing') {
    return buildFairingShroud(p, vehicleParts);
  }

  // 1. Try a registered GLB asset (if one exists for this part)
  //    We still support GLBs but fall through to the 2D sprite quickly.
  const glbMesh = await assets.part(def);

  const makeSingle = () => {
    if (glbMesh) return glbMesh;
    return getPartSprite(p, vehicleParts);
  };

  const g = new THREE.Group();

  if (p.side && p.dir) {
    const a = makeSingle();
    a.position.x = p.dir * p.x;
    a.position.z = 0.02;
    if (p.dir < 0 && a.scale) a.scale.x = -1;
    g.add(a);
  } else if (p.side) {
    const a = makeSingle();
    const b = a.clone(true);
    a.position.x  =  p.x; a.position.z = 0.02;
    b.position.x  = -p.x; b.position.z = 0.02;
    if (b.scale) b.scale.x = -1;
    g.add(a, b);
  } else {
    g.add(makeSingle());
  }

  return g;
}

// ─── Full vehicle assembler ───────────────────────────────────────────────────

export async function buildVehicle(parts, payload = null) {
  const root  = new THREE.Group();
  const model = new THREE.Group();
  const meshes = new Map();
  root.add(model);

  await Promise.all(parts.map(async p => {
    const m = await buildPart(p, parts);

    if (p.def?.category === 'fairing') {
      const spanH = m.userData.spanH || (p.def.height || 1.5);
      m.position.y = -p.y0 - spanH / 2;
    } else {
      m.position.y = -(p.y0 + p.y1) / 2;
    }

    model.add(m);
    meshes.set(p.uid, m);
  }));

  if (payload?.parts?.length) {
    const payloadGroup = buildPayloadMesh(payload);
    const nonFairing   = parts.filter(p => !p.detached && p.def?.category !== 'fairing');
    const minY         = nonFairing.length ? Math.min(...nonFairing.map(p => Number(p.y0) || 0)) : 0;
    const pHgt         = Math.max(0.6, Math.min(3.2, Number(payload.summary?.height) || 1.3));
    payloadGroup.position.set(0, -minY + pHgt / 2, 0.01);
    model.add(payloadGroup);
    meshes.set('payload', payloadGroup);
  }

  return { root, model, meshes };
}

// Keep MATS exported so any other file that imports it won't crash,
// but we no longer use it for rendering.
export const MATS = {};
