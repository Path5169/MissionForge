import * as THREE from 'three';
import { assets } from './assets.js';
import { paintPart, tankLinks } from '../../ui/shared/partArt.js';

// ─── 2D Sprite helpers ──────────────────────────────────────────────────────

/**
 * Build a 2D sprite for a part by painting it on a canvas (same art used in
 * the Vehicle Builder UI). Returns a THREE.Mesh (PlaneGeometry + canvas
 * texture) in the XY plane.
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
  const mesh = new THREE.Mesh(geom, mat);
  mesh.renderOrder = 2;
  return mesh;
}

// ─── Payload sprite (Detailed Aerospace Satellite) ──────────────────────────

/**
 * 2D canvas-drawn payload spacecraft (gold foil bus + dual solar array wings + dish).
 * Visually detailed, crisp, and properly scaled for the 2D orthographic flight view.
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

  // Bus geometry
  const busW = cW * 0.48;
  const busH = cH * 0.52;
  const bx   = (cW - busW) / 2;
  const by   = cH * 0.38;

  // 1. Payload adapter ring at base
  ctx.fillStyle = '#64748b';
  ctx.fillRect(bx + busW * 0.22, by + busH, busW * 0.56, Math.max(4, cH * 0.08));
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + busW * 0.22, by + busH, busW * 0.56, Math.max(4, cH * 0.08));

  // 2. Dual deployed solar arrays (left and right wings)
  const panW = cW * 0.36;
  const panH = busH * 0.52;
  const py   = by + (busH - panH) / 2;

  // Structural hinge struts
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bx - 2, py + panH / 2);
  ctx.lineTo(bx - panW, py + panH / 2);
  ctx.moveTo(bx + busW + 2, py + panH / 2);
  ctx.lineTo(bx + busW + panW, py + panH / 2);
  ctx.stroke();

  // Left array panel
  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(bx - panW - 3, py, panW, panH);
  ctx.strokeStyle = '#60a5fa';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx - panW - 3, py, panW, panH);

  // Right array panel
  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(bx + busW + 3, py, panW, panH);
  ctx.strokeStyle = '#60a5fa';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx + busW + 3, py, panW, panH);

  // Photovoltaic cell grid lines
  ctx.strokeStyle = 'rgba(147, 197, 253, 0.45)';
  ctx.lineWidth = 1;
  const segs = 3;
  for (let s = 1; s < segs; s++) {
    const lx = bx - panW - 3 + (panW * s) / segs;
    ctx.beginPath(); ctx.moveTo(lx, py + 1); ctx.lineTo(lx, py + panH - 1); ctx.stroke();
    const rx = bx + busW + 3 + (panW * s) / segs;
    ctx.beginPath(); ctx.moveTo(rx, py + 1); ctx.lineTo(rx, py + panH - 1); ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(bx - panW - 3, py + panH / 2); ctx.lineTo(bx - 3, py + panH / 2);
  ctx.moveTo(bx + busW + 3, py + panH / 2); ctx.lineTo(bx + busW + panW + 3, py + panH / 2);
  ctx.stroke();

  // 3. Golden Multi-Layer Insulation (MLI) Satellite Bus
  const goldGrad = ctx.createLinearGradient(bx, 0, bx + busW, 0);
  goldGrad.addColorStop(0, '#b45309');
  goldGrad.addColorStop(0.2, '#f59e0b');
  goldGrad.addColorStop(0.5, '#fbbf24');
  goldGrad.addColorStop(0.8, '#d97706');
  goldGrad.addColorStop(1, '#92400e');
  ctx.fillStyle = goldGrad;
  ctx.fillRect(bx, by, busW, busH);
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx, by, busW, busH);

  // Foil quilting stitch lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 1;
  for (let y = by + 6; y < by + busH; y += 8) {
    ctx.beginPath(); ctx.moveTo(bx + 2, y); ctx.lineTo(bx + busW - 2, y); ctx.stroke();
  }

  // 4. Parabolic dish antenna on top
  ctx.fillStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.ellipse(cW / 2, by - 6, busW * 0.38, Math.max(3, busW * 0.16), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Feed horn antenna tripod
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.arc(cW / 2, by - 12, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cW / 2 - 8, by - 6); ctx.lineTo(cW / 2, by - 12);
  ctx.moveTo(cW / 2 + 8, by - 6); ctx.lineTo(cW / 2, by - 12);
  ctx.stroke();

  // 5. Optical instrument aperture / Earth sensor lens
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(bx + busW * 0.35, by + busH * 0.32, busW * 0.3, busH * 0.24);
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + busW * 0.35, by + busH * 0.32, busW * 0.3, busH * 0.24);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  mat.userData.partArt = true;

  const geom = new THREE.PlaneGeometry(w, h);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.renderOrder = 3;
  return mesh;
}

// ─── Fairing shroud (2D Ogive Composite Enclosure) ───────────────────────────

export function buildFairingShroud(p, vehicleParts = [], payload = null) {
  const def = p.def;
  let spanH = def.height || 1.8;

  // Measure total height of children attached below this fairing
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
    if (hAcc > 0.5) spanH = hAcc + 0.3;
  }

  // Ensure the fairing is tall enough to comfortably house the payload
  const pHgt = Math.max(0.6, Math.min(3.2, Number(payload?.summary?.height) || 1.3));
  if (payload) {
    spanH = Math.max(spanH, pHgt + 0.6);
  }

  const d = Math.max(def.diameter || 1.2, 1.2);

  const scale = 128;
  const cW    = Math.max(2, Math.ceil(d * scale));
  const cH    = Math.max(2, Math.ceil(spanH * scale));
  const canvas = document.createElement('canvas');
  canvas.width  = cW;
  canvas.height = cH;
  const ctx = canvas.getContext('2d');

  ctx.save();
  const apex = 6;
  const base = cH - 4;
  const midX = cW / 2;
  const halfD = (cW * 0.94) / 2;

  // Smooth aerodynamic ogive contour
  ctx.beginPath();
  const steps = 36;
  ctx.moveTo(midX, apex);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const rx = halfD * Math.sin(Math.PI / 2 * Math.pow(t, 0.64));
    const ry = apex + t * (base - apex);
    ctx.lineTo(midX + rx, ry);
  }
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    const rx = halfD * Math.sin(Math.PI / 2 * Math.pow(t, 0.64));
    const ry = apex + t * (base - apex);
    ctx.lineTo(midX - rx, ry);
  }
  ctx.closePath();

  // Aerospace composite shell gradient
  const grad = ctx.createLinearGradient(midX - halfD, 0, midX + halfD, 0);
  grad.addColorStop(0, '#94a3b8');
  grad.addColorStop(0.18, '#cbd5e1');
  grad.addColorStop(0.45, '#f8fafc');
  grad.addColorStop(0.72, '#f1f5f9');
  grad.addColorStop(0.92, '#94a3b8');
  grad.addColorStop(1, '#64748b');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Vertical split seam line down center
  ctx.strokeStyle = 'rgba(51, 65, 85, 0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(midX, apex);
  ctx.lineTo(midX, base);
  ctx.stroke();

  // Separation bolts along seam
  ctx.fillStyle = '#475569';
  for (let y = apex + 24; y < base - 10; y += 22) {
    ctx.fillRect(midX - 2, y, 4, 3);
  }

  // Base golden/amber separation ring
  const ringH = Math.max(6, Math.min(14, cH * 0.05));
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(midX - halfD, base - ringH, halfD * 2, ringH);
  ctx.strokeStyle = '#b45309';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(midX - halfD, base - ringH, halfD * 2, ringH);

  ctx.restore();

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
  mesh.renderOrder = 4;
  g.add(mesh);
  g.userData.spanH = spanH;
  return g;
}

// ─── Single part builder (pure 2D) ───────────────────────────────────────────

export async function buildPart(p, vehicleParts = [], payload = null) {
  const def = p.def;

  if (def.category === 'fairing') {
    return buildFairingShroud(p, vehicleParts, payload);
  }

  // 1. Try a registered GLB asset (if one exists for this part)
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
    const m = await buildPart(p, parts, payload);

    if (p.def?.category === 'fairing') {
      const spanH = m.userData.spanH || (p.def.height || 1.8);
      // Fairing base sits at attachment point -p.y0, extending UPWARDS by spanH
      m.position.y = -p.y0 + spanH / 2;
    } else {
      m.position.y = -(p.y0 + p.y1) / 2;
    }

    model.add(m);
    meshes.set(p.uid, m);
  }));

  const hasPayload = payload && (payload.parts?.length || payload.name || payload.summary);
  if (hasPayload) {
    const payloadGroup = buildPayloadMesh(payload);
    const nonFairing   = parts.filter(p => !p.detached && p.def?.category !== 'fairing');
    const minY         = nonFairing.length ? Math.min(...nonFairing.map(p => Number(p.y0) || 0)) : 0;
    const pHgt         = Math.max(0.6, Math.min(3.2, Number(payload.summary?.height) || 1.3));
    // Payload base sits directly atop the rocket at -minY, extending UPWARDS by pHgt
    payloadGroup.position.set(0, -minY + pHgt / 2, 0.005);
    model.add(payloadGroup);
    meshes.set('payload', payloadGroup);
  }

  return { root, model, meshes };
}

// Keep MATS exported so any other file that imports it won't crash
export const MATS = {};
