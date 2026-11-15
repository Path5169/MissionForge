import * as THREE from 'three';
import { assets } from './assets.js';
import { paintPart, tankLinks } from '../../ui/shared/partArt.js';

// ─── Classification helpers ──────────────────────────────────────────────────

export function isFairingPart(p) {
  const def = p?.def || p;
  if (!def) return false;
  const cat = (def.category || '').toLowerCase();
  const id  = (def.id || def.partId || '').toLowerCase();
  const shape = (def.shape || '').toLowerCase();
  return cat === 'fairing' || id.includes('fairing') || (cat === 'aero' && (id.includes('fairing') || shape === 'ogive'));
}

export function isPayloadPart(p) {
  const def = p?.def || p;
  if (!def) return false;
  const cat = (def.category || '').toLowerCase();
  const id  = (def.id || def.partId || '').toLowerCase();
  const shape = (def.shape || '').toLowerCase();
  return def.payload != null || def.rover === true || cat === 'utility' || cat === 'payload' || cat === 'rover' || shape === 'satellite' || id.includes('payload') || id.includes('sat') || id.includes('rover');
}

export function isRoverPayload(summary) {
  if (!summary) return false;
  if (summary.rover || summary.type === 'rover' || summary.category === 'rover') return true;
  const name = String(summary.name || summary.id || summary.title || '').toLowerCase();
  const desc = String(summary.description || '').toLowerCase();
  return name.includes('rover') || desc.includes('rover') || name.includes('perseverance') || name.includes('curiosity');
}

// ─── 2D Sprite helpers ──────────────────────────────────────────────────────

/**
 * Build a 2D sprite for a standard rocket part using the partArt painter.
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

function paintRoverCanvas(ctx, cW, cH, summary, deployed, prog, throttle = 0, rotInput = 0, time = 0) {
  ctx.save();
  const midX = cW / 2;
  const bodyW = Math.round(cW * (deployed ? 0.52 : 0.64));
  const bodyH = Math.round(cH * 0.30);
  const bx = Math.round(midX - bodyW / 2);
  const by = Math.round(cH * 0.38);

  const pSusp = deployed ? Math.min(1.0, prog * 1.4) : 0.0;
  const pMast = deployed ? Math.max(0.0, Math.min(1.0, (prog - 0.22) * 1.5)) : 0.0;
  const pArm  = deployed ? Math.max(0.0, Math.min(1.0, (prog - 0.45) * 1.8)) : 0.0;

  // 1. Rocker-Bogie Mobility Suspension & 6 All-Terrain Wheels
  const wheelR = Math.max(8, Math.round(cW * 0.048));
  const wheelDrop = Math.round(cH * 0.24 * (0.22 + 0.78 * pSusp));
  const wheelY = by + bodyH + wheelDrop;

  const wheelSpans = [
    { x: bx - Math.round(bodyW * 0.06), role: 'rear', steer: true },
    { x: midX - Math.round(bodyW * 0.02), role: 'mid', steer: false },
    { x: bx + bodyW + Math.round(bodyW * 0.06), role: 'front', steer: true },
  ];

  const pivotX = midX;
  const pivotY = by + Math.round(bodyH * 0.55);
  const bogiePivotX = bx + Math.round(bodyW * 0.28);
  const bogiePivotY = by + bodyH + Math.round(wheelDrop * 0.45);

  ctx.strokeStyle = '#475569';
  ctx.lineWidth = Math.max(2, Math.round(cW * 0.012));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(pivotX, pivotY);
  ctx.lineTo(bx + bodyW + Math.round(bodyW * 0.06), wheelY);
  ctx.moveTo(pivotX, pivotY);
  ctx.lineTo(bogiePivotX, bogiePivotY);
  ctx.lineTo(bx - Math.round(bodyW * 0.06), wheelY);
  ctx.lineTo(midX - Math.round(bodyW * 0.02), wheelY);
  ctx.stroke();

  ctx.fillStyle = '#f59e0b';
  ctx.beginPath(); ctx.arc(pivotX, pivotY, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(bogiePivotX, bogiePivotY, 3, 0, Math.PI * 2); ctx.fill();

  if (deployed) {
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bogiePivotX, bogiePivotY);
    ctx.lineTo(midX - Math.round(bodyW * 0.02), wheelY - wheelR);
    ctx.stroke();
  }

  const rollAngle = (time * 8.0 * (throttle || (deployed ? 0.35 : 0))) % (Math.PI * 2);
  const steerAngle = rotInput * 0.35;

  wheelSpans.forEach(({ x: wx, role, steer }) => {
    ctx.save();
    ctx.translate(wx, wheelY);
    if (steer && deployed) {
      ctx.rotate(role === 'front' ? steerAngle : -steerAngle * 0.7);
    }

    const wGrad = ctx.createRadialGradient(0, 0, wheelR * 0.3, 0, 0, wheelR);
    wGrad.addColorStop(0, '#64748b');
    wGrad.addColorStop(0.7, '#334155');
    wGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = wGrad;
    ctx.beginPath();
    ctx.arc(0, 0, wheelR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.2;
    for (let c = 0; c < 6; c++) {
      const a = rollAngle + (c * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (wheelR * 0.5), Math.sin(a) * (wheelR * 0.5));
      ctx.lineTo(Math.cos(a) * wheelR, Math.sin(a) * wheelR);
      ctx.stroke();
    }

    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(0, 0, wheelR * 0.28, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  });

  // 2. Chassis Lower Belly Pan
  const bellyH = Math.max(4, Math.round(bodyH * 0.22));
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(bx + 4, by + bodyH, bodyW - 8, bellyH);

  // 3. Rover Main Chassis (Gold MLI Insulation Foil)
  const mliGrad = ctx.createLinearGradient(bx, 0, bx + bodyW, 0);
  mliGrad.addColorStop(0, '#b45309');
  mliGrad.addColorStop(0.15, '#d97706');
  mliGrad.addColorStop(0.4, '#f59e0b');
  mliGrad.addColorStop(0.65, '#fbbf24');
  mliGrad.addColorStop(0.85, '#d97706');
  mliGrad.addColorStop(1, '#92400e');
  ctx.fillStyle = mliGrad;
  ctx.fillRect(bx, by, bodyW, bodyH);
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx, by, bodyW, bodyH);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.lineWidth = 1;
  const gridStep = Math.max(8, Math.round(bodyW / 6));
  for (let gx = bx + gridStep; gx < bx + bodyW; gx += gridStep) {
    ctx.beginPath(); ctx.moveTo(gx, by); ctx.lineTo(gx, by + bodyH); ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(bx, by + bodyH / 2);
  ctx.lineTo(bx + bodyW, by + bodyH / 2);
  ctx.stroke();

  // Top Equipment Deck (Clean aerospace composite white / graphite)
  const deckH = Math.max(5, Math.round(bodyH * 0.28));
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(bx - 2, by - deckH, bodyW + 4, deckH);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx - 2, by - deckH, bodyW + 4, deckH);

  // 4. Rear MMRTG (Multi-Mission Radioisotope Thermoelectric Generator)
  const rtgW = Math.round(bodyW * 0.24);
  const rtgH = Math.round(bodyH * 0.60);
  const rtgX = bx - Math.round(rtgW * 0.75);
  const rtgY = by - Math.round(rtgH * 0.40);

  ctx.fillStyle = '#334155';
  ctx.beginPath();
  ctx.moveTo(rtgX, rtgY);
  ctx.lineTo(rtgX + rtgW, rtgY - 3);
  ctx.lineTo(rtgX + rtgW, rtgY + rtgH);
  ctx.lineTo(rtgX, rtgY + rtgH - 3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.strokeStyle = '#ea580c';
  ctx.lineWidth = 1.2;
  for (let f = 3; f < rtgH - 2; f += 4) {
    ctx.beginPath();
    ctx.moveTo(rtgX + 2, rtgY + f);
    ctx.lineTo(rtgX + rtgW - 2, rtgY + f);
    ctx.stroke();
  }

  // 5. Remote Sensing Mast (RSM) with Mastcam-Z & SuperCam
  const mastBaseX = bx + Math.round(bodyW * 0.72);
  const mastBaseY = by - deckH;
  const mastLen = Math.round(cH * 0.32);

  ctx.save();
  ctx.translate(mastBaseX, mastBaseY);

  const mastAngle = -Math.PI / 2 * pMast;
  ctx.rotate(mastAngle);

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = Math.max(3, Math.round(cW * 0.015));
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(mastLen, 0);
  ctx.stroke();

  const headW = Math.max(8, Math.round(bodyW * 0.18));
  const headH = Math.max(6, Math.round(headW * 0.65));
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(mastLen - 2, -headH / 2, headW, headH);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.strokeRect(mastLen - 2, -headH / 2, headW, headH);

  ctx.fillStyle = '#0284c7';
  ctx.beginPath(); ctx.arc(mastLen + headW * 0.35, -headH * 0.25, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(mastLen + headW * 0.70, -headH * 0.25, 2.5, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#f43f5e';
  ctx.beginPath(); ctx.arc(mastLen + headW * 0.52, headH * 0.22, 2.2, 0, Math.PI * 2); ctx.fill();

  ctx.restore();

  // 6. Front Robotic Arm & Sampling Turret (PIXL, SHERLOC, Core Drill)
  const armBaseX = bx + bodyW - 2;
  const armBaseY = by + Math.round(bodyH * 0.45);
  const armSeg1 = Math.round(bodyW * 0.26);
  const armSeg2 = Math.round(bodyW * 0.22);

  const armAngle1 = deployed ? (0.2 + 0.6 * pArm) : -0.2;
  const armAngle2 = deployed ? (-0.4 - 0.7 * pArm) : 0.8;

  const elbowX = armBaseX + Math.cos(armAngle1) * armSeg1;
  const elbowY = armBaseY + Math.sin(armAngle1) * armSeg1;
  const wristX = elbowX + Math.cos(armAngle1 + armAngle2) * armSeg2;
  const wristY = elbowY + Math.sin(armAngle1 + armAngle2) * armSeg2;

  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = Math.max(2, Math.round(cW * 0.012));
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(armBaseX, armBaseY);
  ctx.lineTo(elbowX, elbowY);
  ctx.lineTo(wristX, wristY);
  ctx.stroke();

  ctx.fillStyle = '#334155';
  ctx.beginPath();
  ctx.arc(wristX, wristY, Math.max(3, Math.round(cW * 0.018)), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(wristX, wristY);
  ctx.lineTo(wristX + 7 * (deployed ? 1 : 0), wristY + 4);
  ctx.stroke();

  // 7. High-Gain Antenna (HGA) Microwave Dish on Deck
  const dishX = bx + Math.round(bodyW * 0.32);
  const dishY = by - deckH - 2;
  const dishR = Math.max(5, Math.round(bodyW * 0.12));

  ctx.fillStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.ellipse(dishX, dishY - dishR * 0.4, dishR, Math.max(2, dishR * 0.45), -0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(dishX, dishY);
  ctx.lineTo(dishX + 2, dishY - dishR * 0.7);
  ctx.stroke();

  // 8. NASA Meatball / Mission Badge insignia on chassis
  ctx.fillStyle = '#1d4ed8';
  ctx.beginPath();
  ctx.arc(bx + Math.round(bodyW * 0.50), by + Math.round(bodyH * 0.32), 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bx + Math.round(bodyW * 0.46), by + Math.round(bodyH * 0.34));
  ctx.lineTo(bx + Math.round(bodyW * 0.52), by + Math.round(bodyH * 0.30));
  ctx.stroke();

  // 9. Forward & Hazard Avoidance Cameras (Hazcams) on bumper
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(bx + bodyW - 3, by + Math.round(bodyH * 0.75), 4, 3);
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(bx + bodyW - 1, by + Math.round(bodyH * 0.75) + 1, 1.5, 1.5);

  ctx.restore();
}

/**
 * Paint detailed 2D spacecraft onto canvas (Satellite or Planetary Rover).
 * Supports compact stowed configuration (when attached to rocket/inside fairing)
 * and animated multi-stage slow-motion cinematic mechanical unfolding (when deployed into space/surface).
 */
function paintPayloadCanvas(ctx, cW, cH, summary, deployed, prog, throttle = 0, rotInput = 0, time = 0) {
  if (isRoverPayload(summary)) {
    paintRoverCanvas(ctx, cW, cH, summary, deployed, prog, throttle, rotInput, time);
    return;
  }
  ctx.save();
  const midX = cW / 2;
  const isDep = deployed === true;
  const p = Math.max(0.0, Math.min(1.0, Number.isFinite(prog) ? prog : 0.0));

  // Bus dimensions: slightly more compact in deployed mode to give magnificent span to solar wings
  const busW = Math.round(cW * (isDep ? 0.22 : 0.52));
  const busH = Math.round(cH * 0.44);
  const bx = Math.round(midX - busW / 2);
  const by = Math.round(cH * 0.38);

  const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));
  const smooth = (v) => v * v * (3 - 2 * v); // Hermite smoothstep curve

  // ─── 1. Conical Payload Attach Fitting (PAF) / Separation Ring ───
  const pafTopW = Math.round(busW * 0.74);
  const pafBotW = Math.round(busW * 0.88);
  const pafH = Math.max(5, Math.round(cH * 0.09));
  const pafY = by + busH;

  const pafGrad = ctx.createLinearGradient(midX - pafBotW / 2, 0, midX + pafBotW / 2, 0);
  pafGrad.addColorStop(0, '#1e293b');
  pafGrad.addColorStop(0.25, '#475569');
  pafGrad.addColorStop(0.5, '#94a3b8');
  pafGrad.addColorStop(0.75, '#475569');
  pafGrad.addColorStop(1, '#0f172a');

  ctx.fillStyle = pafGrad;
  ctx.beginPath();
  ctx.moveTo(midX - pafTopW / 2, pafY);
  ctx.lineTo(midX + pafTopW / 2, pafY);
  ctx.lineTo(midX + pafBotW / 2, pafY + pafH);
  ctx.lineTo(midX - pafBotW / 2, pafY + pafH);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Internal structural triangular ribbing
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(midX - pafTopW * 0.28, pafY + 1);
  ctx.lineTo(midX - pafBotW * 0.12, pafY + pafH - 1);
  ctx.moveTo(midX + pafTopW * 0.28, pafY + 1);
  ctx.lineTo(midX + pafBotW * 0.12, pafY + pafH - 1);
  ctx.stroke();

  // Pyrotechnic separation clamp-band tensioner
  ctx.fillStyle = isDep && p > 0.1 ? '#64748b' : '#f59e0b';
  ctx.fillRect(midX - 4, pafY + pafH * 0.35, 8, Math.max(2, pafH * 0.25));

  // ─── 2. Apogee Propulsion / Xenon Ion Thruster Nozzle ───
  const nozW = Math.max(8, Math.round(busW * 0.24));
  const nozH = Math.max(5, Math.round(cH * 0.05));
  const nozY = pafY + pafH;

  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.moveTo(midX - nozW * 0.35, nozY);
  ctx.lineTo(midX + nozW * 0.35, nozY);
  ctx.lineTo(midX + nozW * 0.50, nozY + nozH);
  ctx.lineTo(midX - nozW * 0.50, nozY + nozH);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Active propulsion plume when throttle > 0
  if (isDep && throttle > 0.01) {
    const pulse = 0.88 + 0.12 * Math.sin(time * 35.0);
    const plumeL = Math.round(cH * 0.38 * Math.min(1.0, throttle) * pulse);
    const plumeW = Math.round(nozW * 0.95);
    const pGrad = ctx.createLinearGradient(0, nozY + nozH, 0, nozY + nozH + plumeL);
    pGrad.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
    pGrad.addColorStop(0.18, 'rgba(56, 189, 248, 0.90)');
    pGrad.addColorStop(0.55, 'rgba(14, 165, 233, 0.55)');
    pGrad.addColorStop(1, 'rgba(2, 132, 199, 0)');
    ctx.fillStyle = pGrad;
    ctx.beginPath();
    ctx.moveTo(midX - plumeW / 2, nozY + nozH);
    ctx.lineTo(midX + plumeW / 2, nozY + nozH);
    ctx.lineTo(midX, nozY + nozH + plumeL);
    ctx.closePath();
    ctx.fill();

    // Hot inner core
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.beginPath();
    ctx.ellipse(midX, nozY + nozH + 2, nozW * 0.28, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ─── 3. Cold-Gas RCS Attitude Thrusters Plumes ───
  if (isDep && Math.abs(rotInput) > 0.04) {
    const rcsPuff = (px, py, dirX) => {
      const puffLen = Math.round(cW * 0.11 * (0.8 + 0.2 * Math.sin(time * 48)));
      const pGrad = ctx.createLinearGradient(px, py, px + dirX * puffLen, py);
      pGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      pGrad.addColorStop(0.35, 'rgba(186, 230, 253, 0.75)');
      pGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = pGrad;
      ctx.beginPath();
      ctx.moveTo(px, py - 2.5);
      ctx.lineTo(px, py + 2.5);
      ctx.lineTo(px + dirX * puffLen, py);
      ctx.closePath();
      ctx.fill();
    };

    if (rotInput < -0.04) {
      rcsPuff(bx + busW + 2, by + 4, 1);
      rcsPuff(bx - 2, by + busH - 4, -1);
    } else if (rotInput > 0.04) {
      rcsPuff(bx - 2, by + 4, -1);
      rcsPuff(bx + busW + 2, by + busH - 4, 1);
    }
  }

  // ─── 4. Solar Arrays (Stowed vs. Cinematic 3-Panel Slow-Mo Accordion Unfolding) ───
  if (isDep && p > 0.001) {
    // Total available wing span on each side
    const maxWingSpan = Math.round((cW / 2 - busW / 2) * 0.94);
    // Phase A: Primary deployment boom scissor extension (prog 0.04 -> 0.32)
    const pBoom = smooth(clamp((p - 0.04) / 0.28));
    const boomMax = Math.round(maxWingSpan * 0.16);
    const boomExt = Math.round(boomMax * pBoom);

    // 3 panels per wing (Inner, Middle, Outer)
    const panelFullW = Math.round((maxWingSpan - boomMax) / 3.08);
    const panH = Math.round(busH * 0.72);
    const py = Math.round(by + (busH - panH) / 2);

    // Phase B: Panel 1 (Inner) swings out (prog 0.18 -> 0.58)
    const p1 = smooth(clamp((p - 0.18) / 0.40));
    // Phase C: Panel 2 (Middle) unfolds (prog 0.38 -> 0.80)
    const p2 = smooth(clamp((p - 0.38) / 0.42));
    // Phase D: Panel 3 (Outer) flips open & locks (prog 0.62 -> 0.96)
    const p3 = smooth(clamp((p - 0.62) / 0.34));

    const w1 = Math.max(4, Math.round(panelFullW * (0.12 + 0.88 * p1)));
    const w2 = Math.max(3, Math.round(panelFullW * (0.08 + 0.92 * p2)));
    const w3 = Math.max(2, Math.round(panelFullW * (0.05 + 0.95 * p3)));

    const renderWing = (isRight) => {
      ctx.save();
      const s = isRight ? 1 : -1;
      const rootX = isRight ? bx + busW : bx;

      // Primary Boom Yoke arm
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(rootX, py + panH / 2);
      ctx.lineTo(rootX + s * boomExt, py + panH / 2);
      ctx.stroke();

      // Scissor truss cross-bracing
      if (boomExt > 8) {
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(rootX, py + panH / 2 - 3);
        ctx.lineTo(rootX + s * boomExt, py + panH / 2 + 3);
        ctx.moveTo(rootX, py + panH / 2 + 3);
        ctx.lineTo(rootX + s * boomExt, py + panH / 2 - 3);
        ctx.stroke();
      }

      // Root hinge joint
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.arc(rootX + s * boomExt, py + panH / 2, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Draw each of the 3 panels sequentially
      const panels = [
        { w: w1, prog: p1, label: 1 },
        { w: w2, prog: p2, label: 2 },
        { w: w3, prog: p3, label: 3 },
      ];

      let currX = rootX + s * boomExt;
      for (let i = 0; i < panels.length; i++) {
        const pan = panels[i];
        const px = isRight ? currX : currX - pan.w;

        // Space-grade triple-junction GaAs solar cell gradient
        const cellGrad = ctx.createLinearGradient(px, 0, px + pan.w, 0);
        cellGrad.addColorStop(0, '#0a192f');
        cellGrad.addColorStop(0.12, '#172554');
        cellGrad.addColorStop(0.50, '#1d4ed8');
        cellGrad.addColorStop(0.88, '#1e3a8a');
        cellGrad.addColorStop(1, '#0b132b');

        ctx.fillStyle = cellGrad;
        ctx.fillRect(px, py, pan.w, panH);
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(px, py, pan.w, panH);

        // Internal cell grid lines (fade in with panel deployment)
        if (pan.prog > 0.3) {
          const cAlpha = Math.min(0.75, (pan.prog - 0.3) / 0.7 * 0.75);
          ctx.strokeStyle = `rgba(191, 219, 254, ${cAlpha})`;
          ctx.lineWidth = 0.8;

          // Vertical cell columns
          const cols = 3;
          for (let c = 1; c < cols; c++) {
            const cx = px + (pan.w * c) / cols;
            ctx.beginPath();
            ctx.moveTo(cx, py + 1);
            ctx.lineTo(cx, py + panH - 1);
            ctx.stroke();
          }

          // Horizontal split
          ctx.beginPath();
          ctx.moveTo(px, py + panH / 2);
          ctx.lineTo(px + pan.w, py + panH / 2);
          ctx.stroke();

          // Ultra-fine micro collection fingers
          ctx.strokeStyle = `rgba(224, 242, 254, ${cAlpha * 0.45})`;
          ctx.lineWidth = 0.5;
          for (let fy = py + 4; fy < py + panH; fy += 5) {
            ctx.beginPath();
            ctx.moveTo(px + 1, fy);
            ctx.lineTo(px + pan.w - 1, fy);
            ctx.stroke();
          }

          // Golden border busbar & inter-cell connectors
          ctx.strokeStyle = `rgba(245, 158, 11, ${cAlpha * 0.85})`;
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 1, py + 1, pan.w - 2, panH - 2);
        }

        // Inter-panel titanium mechanical hinge
        if (i < panels.length - 1) {
          const hingeX = isRight ? currX + pan.w : currX - pan.w;
          ctx.fillStyle = '#e2e8f0';
          ctx.fillRect(hingeX - 1.5, py + panH * 0.15, 3, 5);
          ctx.fillRect(hingeX - 1.5, py + panH * 0.85 - 5, 3, 5);
          // Gold grounding wire loop
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.arc(hingeX, py + panH / 2, 2.5, 0, Math.PI);
          ctx.stroke();
        }

        currX += s * pan.w;
      }

      // Specular solar array glint sweep across deployed wing when locked (prog > 0.85)
      if (p > 0.85) {
        const totalW = w1 + w2 + w3;
        const gProg = (p - 0.85) / 0.15; // 0.0 -> 1.0 sweep
        const startX = isRight ? rootX + boomExt : rootX - boomExt - totalW;
        const glintX = startX + totalW * gProg;
        const gGrad = ctx.createLinearGradient(glintX - 14, 0, glintX + 14, 0);
        gGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
        gGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.75)');
        gGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gGrad;
        ctx.fillRect(startX, py, totalW, panH);
      }

      ctx.restore();
    };

    renderWing(false); // Left / Port wing
    renderWing(true);  // Right / Starboard wing
  } else {
    // ─── Stowed/Folded 3-Panel Accordion Packs against bus flanks ───
    const foldW = Math.max(5, Math.round(busW * 0.13));
    const foldH = Math.round(busH * 0.80);
    const fy = Math.round(by + (busH - foldH) / 2);

    const renderStowedPack = (isRight) => {
      const px = isRight ? bx + busW + 1 : bx - foldW - 1;
      // Stowed dark carbon substrate
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(px, fy, foldW, foldH);
      // Deep blue cell edge
      ctx.fillStyle = '#1e3a8a';
      ctx.fillRect(px + 1, fy + 1, foldW - 2, foldH - 2);
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 1;
      ctx.strokeRect(px, fy, foldW, foldH);

      // Accordion fold separation lines
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + foldW * 0.35, fy + 1); ctx.lineTo(px + foldW * 0.35, fy + foldH - 1);
      ctx.moveTo(px + foldW * 0.70, fy + 1); ctx.lineTo(px + foldW * 0.70, fy + foldH - 1);
      ctx.stroke();

      // Gold pyrotechnic pin-puller hold-down brackets
      ctx.fillStyle = '#f59e0b';
      const bracketX = isRight ? px + foldW - 1 : px - 2;
      ctx.fillRect(bracketX, fy + 5, 3, 5);
      ctx.fillRect(bracketX, fy + foldH - 10, 3, 5);
    };

    renderStowedPack(false);
    renderStowedPack(true);
  }

  // ─── 5. Golden Multi-Layer Insulation (MLI) Satellite Bus ───
  const goldGrad = ctx.createLinearGradient(bx, 0, bx + busW, 0);
  goldGrad.addColorStop(0, '#78350f');
  goldGrad.addColorStop(0.15, '#b45309');
  goldGrad.addColorStop(0.35, '#f59e0b');
  goldGrad.addColorStop(0.50, '#fef08a');
  goldGrad.addColorStop(0.65, '#fbbf24');
  goldGrad.addColorStop(0.85, '#d97706');
  goldGrad.addColorStop(1, '#78350f');

  ctx.fillStyle = goldGrad;
  ctx.fillRect(bx, by, busW, busH);
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx, by, busW, busH);

  // High-fidelity diamond / honeycomb quilted thermal blanket stitching
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)';
  ctx.lineWidth = 0.8;
  const stitchStep = Math.max(6, Math.round(busW * 0.16));
  for (let sx = bx + stitchStep; sx < bx + busW; sx += stitchStep) {
    ctx.beginPath();
    ctx.moveTo(sx, by + 1);
    ctx.lineTo(sx, by + busH - 1);
    ctx.stroke();
  }
  for (let sy = by + stitchStep; sy < by + busH; sy += stitchStep) {
    ctx.beginPath();
    ctx.moveTo(bx + 1, sy);
    ctx.lineTo(bx + busW - 1, sy);
    ctx.stroke();
  }

  // ─── 6. Optical Solar Reflector (OSR) Mirror Radiator Plates ───
  const radH = Math.max(4, Math.round(busH * 0.11));
  const renderRadiator = (ry) => {
    const rGrad = ctx.createLinearGradient(bx + 4, 0, bx + busW - 4, 0);
    rGrad.addColorStop(0, '#64748b');
    rGrad.addColorStop(0.3, '#cbd5e1');
    rGrad.addColorStop(0.5, '#f8fafc');
    rGrad.addColorStop(0.7, '#cbd5e1');
    rGrad.addColorStop(1, '#475569');
    ctx.fillStyle = rGrad;
    ctx.fillRect(bx + 3, ry, busW - 6, radH);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 3, ry, busW - 6, radH);
    // Radiator mirror tile seams
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 0.5;
    for (let tx = bx + 12; tx < bx + busW - 8; tx += 9) {
      ctx.beginPath(); ctx.moveTo(tx, ry); ctx.lineTo(tx, ry + radH); ctx.stroke();
    }
  };
  renderRadiator(by + 2);               // Upper thermal radiator
  renderRadiator(by + busH - radH - 2); // Lower thermal radiator

  // ─── 7. Star Tracker Autonomous Optical Attitude Sensors ───
  // Dual optical cameras mounted at +/- 45 deg angles on upper corners
  const renderStarTracker = (isRight) => {
    const stX = isRight ? bx + busW - 3 : bx + 3;
    const stY = by + Math.round(busH * 0.18);
    const ang = isRight ? -Math.PI / 4 : -Math.PI * 3 / 4;
    const tubeL = Math.max(5, Math.round(busW * 0.14));

    ctx.save();
    ctx.translate(stX, stY);
    ctx.rotate(ang);
    // Dark titanium optical hood
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, -2.5, tubeL, 5);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, -2.5, tubeL, 5);
    // Sapphire anti-reflective lens element
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.arc(tubeL, 0, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  renderStarTracker(false);
  renderStarTracker(true);

  // ─── 8. Deployable Scientific Magnetometer / Instrument Boom ───
  if (isDep && p > 0.25) {
    const boomProg = smooth(clamp((p - 0.25) / 0.65));
    const boomLen = Math.round(busW * 0.70 * boomProg);
    const mAngle = -Math.PI * 0.70; // 40 degrees upwards-left
    const startX = bx + 4;
    const startY = by + Math.round(busH * 0.28);
    const tipX = startX + Math.cos(mAngle) * boomLen;
    const tipY = startY + Math.sin(mAngle) * boomLen;

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    // Magnetometer sensor head at tip
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(tipX, tipY, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // ─── 9. High-Gain Parabolic Cassegrain Microwave Antenna (HGA) ───
  const dishProg = isDep ? smooth(clamp((p - 0.15) / 0.75)) : 0.0;
  const dishElev = Math.round(14 * dishProg);
  const dishY = by - 4 - dishElev;
  const dishRadiusX = busW * (0.28 + 0.10 * dishProg);
  const dishRadiusY = Math.max(3.5, busW * (0.08 + 0.08 * dishProg));

  // Motorized 2-axis gimbal mast
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(midX, by);
  ctx.lineTo(midX, dishY);
  ctx.stroke();

  // Gimbal elevation joint
  ctx.fillStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.arc(midX, by - 2, 3, 0, Math.PI * 2);
  ctx.fill();

  // Parabolic dish reflector (metallic silver with carbon composite backing)
  const dishGrad = ctx.createRadialGradient(midX, dishY - 2, 0, midX, dishY, dishRadiusX);
  dishGrad.addColorStop(0, '#f8fafc');
  dishGrad.addColorStop(0.5, '#cbd5e1');
  dishGrad.addColorStop(0.85, '#94a3b8');
  dishGrad.addColorStop(1, '#475569');

  ctx.fillStyle = dishGrad;
  ctx.beginPath();
  ctx.ellipse(midX, dishY, dishRadiusX, dishRadiusY, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Cassegrain sub-reflector feed tripod
  if (dishProg > 0.15) {
    const feedH = 9 * dishProg;
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(midX - dishRadiusX * 0.45, dishY);
    ctx.lineTo(midX, dishY - feedH);
    ctx.moveTo(midX + dishRadiusX * 0.45, dishY);
    ctx.lineTo(midX, dishY - feedH);
    ctx.stroke();

    // Gold Cassegrain sub-reflector cap
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(midX, dishY - feedH, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  // ─── 10. Earth Observation Multispectral Optical Aperture ───
  const lensR = Math.max(5, Math.round(busW * 0.18));
  const lensY = by + Math.round(busH * 0.52);

  // Stepped black optical baffle housing
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(midX, lensY, lensR + 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Multi-coated optical glass element (deep azure/sapphire)
  const lensGrad = ctx.createRadialGradient(midX - 2, lensY - 2, 0, midX, lensY, lensR);
  lensGrad.addColorStop(0, '#38bdf8');
  lensGrad.addColorStop(0.4, '#0284c7');
  lensGrad.addColorStop(0.85, '#0369a1');
  lensGrad.addColorStop(1, '#082f49');

  ctx.fillStyle = lensGrad;
  ctx.beginPath();
  ctx.arc(midX, lensY, lensR, 0, Math.PI * 2);
  ctx.fill();

  // Specular reflection glint on optical glass
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.beginPath();
  ctx.arc(midX - lensR * 0.35, lensY - lensR * 0.35, Math.max(1.2, lensR * 0.28), 0, Math.PI * 2);
  ctx.fill();

  // ─── 11. Diagnostic Avionics Status & Telemetry LEDs ───
  const ledY = by + Math.round(busH * 0.76);
  // Power OK beacon (emerald green)
  ctx.fillStyle = isDep && p > 0.88 ? '#22c55e' : (isDep ? '#f59e0b' : '#64748b');
  ctx.beginPath(); ctx.arc(bx + Math.round(busW * 0.28), ledY, 2, 0, Math.PI * 2); ctx.fill();
  // Downlink telemetry link (sapphire cyan, pulses with time)
  const dPulse = 0.5 + 0.5 * Math.sin(time * 8.0);
  ctx.fillStyle = isDep ? `rgba(6, 182, 212, ${0.4 + 0.6 * dPulse})` : 'rgba(100, 116, 139, 0.5)';
  ctx.beginPath(); ctx.arc(bx + Math.round(busW * 0.72), ledY, 2, 0, Math.PI * 2); ctx.fill();

  ctx.restore();
}

export function buildPayloadMesh(payload = {}, deployed = true, deployProgress = 1.0) {
  const summary = payload?.summary || payload || {};
  const prog = Math.max(0.0, Math.min(1.0, Number.isFinite(deployProgress) ? deployProgress : 1.0));
  const isRover = isRoverPayload(summary);
  const defaultW = isRover ? 2.4 : 1.2;
  const defaultH = isRover ? 1.6 : 1.3;
  // Stable span dimensions so mesh geometry remains crisp without distortion
  const spanW = deployed
    ? (isRover ? 2.6 : Math.max(3.8, Math.min(4.8, (Number(summary.width) || defaultW) * 3.2)))
    : Math.max(1.0, Math.min(1.8, Number(summary.width) || defaultW));
  const spanH = Math.max(1.2, Math.min(2.4, Number(summary.height) || defaultH));

  const scale = 160;
  const cW = Math.max(2, Math.ceil(spanW * scale));
  const cH = Math.max(2, Math.ceil(spanH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cW;
  canvas.height = cH;
  const ctx = canvas.getContext('2d');

  paintPayloadCanvas(ctx, cW, cH, summary, deployed, prog);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  mat.userData.partArt = true;
  mat.userData.isPayload = true;

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(spanW, spanH), mat);
  mesh.renderOrder = 3;
  mesh.userData.spanW = spanW;
  mesh.userData.spanH = spanH;
  mesh.userData.isPayload = true;
  mesh.userData.payloadCanvas = canvas;
  mesh.userData.payloadTex = tex;

  mesh.userData.updateProgress = (newProg) => {
    ctx.clearRect(0, 0, cW, cH);
    paintPayloadCanvas(ctx, cW, cH, summary, true, Math.max(0.0, Math.min(1.0, newProg)));
    tex.needsUpdate = true;
  };

  mesh.userData.updateState = (newProg, throttle = 0, rotInput = 0, time = 0) => {
    ctx.clearRect(0, 0, cW, cH);
    paintPayloadCanvas(ctx, cW, cH, summary, true, Math.max(0.0, Math.min(1.0, newProg)), throttle, rotInput, time);
    tex.needsUpdate = true;
  };

  return mesh;
}

// ─── Fairing shroud (2D Ogive Composite Enclosure) ───────────────────────────

export function buildFairingShroud(p, vehicleParts = [], payload = null) {
  const def = p.def || p;
  let spanH = def.height || 1.8;

  // Measure total height needed to enclose any payload or children
  const payloadPart = vehicleParts.find(q => isPayloadPart(q.def));
  const childParts = vehicleParts.filter(q => q.parent === p.uid && q.mount === 'below');

  if (payloadPart) {
    const pHgt = Math.max(0.8, (Number(payloadPart.y1) - Number(payloadPart.y0)) || (Number(payloadPart.def?.height) || 1.4));
    spanH = Math.max(spanH, pHgt + 0.4);
  } else if (childParts.length) {
    let curr = childParts[0];
    let hAcc = 0;
    while (curr) {
      hAcc += Math.max(0.4, (Number(curr.y1) - Number(curr.y0)) || (Number(curr.def?.height) || 1.0));
      const next = vehicleParts.find(q => q.parent === curr.uid && q.mount === 'below');
      if (!next || next.def?.separator) break;
      curr = next;
    }
    if (hAcc > 0.5) spanH = Math.max(spanH, hAcc + 0.35);
  } else if (payload && (payload.parts?.length || payload.summary)) {
    const pHgt = Math.max(0.8, Math.min(3.2, Number(payload.summary?.height) || 1.3));
    spanH = Math.max(spanH, pHgt + 0.4);
  }

  const d = Math.max(def.diameter || 1.2, 1.3);

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

  // Base golden separation ring
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
  mesh.renderOrder = 10;
  g.add(mesh);
  g.userData.spanH = spanH;
  g.userData.isFairing = true;
  return g;
}

export function buildFairingHalf(side = 'left', p = {}, spanH = 2.0, d = 1.3) {
  const isLeft = side === 'left' || side === 'port';
  const scale = 128;
  const halfD = Math.max(0.65, d / 2);
  const cW = Math.max(2, Math.ceil(halfD * scale));
  const cH = Math.max(2, Math.ceil(spanH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cW;
  canvas.height = cH;
  const ctx = canvas.getContext('2d');

  ctx.save();
  const apex = 6;
  const base = cH - 4;
  const steps = 36;

  ctx.beginPath();
  if (isLeft) {
    const seamX = cW - 2;
    ctx.moveTo(seamX, apex);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const rx = (cW - 6) * Math.sin(Math.PI / 2 * Math.pow(t, 0.64));
      const ry = apex + t * (base - apex);
      ctx.lineTo(seamX - rx, ry);
    }
    ctx.lineTo(seamX, base);
    ctx.closePath();
  } else {
    const seamX = 2;
    ctx.moveTo(seamX, apex);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const rx = (cW - 6) * Math.sin(Math.PI / 2 * Math.pow(t, 0.64));
      const ry = apex + t * (base - apex);
      ctx.lineTo(seamX + rx, ry);
    }
    ctx.lineTo(seamX, base);
    ctx.closePath();
  }

  const grad = ctx.createLinearGradient(0, 0, cW, 0);
  if (isLeft) {
    grad.addColorStop(0, '#64748b');
    grad.addColorStop(0.3, '#94a3b8');
    grad.addColorStop(0.85, '#f1f5f9');
    grad.addColorStop(1, '#cbd5e1');
  } else {
    grad.addColorStop(0, '#cbd5e1');
    grad.addColorStop(0.15, '#f1f5f9');
    grad.addColorStop(0.7, '#94a3b8');
    grad.addColorStop(1, '#64748b');
  }
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Acoustic insulation tiles
  ctx.strokeStyle = 'rgba(30, 41, 59, 0.4)';
  ctx.lineWidth = 1;
  for (let y = apex + 20; y < base - 10; y += 18) {
    ctx.beginPath();
    ctx.moveTo(isLeft ? cW - 22 : 4, y);
    ctx.lineTo(isLeft ? cW - 4 : 22, y);
    ctx.stroke();
  }

  // Separation bolts along seam
  ctx.fillStyle = '#f59e0b';
  const boltX = isLeft ? cW - 4 : 1;
  for (let y = apex + 24; y < base - 12; y += 22) {
    ctx.fillRect(boltX, y, 3, 4);
  }

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
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(halfD, spanH), mat);
  mesh.renderOrder = 9;
  mesh.position.x = isLeft ? -halfD / 2 : halfD / 2;
  g.add(mesh);
  g.userData.spanH = spanH;
  g.userData.isFairing = true;
  return g;
}

// ─── Single part builder (pure 2D) ───────────────────────────────────────────

export async function buildPart(p, vehicleParts = [], payload = null) {
  const def = p.def;

  if (isFairingPart(def)) {
    return buildFairingShroud(p, vehicleParts, payload);
  }

  if (isPayloadPart(def)) {
    return buildPayloadMesh(def, false);
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

  const hasPayloadPart = parts.some(p => isPayloadPart(p.def));

  await Promise.all(parts.map(async p => {
    const m = await buildPart(p, parts, payload);

    if (isFairingPart(p.def)) {
      m.userData.isFairing = true;
      const spanH = m.userData.spanH || (p.def.height || 1.8);
      // Fairing base sits at bottom of enclosed payload/children, extending upwards by spanH
      const payloadPart = parts.find(q => isPayloadPart(q.def));
      let baseY = p.y1;
      if (payloadPart) {
        baseY = payloadPart.y1;
      } else {
        const childParts = parts.filter(q => q.parent === p.uid && q.mount === 'below');
        if (childParts.length) {
          baseY = childParts[childParts.length - 1].y1;
        } else if (p.parent) {
          const parentPart = parts.find(q => q.uid === p.parent);
          if (parentPart) baseY = parentPart.y0;
        }
      }
      m.position.y = -baseY + spanH / 2;
    } else {
      m.position.y = -(p.y0 + p.y1) / 2;
    }

    if (isPayloadPart(p.def)) {
      m.userData.isPayload = true;
    }

    model.add(m);
    meshes.set(p.uid, m);
  }));

  // Only add external payload if rocket parts do NOT already include a payload component
  const hasExternalPayload = !hasPayloadPart && payload && (payload.parts?.length || payload.name || payload.summary);
  if (hasExternalPayload) {
    const payloadMesh = buildPayloadMesh(payload, false);
    payloadMesh.userData.isPayload = true;
    const nonFairing   = parts.filter(p => !p.detached && !isFairingPart(p.def));
    const minY         = nonFairing.length ? Math.min(...nonFairing.map(p => Number(p.y0) || 0)) : 0;
    const pHgt         = payloadMesh.userData?.spanH || 1.3;
    payloadMesh.position.set(0, -minY + pHgt / 2, 0.005);
    model.add(payloadMesh);
    meshes.set('payload', payloadMesh);
  }

  return { root, model, meshes };
}

export function buildSatelliteVehicle(payload = {}, startProgress = 0.0) {
  const root = new THREE.Group();
  const model = new THREE.Group();
  const meshes = new Map();
  root.add(model);

  const pMesh = buildPayloadMesh(payload, true, startProgress);
  pMesh.userData.isPayload = true;
  model.add(pMesh);
  meshes.set('satellite', pMesh);
  return { root, model, meshes, payloadMesh: pMesh };
}

// Keep MATS exported so any other file that imports it won't crash
export const MATS = {};
