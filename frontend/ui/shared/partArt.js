import { assets } from '../../js/rendering/assets.js';

const INK = 'rgba(4,9,20,.92)';
export const BASE = { paint: '#e9edf4', graphite: '#4b5666', steel: '#9ca7b8', amber: '#f2a63a', copper: '#c9824a', gold: '#d9aa45', red: '#d4503a', black: '#12171f', panel: '#24418a' };

function shade(hex, a) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = a < 0 ? c => c * (1 + a) : c => c + (255 - c) * a;
  return `rgb(${Math.round(f(r))},${Math.round(f(g))},${Math.round(f(b))})`;
}
function barrel(ctx, l, w, base) {
  base = BASE[base] || base;
  const g = ctx.createLinearGradient(l, 0, l + w, 0);
  g.addColorStop(0, shade(base, -.4)); g.addColorStop(.2, shade(base, .1)); g.addColorStop(.42, shade(base, .03)); g.addColorStop(1, shade(base, -.5));
  return g;
}

const TANK_SLICES = {
  h1274: { bodyStart: 315, bodyEnd: 935, skirtStart: 995, tileA: 376, tileB: 446 },
  h662:  { bodyStart: 262, bodyEnd: 375, skirtStart: 435, tileA: 316, tileB: 374 },
};
const ENGINE_TUCK = 0.03;
const isTank = d => !!(d && (d.tank || d.category === 'tank'));

export function tankLinks(L, it) {
  const none = { mergeTop: false, mergeBottom: false, taperTop: 0, taperBottom: 0 };
  if (!L || !it || it.detached || !isTank(it.def)) return none;
  const near = (a, b) => Math.abs(a - b) < 1e-3;
  let mergeTop = false, mergeBottom = false, taperTop = 0, taperBottom = 0;
  for (const o of L.items) {
    if (o === it || o.detached || o.side !== it.side || o.dir !== it.dir || !near(o.x, it.x)) continue;
    if (o.def.category === 'aero' && near(o.yBottom, it.yTop) && Math.abs(o.def.diameter - it.def.diameter) <= .02 * it.def.diameter) { mergeTop = true; continue; }
    if (!isTank(o.def)) continue;
    if (Math.abs(o.def.diameter - it.def.diameter) > .02 * it.def.diameter) {
      if (o.def.diameter < it.def.diameter) {
        if (near(o.yBottom, it.yTop)) taperTop = o.def.diameter;
        if (near(o.yTop, it.yBottom)) taperBottom = o.def.diameter;
      }
      continue;
    }
    if (near(o.yBottom, it.yTop)) mergeTop = true;
    if (near(o.yTop, it.yBottom)) mergeBottom = true;
  }
  return { mergeTop, mergeBottom, taperTop, taperBottom };
}

function drawTankImage(ctx, image, def, w, h, mergeTop, mergeBottom) {
  const sl = TANK_SLICES[def.catalogueId] || TANK_SLICES['h' + image.naturalHeight];
  if (!sl || (!mergeTop && !mergeBottom)) return false;
  const W = image.naturalWidth, H = image.naturalHeight, s = w / W, l = -w / 2;
  const srcBot = mergeBottom ? sl.skirtStart : H;
  const topH = mergeTop ? 0 : sl.bodyStart * s, botH = (srcBot - sl.bodyEnd) * s;
  const fillH = h - topH - botH;
  if (fillH <= 0) return false;

  const tileSrcH = sl.tileB - sl.tileA, n = Math.max(1, Math.round(fillH / (tileSrcH * s))), th = fillH / n;
  for (let i = 0; i < n; i++) ctx.drawImage(image, 0, sl.tileA, W, tileSrcH, l, topH + i * th - (i || mergeTop ? .5 : 0), w, th + (i || mergeTop ? .5 : 0) + .6);
  if (!mergeTop) ctx.drawImage(image, 0, 0, W, sl.bodyStart, l, 0, w, topH + .5);
  ctx.drawImage(image, 0, sl.bodyEnd, W, srcBot - sl.bodyEnd, l, topH + fillH - .5, w, botH + .5);
  return true;
}

function paintTapered(ctx, def, o) {
  const { x, y, S, dir = 1, alpha = 1, onload, mergeTop, mergeBottom, taperTop, taperBottom } = o;
  const w = def.diameter * S, h = def.height * S, r = ctx.getTransform().a || 1, M = 3, l = x - w / 2;
  const off = document.createElement('canvas');
  off.width = Math.ceil((w + M * 2) * r); off.height = Math.ceil((h + M * 2) * r);
  const octx = off.getContext('2d'); octx.setTransform(r, 0, 0, r, 0, 0);
  paintPart(octx, def, { x: w / 2 + M, y: M, S, dir, onload, mergeTop, mergeBottom });
  const nT = taperTop ? Math.min(1, taperTop * S / w) : 1, nB = taperBottom ? Math.min(1, taperBottom * S / w) : 1;
  const tt = taperTop ? Math.min(h * .45, (w - taperTop * S) / 2 * 1.15) : 0, tb = taperBottom ? Math.min(h * .45, (w - taperBottom * S) / 2 * 1.15) : 0;
  const sx = M * r, sw = w * r, px = 1 / r;
  ctx.save(); ctx.globalAlpha = alpha; ctx.imageSmoothingQuality = 'high';
  const midH = h - tt - tb;
  if (midH > 0) ctx.drawImage(off, sx, M * r + tt * r, sw, midH * r, l, y + tt, w, midH + .5);
  const strip = (from, to, narrow, fromEdge) => {
    for (let a = from; a < to; a += px) {
      const t = fromEdge ? (a - from + px / 2) / (to - from) : (to - a - px / 2) / (to - from), f = narrow + (1 - narrow) * Math.min(1, Math.max(0, t));
      ctx.drawImage(off, sx, M * r + a * r, sw, 1, x - w * f / 2, y + a, w * f, px + .35);
    }
  };
  if (tt > 0) strip(0, tt, nT, true);
  if (tb > 0) strip(h - tb, h, nB, false);
  ctx.restore();
}

export function paintFairing(ctx, def, { x, top, bottom, S, width = 0, alpha = 1 }) {
  const h = Math.max(24, bottom - top), w = Math.max(width, def.diameter, def.bottomD || def.diameter) * S, l = x - w / 2, r = x + w / 2;
  ctx.save(); ctx.globalAlpha = alpha; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(1, Math.min(1.5, S / 32));
  if (def.shape === 'cylinder' || def.shape === 'ring') {
    const radius = Math.min(7, w * .08);
    ctx.fillStyle = 'rgba(8,12,19,.9)'; ctx.strokeStyle = 'rgba(0,0,0,.98)'; ctx.beginPath(); ctx.roundRect(l, top, w, h, radius); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(242,166,58,.95)'; ctx.lineWidth = Math.max(1.5, S / 22); ctx.beginPath(); ctx.moveTo(l - 2, top + 2); ctx.lineTo(r + 2, top + 2); ctx.moveTo(l - 2, bottom - 2); ctx.lineTo(r + 2, bottom - 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(92,111,133,.7)'; ctx.lineWidth = Math.max(1, S / 40); ctx.beginPath(); ctx.moveTo(l + w * .16, top + 3); ctx.lineTo(l + w * .16, bottom - 3); ctx.moveTo(r - w * .16, top + 3); ctx.lineTo(r - w * .16, bottom - 3); ctx.stroke(); ctx.restore(); return;
  }
  const panel = side => {
    const outer = side < 0 ? l : r, inner = x + side * w * .22;
    ctx.fillStyle = 'rgba(8,12,19,.9)'; ctx.strokeStyle = 'rgba(0,0,0,.98)'; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(outer, top + h * .2); ctx.lineTo(outer, top + h * .88); ctx.quadraticCurveTo(outer, top + h * .98, x + side * w * .34, bottom); ctx.lineTo(inner, bottom); ctx.lineTo(inner, top + h * .28); ctx.closePath(); ctx.fill(); ctx.stroke();
  };
  panel(-1); panel(1); ctx.strokeStyle = 'rgba(242,166,58,.95)'; ctx.lineWidth = Math.max(1.5, S / 22); ctx.beginPath(); ctx.moveTo(l - 2, top + h * .9); ctx.lineTo(r + 2, top + h * .9); ctx.stroke(); ctx.restore();
}

export function paintPart(ctx, def, { x, y, S, dir = 1, alpha = 1, onload, mergeTop = false, mergeBottom = false, taperTop = 0, taperBottom = 0 }) {
  if (taperTop || taperBottom) { paintTapered(ctx, def, { x, y, S, dir, alpha, onload, mergeTop, mergeBottom, taperTop, taperBottom }); return; }
  const w = def.diameter * S, h = def.height * S, l = x - w / 2, r = x + w / 2, y1 = y + h, mid = y + h / 2;
  ctx.save(); ctx.globalAlpha = alpha; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(1, Math.min(1.7, S / 28)); ctx.strokeStyle = INK;
    const image = assets.partImage(def, onload);
  if (!image && assets.hasPartImage(def)) { ctx.restore(); return; }   // PNG still loading: draw nothing rather than a vector stand-in
  if (image) {
    ctx.translate(x, y); if (dir < 0) ctx.scale(-1, 1);
    const art = isTank(def) ? { sx: 0, sy: 0, sw: image.naturalWidth, sh: image.naturalHeight } : assets.artBox(image);   // tanks keep the full image: TANK_SLICES are measured on it
    if (drawTankImage(ctx, image, def, w, h, mergeTop, mergeBottom)) { }
    else if (def.category === 'engine') {
      const k = Math.min(w / art.sw, h / art.sh), iw = art.sw * k, ih = art.sh * k;
      ctx.drawImage(image, art.sx, art.sy, art.sw, art.sh, -iw / 2, -ENGINE_TUCK * S, iw, ih);
    } else {
      const k = Math.max(w / art.sw, h / art.sh), iw = art.sw * k, ih = art.sh * k;
      ctx.save(); ctx.beginPath(); ctx.rect(-w / 2, 0, w, h); ctx.clip(); ctx.drawImage(image, art.sx, art.sy, art.sw, art.sh, -iw / 2, (h - ih) / 2, iw, ih); ctx.restore();
    }
    ctx.restore();
    return;
  }
  const box = (base, a, b, c, e) => { ctx.fillStyle = barrel(ctx, a, c, base); ctx.fillRect(a, b, c, e); ctx.strokeRect(a, b, c, e); };
  const band = (base, yy, th, a = l, c = w) => { ctx.fillStyle = barrel(ctx, a, c, base); ctx.fillRect(a, yy, c, th); };
  const bell = (xc, ww, ya, hh) => {
    ctx.fillStyle = barrel(ctx, xc - ww / 2, ww, BASE.copper); ctx.beginPath(); ctx.moveTo(xc - ww * .2, ya); ctx.lineTo(xc + ww * .2, ya);
    ctx.quadraticCurveTo(xc + ww * .3, ya + hh * .55, xc + ww / 2, ya + hh); ctx.lineTo(xc - ww / 2, ya + hh); ctx.quadraticCurveTo(xc - ww * .3, ya + hh * .55, xc - ww * .2, ya); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2b1a12'; ctx.beginPath(); ctx.ellipse(xc, ya + hh, ww / 2, Math.max(1.5, hh * .07), 0, 0, 7); ctx.fill();
  };
  switch (def.shape) {
    case 'cylinder': {
      box('paint', l, y, w, h);
      band('graphite', y + h * .1, Math.max(2, S * .08)); band('graphite', y1 - h * .1 - Math.max(2, S * .08), Math.max(2, S * .08));
      for (let yy = y + 1.6 * S; yy < y1 - .5 * S; yy += 1.6 * S) { ctx.fillStyle = 'rgba(20,30,50,.28)'; ctx.fillRect(l, yy, w, 1.3); }
      ctx.fillStyle = BASE.black; ctx.fillRect(l, mid - Math.min(h * .05, S * .12), w, Math.min(h * .1, S * .24));
      break;
    }
    case 'core': {
      box('graphite', l, y, w, h); band('steel', y + h * .1, h * .1); band('steel', y + h * .84, h * .08);
      ctx.save(); ctx.shadowColor = '#52d6ea'; ctx.shadowBlur = Math.min(14, S * .25); ctx.fillStyle = '#52d6ea'; ctx.beginPath(); ctx.ellipse(x, y + h * .53, w * .2, h * .15, 0, 0, 7); ctx.fill(); ctx.restore();
      break;
    }
    case 'ogive': {
      ctx.fillStyle = barrel(ctx, l, w, BASE.paint); ctx.beginPath(); ctx.moveTo(l, y1); ctx.lineTo(l, y + h * .5);
      ctx.bezierCurveTo(l, y + h * .16, x - w * .2, y + h * .02, x, y); ctx.bezierCurveTo(x + w * .2, y + h * .02, r, y + h * .16, r, y + h * .5); ctx.lineTo(r, y1); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = BASE.black; ctx.fillRect(l, y1 - h * .13, w, h * .13); ctx.strokeRect(l, y1 - h * .13, w, h * .13);
      ctx.strokeStyle = 'rgba(45,55,70,.72)'; ctx.lineWidth = Math.max(1, S / 42); ctx.beginPath(); ctx.moveTo(x, y + h * .08); ctx.lineTo(x, y1 - h * .13); ctx.moveTo(l + w * .28, y + h * .2); ctx.lineTo(l + w * .28, y1 - h * .13); ctx.moveTo(r - w * .28, y + h * .2); ctx.lineTo(r - w * .28, y1 - h * .13); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.36)'; ctx.lineWidth = Math.max(1, S / 55); ctx.beginPath(); ctx.moveTo(l + w * .12, y + h * .25); ctx.lineTo(l + w * .12, y1 - h * .17); ctx.moveTo(r - w * .12, y + h * .25); ctx.lineTo(r - w * .12, y1 - h * .17); ctx.stroke();
      break;
    }
    case 'satellite': {
      const pw = w * .78, ph = h * .26;
      for (const s of [-1, 1]) {
        const a = s > 0 ? r + 3 : l - 3 - pw; ctx.fillStyle = BASE.panel; ctx.fillRect(a, mid - ph / 2, pw, ph); ctx.strokeRect(a, mid - ph / 2, pw, ph);
        ctx.strokeStyle = 'rgba(150,185,255,.55)'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 1; i < 5; i++) { ctx.moveTo(a + pw * i / 5, mid - ph / 2); ctx.lineTo(a + pw * i / 5, mid + ph / 2); } ctx.moveTo(a, mid); ctx.lineTo(a + pw, mid); ctx.stroke();
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, Math.min(1.7, S / 28));
      }
      box('gold', l + w * .06, y, w * .88, h); band('graphite', y + h * .08, h * .08, l + w * .06, w * .88);
      ctx.fillStyle = barrel(ctx, x - w * .18, w * .36, BASE.steel); ctx.beginPath(); ctx.ellipse(x, y, w * .18, h * .09, 0, Math.PI, 0); ctx.fill(); ctx.stroke();
      break;
    }
    case 'taper': {
      const tw = (def.shapeTopD ?? def.topD ?? 0) * S; ctx.fillStyle = barrel(ctx, l, w, BASE.steel); ctx.beginPath(); ctx.moveTo(x - tw / 2, y); ctx.lineTo(x + tw / 2, y); ctx.lineTo(r, y1); ctx.lineTo(l, y1); ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    }
    case 'ring': {
      box('amber', l - 2, y, w + 4, h);
      ctx.fillStyle = 'rgba(10,14,22,.55)'; for (let i = 1; i < 8; i++) ctx.fillRect(l - 2 + (w + 4) * i / 8 - .6, y, 1.2, h);
      break;
    }
    case 'nozzle': case 'nozzle_long': {
      const k = def.shape === 'nozzle' ? .3 : .22; box('graphite', x - w * .25, y, w * .5, h * k); bell(x, w * .84, y + h * k, h * (1 - k));
      break;
    }
    case 'cluster': {
      box('graphite', l, y, w, h * .2); for (const o of [-.34, 0, .34]) bell(x + o * w, w * .37, y + h * .2, h * .8);
      break;
    }
    case 'srb': {
      box('paint', l, y, w, h); band('red', y + h * .74, h * .06);
      ctx.fillStyle = barrel(ctx, l, w, BASE.red); ctx.beginPath(); ctx.moveTo(l, y + h * .2); ctx.bezierCurveTo(l, y + h * .06, x - w * .2, y, x, y - 2); ctx.bezierCurveTo(x + w * .2, y, r, y + h * .06, r, y + h * .2); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = barrel(ctx, x - w * .45, w * .9, BASE.graphite); ctx.beginPath(); ctx.moveTo(x - w * .25, y1); ctx.lineTo(x + w * .25, y1); ctx.lineTo(x + w * .45, y1 + 7); ctx.lineTo(x - w * .45, y1 + 7); ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    }
    case 'clamp': {
      box('graphite', l, y, w, h); band('amber', y + h * .16, h * .2); band('black', y + h * .74, h * .08);
      ctx.fillStyle = barrel(ctx, l - w * .14, w * 1.28, BASE.steel); ctx.fillRect(l - w * .14, y + h * .44, w * 1.28, h * .12); ctx.strokeRect(l - w * .14, y + h * .44, w * 1.28, h * .12);
      break;
    }
    case 'legs': {
      const drop = (def.landing?.drop || 0) * S, hostEdge = x - dir * (w / 2 + .03 * S), foot = x + dir * w * .9;
      ctx.strokeStyle = BASE.steel; ctx.lineWidth = Math.max(2, S * .06); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(hostEdge, y); ctx.lineTo(foot, y1 + drop); ctx.stroke();
      ctx.strokeStyle = BASE.graphite; ctx.lineWidth = Math.max(1.5, S * .035); ctx.beginPath(); ctx.moveTo(hostEdge, y + h * .75); ctx.lineTo(foot, y1 + drop); ctx.stroke();
      ctx.fillStyle = BASE.graphite; ctx.fillRect(foot - S * .15, y1 + drop - 2, S * .3, 4);
      break;
    }
    default: box('paint', l, y, w, h);
  }
  ctx.restore();
}

function extent(def) {
  if (def.radial) return [def.diameter * 3.4, def.height + (def.landing?.drop || 0) + .15, 0];
  if (def.shape === 'satellite') return [def.diameter * 2.5, def.height, 0];
  return [def.diameter * 1.1, def.height, 0];
}

export function drawIcon(canvas, def, { w = 96, h = 80, pad = 6, cap = 44 } = {}) {
  const d = Math.min(window.devicePixelRatio || 1, 2); canvas.width = w * d; canvas.height = h * d; canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d'); ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, w, h);
    const image = assets.partImage(def, () => drawIcon(canvas, def, { w, h, pad, cap }));
  if (!image && assets.hasPartImage(def)) return;   
  if (image) {
    const a = assets.artBox(image), scale = Math.min((w - pad * 2) / a.sw, (h - pad * 2) / a.sh);
    const iw = a.sw * scale, ih = a.sh * scale;
    ctx.drawImage(image, a.sx, a.sy, a.sw, a.sh, (w - iw) / 2, (h - ih) / 2, iw, ih);
    return;
  }
  const [ew, eh] = extent(def), S = Math.min(def.diameter < .5 ? Math.max(cap, 76) : cap, (w - pad * 2) / ew, (h - pad * 2) / eh), top = (h - eh * S) / 2 + (def.radial ? 0 : 0);
  if (def.radial) { const off = def.diameter * S * 1.05; for (const dir of [-1, 1]) paintPart(ctx, def, { x: w / 2 + dir * off, y: top, S, dir }); }
  else paintPart(ctx, def, { x: w / 2, y: top, S });
}
