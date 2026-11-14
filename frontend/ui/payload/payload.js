import { state, mission as missionById } from '../../js/core/store.js';
import { h, bus, toast, ask } from '../../js/core/bus.js';
import { fmtMoney, fmtMoneyShort } from '../shared/format.js';
import { paintPart as paintRocketPart } from '../shared/partArt.js';



const STORAGE_KEY = 'missionforge.payloadDesign';
const SCHEMA = 2;
const clone = v => JSON.parse(JSON.stringify(v));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DRAG_PX = 6, SNAP_PX = 96;
const USABLE = 0.892;         
const ECLIPSE_MIN = 35;      
const STUB = 0.42;            
const MOUNT_LABEL = { adapter: 'Adapter', bus: 'Bus', internal: 'Inside bus', top: 'Top mount', side: 'Side mount', wing: 'Solar wing' };
const BASE = { paint: '#e9edf4', graphite: '#4b5666', steel: '#9ca7b8', amber: '#f2a63a', gold: '#d9aa45', black: '#12171f', panel: '#24418a', copper: '#c9824a', red: '#d4503a' };
const INK = 'rgba(4,9,20,.92)';
const kg = v => `${v >= 100 ? Math.round(v) : v >= 10 ? v.toFixed(1) : v.toFixed(2).replace(/0$/, '')} kg`;
const mt = v => `${v.toFixed(2)} m`;
const pw = v => `${Math.round(v).toLocaleString('en')} W`;
const countOf = (def, p) => (def.mount === 'side' || def.mount === 'wing') && !p.dir ? 2 : 1;


const mk = (c, extra = {}) => ({ c, ...extra });
const PRESETS = [
  { name: 'CubeSat 12U Demo', blurb: '12U technology demonstrator', fairing: 'FAIR-01', parts: [mk('ADP-12'), mk('BUS-12U'), mk('FC-1'), mk('TX-S'), mk('BAT-1'), mk('IMU-1'), mk('ANT-1'), mk('SA-0', { dir: 0 })] },
  { name: 'Earth Observer', blurb: 'Microsat with camera and star tracker', fairing: 'FAIR-06', parts: [mk('ADP-37'), mk('BUS-S'), mk('FC-1'), mk('TX-S'), mk('BAT-2'), mk('IMU-1'), mk('RW-1'), mk('ANT-1'), mk('SA-1', { dir: 0 }), mk('CAM-1', { dir: -1, row: 1 }), mk('ST-1', { dir: 1, row: 0 })] },
  { name: 'Deep-space Probe', blurb: 'Large science probe with 2 m dish', fairing: 'FAIR-MORE', parts: [mk('ADP-66'), mk('BUS-L'), mk('FC-2'), mk('REC-1'), mk('TX-X'), mk('BAT-2'), mk('BAT-2'), mk('IMU-1'), mk('RW-1'), mk('ANT-4'), mk('SA-2', { dir: 0 }), mk('CAM-2', { dir: 1, row: 0 }), mk('ST-1', { dir: 1, row: 2 }), mk('SPC-1', { dir: -1, row: 0 }), mk('RCS-1', { dir: -1, row: 2 })] },
];


const profile = (f, y) => {  
  if (y <= f.cylH) return 1; if (y >= f.H) return 0; const L = f.H - f.cylH, R = f.D / 2, rho = (R * R + L * L) / (2 * R), x = y - f.cylH;
  return Math.max(0, (Math.sqrt(Math.max(0, rho * rho - x * x)) + R - rho) / R);
};
const outerR = (f, y) => profile(f, y) * f.D / 2;
const usableR = (f, y) => profile(f, y) * f.D / 2 * USABLE;
const fairingFromDef = (def, extraCyl = 0, source = 'catalogue') => ({ id: def.id, name: def.name, code: def.name.split(' ')[0], D: def.diameter, H: def.height + extraCyl, cylH: def.height - Math.min(def.height * .65, 1.1 * def.diameter) + extraCyl, source });
const nextUid = design => 'q' + (design.parts.reduce((m, p) => Math.max(m, +String(p.uid).slice(1) || 0), 0) + 1);

function layoutOf(design, byId) {
  const list = design.parts.map(p => ({ p, d: byId[p.c] })).filter(x => x.d);
  const pick = m => list.filter(x => x.d.mount === m);
  const adapter = pick('adapter')[0], busPart = pick('bus')[0], top = pick('top')[0];
  const items = [], L = { items, adapter, bus: busPart, top, modules: pick('internal'), busY: 0, busTop: 0, width: 0, height: 0 };
  const add = (x, side, cx, y0, y1, w, extra = {}) => { const it = { uid: x.p.uid, p: x.p, def: x.d, side, cx, y0, y1, w, x0: cx - w / 2, x1: cx + w / 2, ...extra }; items.push(it); return it; };
  let y = 0;
  if (adapter) { add(adapter, 0, 0, 0, adapter.d.h, adapter.d.w); y = adapter.d.h; }
  L.busY = y;
  if (busPart) {
    const bw = busPart.d.w, bh = busPart.d.h; L.busTop = y + bh;
    const wingW = { '-1': 0, '1': 0 };
    for (const x of pick('wing')) for (const s of (x.p.dir ? [x.p.dir] : [-1, 1])) { wingW[s] = x.d.w; add(x, s, s * (bw / 2 + x.d.w / 2), y + bh / 2 - x.d.h / 2, y + bh / 2 + x.d.h / 2, x.d.w, { edge: s * bw / 2, yMid: y + bh / 2 }); }
    add(busPart, 0, 0, y, y + bh, bw);
    const rowH = bh / busPart.d.rows;
    for (const x of pick('side')) {
      const span = x.d.rows || 1, row = x.p.row || 0, yc = y + (row + span / 2) * rowH;
      for (const s of (x.p.dir ? [x.p.dir] : [-1, 1])) { const inner = bw / 2 + wingW[s] + (wingW[s] ? .012 : 0); add(x, s, s * (inner + x.d.w / 2 + .008), yc - x.d.h / 2, yc + x.d.h / 2, x.d.w, { edge: s * inner, yMid: yc }); }
    }
    if (top) add(top, 0, 0, L.busTop, L.busTop + top.d.h, top.d.w);
  }
  for (const it of items) { L.width = Math.max(L.width, 2 * Math.max(Math.abs(it.x0), Math.abs(it.x1))); L.height = Math.max(L.height, it.y1); }
  return L;
}

function structureError(design, byId) {
  const list = design.parts.map(p => ({ p, d: byId[p.c] })).filter(x => x.d), by = m => list.filter(x => x.d.mount === m);
  if (by('adapter').length > 1) return 'A spacecraft has only one payload adapter.';
  if (by('bus').length > 1) return 'A spacecraft has only one bus.';
  if (by('top').length > 1) return 'The top of the bus already carries a part.';
  const bus = by('bus')[0]?.d, adapter = by('adapter')[0]?.d;
  if (!bus) return list.some(x => ['internal', 'top', 'side', 'wing'].includes(x.d.mount)) ? 'Add a bus first: everything else mounts on it.' : null;
  if (adapter && bus.w > adapter.w * 1.15) return `${bus.name} (${mt(bus.w)}) is wider than the ${adapter.name} ring (${mt(adapter.w)}).`;
  const used = by('internal').reduce((s, x) => s + x.d.bays, 0);
  if (used > bus.bays) return `${bus.name} has ${bus.bays} avionics ${bus.bays === 1 ? 'bay' : 'bays'}; these modules need ${used}.`;
  const top = by('top')[0]?.d; if (top && top.w > bus.w * 1.3) return `${top.name} is too wide to sit on ${bus.name}.`;
  const occ = { '-1': new Set(), '1': new Set() }, wings = { '-1': 0, '1': 0 };
  for (const x of by('wing')) for (const s of (x.p.dir ? [x.p.dir] : [-1, 1])) if (++wings[s] > 1) return 'Only one solar wing fits on each side.';
  for (const x of by('side')) {
    const span = x.d.rows || 1, row = x.p.row || 0;
    if (row < 0 || row + span > bus.rows) return `${x.d.name} needs ${span} side ${span === 1 ? 'row' : 'rows'}; ${bus.name} has ${bus.rows}.`;
    for (const s of (x.p.dir ? [x.p.dir] : [-1, 1])) for (let r = row; r < row + span; r++) { if (occ[s].has(r)) return `That side row on the ${s < 0 ? 'left' : 'right'} is already used.`; occ[s].add(r); }
  }
  return null;
}

function fitCheck(L, f) {
  if (!f || !L.items.length) return { has: false, ok: true, bad: new Set(), minClear: null, worst: null };
  let minClear = Infinity, worst = null; const bad = new Set();
  for (const it of L.items) {
    const far = Math.max(Math.abs(it.x0), Math.abs(it.x1)), clear = usableR(f, it.y1) - far;
    if (clear < minClear) { minClear = clear; worst = it; }
    if (clear < 0) bad.add(it.uid);
  }
  return { has: true, ok: minClear >= 0, tight: minClear >= 0 && minClear < .02, bad, minClear, worst };
}

function statsOf(design, L, byId) {
  const s = { count: 0, mass: 0, mounted: 0, cost: 0, draw: 0, gen: 0, wh: 0, bays: 0, baysUsed: 0 };
  for (const p of design.parts) {
    const d = byId[p.c]; if (!d) continue; const n = countOf(d, p);
    s.count += n; s.mass += d.mass * n; s.cost += d.cost * n; s.draw += (d.draw || 0) * n; s.gen += (d.gen || 0) * n; s.wh += (d.wh || 0) * n;
    if (d.mount !== 'adapter' && d.mount !== 'bus') s.mounted += d.mass * n;
    if (d.mount === 'internal') s.baysUsed += d.bays;
  }
  s.bays = L.bus?.d.bays || 0; s.net = s.gen - s.draw;
  s.eclipseMin = s.draw > 0 ? s.wh * .8 / s.draw * 60 : Infinity;
  return s;
}

function checksOf(design, L, byId, st, fit) {
  const errors = [], warnings = []; const has = fn => design.parts.some(p => byId[p.c] && fn(byId[p.c]));
  if (!design.parts.length) return { errors, warnings };
  if (!L.bus) errors.push('No bus. Add a bus to carry the spacecraft systems.');
  if (!L.adapter) errors.push('No payload adapter. The spacecraft cannot attach to the rocket.');
  if (fit.has && !fit.ok) errors.push(`${fit.worst.def.name.split(' ')[0]} does not fit the fairing (${Math.abs(fit.minClear * 100).toFixed(0)} cm over).`);
  if (L.bus) {
    if (!has(d => d.id.startsWith('FC-'))) warnings.push('No flight computer: the spacecraft cannot command itself.');
    if (st.gen <= 0) warnings.push('No power source: only batteries will run the spacecraft.');
    else if (st.net < 0) warnings.push(`Power draw (${pw(st.draw)}) exceeds generation (${pw(st.gen)}).`);
    if (st.wh <= 0 && st.gen > 0) warnings.push('No battery: the spacecraft loses power in eclipse.');
    else if (st.wh > 0 && st.draw > 0 && st.eclipseMin < ECLIPSE_MIN) warnings.push(`Battery lasts ${Math.floor(st.eclipseMin)} min; a low-orbit eclipse can last ${ECLIPSE_MIN} min.`);
    if (!has(d => d.id.startsWith('TX-') || d.id.startsWith('ANT-'))) warnings.push('No communications: nothing can reach the ground.');
    else if (!has(d => d.id.startsWith('TX-'))) warnings.push('Antenna without a transceiver: add a transceiver module.');
    if (st.mounted > L.bus.d.capacity) warnings.push(`Mounted mass (${kg(st.mounted)}) exceeds the bus capacity of ${kg(L.bus.d.capacity)}.`);
  }
  if (L.adapter && st.mass > L.adapter.d.maxMass) warnings.push(`Total mass (${kg(st.mass)}) exceeds the adapter limit of ${kg(L.adapter.d.maxMass)}.`);
  return { errors, warnings };
}

/* ── Drawing: procedural spacecraft art ─────────────────────────────────── */
function shade(hex, a) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255, f = a < 0 ? c => c * (1 + a) : c => c + (255 - c) * a;
  return `rgb(${Math.round(f(r))},${Math.round(f(g))},${Math.round(f(b))})`;
}
function barrel(ctx, l, w, base) {
  base = BASE[base] || base; const g = ctx.createLinearGradient(l, 0, l + w, 0);
  g.addColorStop(0, shade(base, -.42)); g.addColorStop(.22, shade(base, .1)); g.addColorStop(.45, shade(base, .02)); g.addColorStop(1, shade(base, -.52)); return g;
}
function busCells(def, x, y, S) {
  const w = def.w * S, hh = def.h * S, l = x - w / 2, t = y - hh, mx = w * .15, wl = l + mx, wt = t + hh * .09, ww = w - mx * 2, wh = hh * .82;
  const n = def.bays, cols = clamp(Math.round(Math.sqrt(n * ww / wh)), 1, n), rows = Math.ceil(n / cols), gap = Math.max(1.5, S * .01), cw = (ww - gap * (cols + 1)) / cols, ch = (wh - gap * (rows + 1)) / rows;
  const cells = []; for (let i = 0; i < n; i++) { const c = i % cols, r = Math.floor(i / cols); cells.push({ i, x0: wl + gap + c * (cw + gap), y0: wt + gap + r * (ch + gap), x1: wl + gap + c * (cw + gap) + cw, y1: wt + gap + r * (ch + gap) + ch }); }
  return { win: { x0: wl, y0: wt, x1: wl + ww, y1: wt + wh }, cells };
}
function paintBus(ctx, def, { x, y, S }, modules = [], selUid = null) {
  const w = def.w * S, hh = def.h * S, l = x - w / 2, t = y - hh, r = x + w / 2;
  ctx.save(); ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, Math.min(1.6, S / 70));
  ctx.fillStyle = barrel(ctx, l, w, 'gold'); ctx.fillRect(l, t, w, hh);
  ctx.save(); ctx.beginPath(); ctx.rect(l, t, w, hh); ctx.clip(); ctx.strokeStyle = 'rgba(255,240,190,.17)'; ctx.lineWidth = Math.max(1, S * .008);
  for (let i = -hh; i < w + hh; i += Math.max(7, S * .075)) { ctx.beginPath(); ctx.moveTo(l + i, t); ctx.lineTo(l + i - hh * .5, t + hh); ctx.stroke(); } ctx.restore();
  ctx.fillStyle = barrel(ctx, l, w, 'graphite'); const e = Math.max(3, w * .05); ctx.fillRect(l, t, e, hh); ctx.fillRect(r - e, t, e, hh); ctx.fillRect(l, t, w, e * .8); ctx.fillRect(l, y - e * .8, w, e * .8);
  ctx.strokeRect(l, t, w, hh);
  ctx.strokeStyle = 'rgba(20,24,34,.55)'; ctx.lineWidth = 1; for (let i = 1; i < def.rows; i++) { const yy = t + hh * i / def.rows; ctx.beginPath(); ctx.moveTo(l, yy); ctx.lineTo(l + e, yy); ctx.moveTo(r - e, yy); ctx.lineTo(r, yy); ctx.stroke(); }
  const { win, cells } = busCells(def, x, y, S);
  ctx.fillStyle = 'rgba(8,12,20,.94)'; ctx.beginPath(); ctx.roundRect(win.x0, win.y0, win.x1 - win.x0, win.y1 - win.y0, 3); ctx.fill(); ctx.strokeStyle = 'rgba(160,176,200,.5)'; ctx.stroke();
  let idx = 0; const hits = [];
  for (const m of modules) for (let k = 0; k < m.d.bays && idx < cells.length; k++, idx++) {
    const c = cells[idx]; ctx.fillStyle = shade(m.d.color || '#52d6ea', -.35); ctx.fillRect(c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0);
    ctx.fillStyle = m.d.color || '#52d6ea'; ctx.fillRect(c.x0 + 1.5, c.y0 + 1.5, c.x1 - c.x0 - 3, Math.max(2, (c.y1 - c.y0) * .2));
    if (k === 0 && (c.x1 - c.x0) > 22) { ctx.fillStyle = 'rgba(4,10,20,.92)'; ctx.font = `700 ${clamp((c.y1 - c.y0) * .34, 8, 12)}px Archivo, sans-serif`; ctx.textAlign = 'center'; ctx.fillText(m.d.id.split('-')[0], (c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2 + 5); }
    if (m.p.uid === selUid) { ctx.strokeStyle = '#52d6ea'; ctx.lineWidth = 2; ctx.strokeRect(c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0); }
    hits.push({ uid: m.p.uid, x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, inner: true });
  }
  ctx.strokeStyle = 'rgba(160,176,200,.35)'; ctx.lineWidth = 1; for (; idx < cells.length; idx++) { const c = cells[idx]; ctx.strokeRect(c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0); }
  ctx.restore(); return hits;
}
function paintPart(ctx, def, o) {
  const { x, y, S, stowed = true, dir = 1, alpha = 1 } = o, w = def.w * S, hh = def.h * S, l = x - w / 2, t = y - hh, r = x + w / 2, mid = y - hh / 2;
  ctx.save(); ctx.globalAlpha = alpha; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(1, Math.min(1.6, S / 70)); ctx.strokeStyle = INK;
  const box = (base, a, b, c, d) => { ctx.fillStyle = barrel(ctx, a, c, base); ctx.fillRect(a, b, c, d); ctx.strokeRect(a, b, c, d); };
  const ell = (cx, cy, rx, ry, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(.5, rx), Math.max(.5, ry), 0, 0, 7); ctx.fill(); };
  switch (def.shape) {
    case 'adapter': {
      const tw = w * .86; ctx.fillStyle = barrel(ctx, l, w, 'steel'); ctx.beginPath(); ctx.moveTo(l, y); ctx.lineTo(r, y); ctx.lineTo(x + tw / 2, t); ctx.lineTo(x - tw / 2, t); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = BASE.amber; ctx.fillRect(x - tw / 2 - 1, t, tw + 2, Math.max(2.5, hh * .2)); ctx.strokeRect(x - tw / 2 - 1, t, tw + 2, Math.max(2.5, hh * .2));
      ctx.fillStyle = 'rgba(8,12,20,.7)'; for (let i = 1; i < 9; i++) ctx.fillRect(l + w * i / 9 - 1, y - hh * .35, 2, hh * .22); break;
    }
    case 'module': {
      ctx.fillStyle = shade(def.color || '#52d6ea', -.4); ctx.beginPath(); ctx.roundRect(l, t, w, hh, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = def.color || '#52d6ea'; ctx.fillRect(l + 2, t + 2, w - 4, Math.max(2, hh * .22)); ctx.fillStyle = 'rgba(255,255,255,.28)'; for (let i = 0; i < 3; i++) ctx.fillRect(l + w * .16, t + hh * (.46 + i * .17), w * .68, Math.max(1, hh * .06)); break;
    }
    case 'omni': {
      box('steel', x - w * .3, y - hh * .22, w * .6, hh * .22);
      ctx.fillStyle = barrel(ctx, x - w * .36, w * .72, 'paint'); ctx.beginPath(); ctx.moveTo(x - w * .34, y - hh * .22); ctx.lineTo(x - w * .05, t + hh * .06); ctx.lineTo(x + w * .05, t + hh * .06); ctx.lineTo(x + w * .34, y - hh * .22); ctx.closePath(); ctx.fill(); ctx.stroke();
      ell(x, t + hh * .05, w * .09, w * .09, BASE.gold); break;
    }
    case 'dish': {
      if (stowed) {
        box('paint', l, t + hh * .12, w, hh * .88);
        ctx.fillStyle = barrel(ctx, l, w, 'steel'); ctx.beginPath(); ctx.moveTo(l, t + hh * .12); ctx.lineTo(x, t); ctx.lineTo(r, t + hh * .12); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(40,52,70,.55)'; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(l + w * i / 4, t + hh * .14); ctx.lineTo(l + w * i / 4, y - 2); ctx.stroke(); }
      } else {
        const D = def.deployedW * S, mastH = hh * .5, ty = y - mastH; ctx.fillStyle = barrel(ctx, x - 3, 6, 'steel'); ctx.fillRect(x - Math.max(2, S * .02), ty, Math.max(4, S * .04), mastH);
        ctx.fillStyle = barrel(ctx, x - D / 2, D, 'steel'); ctx.beginPath(); ctx.moveTo(x - D / 2, ty); ctx.quadraticCurveTo(x, ty + D * .5, x + D / 2, ty); ctx.closePath(); ctx.fill(); ctx.stroke();
        const g = ctx.createRadialGradient(x, ty, 2, x, ty, D / 2); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#b9c4d4'); ell(x, ty, D / 2, D * .07, g); ctx.beginPath(); ctx.ellipse(x, ty, D / 2, D * .07, 0, 0, 7); ctx.stroke();
        ctx.strokeStyle = 'rgba(40,52,70,.8)'; ctx.beginPath(); ctx.moveTo(x - D * .42, ty - D * .02); ctx.lineTo(x, ty - D * .3); ctx.lineTo(x + D * .42, ty - D * .02); ctx.stroke(); box('graphite', x - D * .03, ty - D * .34, D * .06, D * .06);
      } break;
    }
    case 'horn': {
      ctx.fillStyle = barrel(ctx, l, w, 'paint'); const inn = dir < 0 ? r : l, out = dir < 0 ? l : r; ctx.beginPath(); ctx.moveTo(inn, mid - hh * .17); ctx.lineTo(out, t); ctx.lineTo(out, y); ctx.lineTo(inn, mid + hh * .17); ctx.closePath(); ctx.fill(); ctx.stroke();
      ell(out, mid, w * .07, hh * .46, '#1a2230'); break;
    }
    case 'tracker': {
      box('graphite', l, y - hh * .38, w, hh * .38); box('paint', x - w * .32, t, w * .64, hh * .66); ell(x, t + 1, w * .32, Math.max(1.5, hh * .035), '#0b1018'); break;
    }
    case 'tank': {
      ctx.fillStyle = barrel(ctx, l, w, 'steel'); ctx.beginPath(); ctx.roundRect(l, t, w, hh, w * .42); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(30,40,56,.5)'; for (const f of [.38, .62]) { ctx.beginPath(); ctx.moveTo(l + 1, t + hh * f); ctx.lineTo(r - 1, t + hh * f); ctx.stroke(); }
      ctx.fillStyle = BASE.black; const nub = Math.max(3, w * .12); for (const sx of [l - nub * .5, r - nub * .5]) for (const fy of [.12, .78]) ctx.fillRect(sx, t + hh * fy, nub, nub * 1.3); break;
    }
    case 'camera': {
      const tw = w * .76; box('graphite', x - w / 2, y - hh * .22, w, hh * .22); ctx.fillStyle = barrel(ctx, x - tw / 2, tw, 'paint'); ctx.fillRect(x - tw / 2, t + hh * .02, tw, hh * .78); ctx.strokeRect(x - tw / 2, t + hh * .02, tw, hh * .78);
      ctx.fillStyle = 'rgba(30,40,56,.45)'; if (hh / w > 1.6) for (const f of [.3, .55]) ctx.fillRect(x - tw / 2, t + hh * f, tw, Math.max(1.5, hh * .02));
      ctx.fillStyle = barrel(ctx, x - w / 2, w, 'graphite'); ctx.fillRect(x - w / 2, t, w, Math.max(3, hh * .06)); ell(x, t + 1, tw * .42, Math.max(1.5, tw * .07), '#080c14'); break;
    }
    case 'box': {
      box('graphite', l, t, w, hh); ctx.fillStyle = def.color || BASE.steel; ctx.fillRect(l + 2, t + 2, w - 4, Math.max(2.5, hh * .14));
      ctx.fillStyle = '#0c1220'; ctx.beginPath(); ctx.roundRect(l + w * .18, t + hh * .3, w * .64, hh * .46, 3); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(l + w * .22, t + hh * .34, w * .24, hh * .08); break;
    }
    case 'boom': {
      box('steel', l, t, w, hh); ctx.fillStyle = BASE.amber; ctx.fillRect(l, t + hh * .12, w, hh * .1);
      if (!stowed) { const len = def.deployedW * S, sx = dir < 0 ? l : r, ex = sx + dir * len, y0 = t + hh * .5; ctx.strokeStyle = BASE.steel; ctx.lineWidth = Math.max(2, S * .025); ctx.beginPath(); ctx.moveTo(sx, y0); ctx.lineTo(ex, y0); ctx.stroke(); ell(ex, y0, Math.max(3, S * .05), Math.max(3, S * .05), BASE.amber); }
      break;
    }
    case 'rtg': {
      const bw = w * .62; ctx.fillStyle = barrel(ctx, x - bw / 2, bw, 'graphite'); ctx.fillRect(x - bw / 2, t, bw, hh); ctx.strokeRect(x - bw / 2, t, bw, hh);
      for (let i = 0; i < 8; i++) { const fy = t + hh * (.06 + i * .115); ctx.fillStyle = barrel(ctx, l, w, 'steel'); ctx.fillRect(l, fy, w, hh * .055); ctx.strokeRect(l, fy, w, hh * .055); }
      ell(x, t, bw / 2, Math.max(2, hh * .03), BASE.copper); break;
    }
    case 'wing': {
      if (stowed) {
        ctx.fillStyle = barrel(ctx, l, w, BASE.panel); ctx.fillRect(l, t, w, hh); ctx.strokeRect(l, t, w, hh); ctx.strokeStyle = 'rgba(160,190,255,.45)'; ctx.lineWidth = 1;
        for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(l, t + hh * i / 6); ctx.lineTo(r, t + hh * i / 6); ctx.stroke(); }
      } else {
        const len = def.deployedW * S, n = def.deployedW > 2.5 ? 3 : 2, yoke = Math.min(len * .09, S * .14), pwid = (len - yoke) / n, ph = hh * .92, sx = dir < 0 ? r : l, py = mid - ph / 2;
        ctx.strokeStyle = BASE.steel; ctx.lineWidth = Math.max(2, S * .025); ctx.beginPath(); ctx.moveTo(sx, mid); ctx.lineTo(sx + dir * yoke, mid); ctx.stroke();
        for (let i = 0; i < n; i++) {
          const px = sx + dir * (yoke + i * pwid), a = Math.min(px, px + dir * (pwid - 2)), g = ctx.createLinearGradient(a, py, a, py + ph); g.addColorStop(0, '#2f56b8'); g.addColorStop(1, '#1b3272'); ctx.fillStyle = g; ctx.fillRect(a, py, pwid - 2, ph);
          ctx.strokeStyle = 'rgba(160,190,255,.4)'; ctx.lineWidth = 1; for (let c = 1; c < 4; c++) { ctx.beginPath(); ctx.moveTo(a + (pwid - 2) * c / 4, py); ctx.lineTo(a + (pwid - 2) * c / 4, py + ph); ctx.stroke(); } for (let c = 1; c < 6; c++) { ctx.beginPath(); ctx.moveTo(a, py + ph * c / 6); ctx.lineTo(a + pwid - 2, py + ph * c / 6); ctx.stroke(); }
          ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, Math.min(1.6, S / 70)); ctx.strokeRect(a, py, pwid - 2, ph);
        }
      } break;
    }
    default: box('paint', l, t, w, hh);
  }
  ctx.restore();
}
function extentOf(def) {
  if (def.shape === 'wing' || def.shape === 'boom') return { w: def.deployedW, h: def.h };
  if (def.shape === 'dish') return { w: def.deployedW, h: def.h * .5 + def.deployedW * .36 };
  return null;
}
function drawIcon(canvas, def, { w = 50, h = 56, pad = 4 } = {}) {
  const d = Math.min(window.devicePixelRatio || 1, 2); canvas.width = w * d; canvas.height = h * d; canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d'); ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, w, h);
  const dep = extentOf(def), ex = dep || { w: def.w, h: def.h }, S = Math.min((w - pad * 2) / ex.w, (h - pad * 2) / ex.h, 220), yb = (h + ex.h * S) / 2;
  if (def.shape === 'bus') paintBus(ctx, def, { x: w / 2, y: yb, S });
  else if (def.shape === 'wing' || def.shape === 'boom') paintPart(ctx, def, { x: w / 2 - ex.w * S / 2 + def.w * S / 2, y: yb, S, stowed: false, dir: 1 });
  else paintPart(ctx, def, { x: w / 2, y: yb, S, stowed: !dep });
}

/* ── The workshop view ──────────────────────────────────────────────────── */
const ICON = {
  undo: '<svg viewBox="0 0 24 24"><path d="M9 7 4 12l5 5M4 12h10a6 6 0 0 1 0 12" transform="translate(0 -3)" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  redo: '<svg viewBox="0 0 24 24"><path d="m15 7 5 5-5 5M20 12H10a6 6 0 0 0 0 12" transform="translate(0 -3)" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  fit: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  sym: '<svg viewBox="0 0 24 24"><path d="M12 3v18" stroke="currentColor" stroke-width="1.8" stroke-dasharray="2.5 2.5" fill="none"/><path d="M9 6 3 12l6 6zM15 6l6 6-6 6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  open: '<svg viewBox="0 0 24 24"><path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
const ico = k => h('span', { class: 'ico', html: ICON[k] });

export const payloadWorkshop = {
  catalogue: null, design: null, byId: {}, cat: 'structure', sel: null, hover: null, sym: true, deployed: false,
  hist: [], fut: [], drag: null, pressing: false, raf: 0, hits: [], fairingSpec: null, lastSaved: '',
  view: { k: 120, ox: 0, oy: 0, auto: true },

  mount(root) {
    this.root = root; root.innerHTML = '';
    this.name = h('input', { type: 'text', class: 'name', maxlength: 80, 'aria-label': 'Payload name', value: 'Untitled payload', onchange: () => { this.design.name = this.name.value.trim() || 'Untitled payload'; } });
    const top = h('div', { class: 'ws-top' },
      h('button', { class: 'brand', type: 'button', onclick: () => bus.emit('nav', 'menu'), title: 'Main menu' }, 'MissionForge'),
      h('span', { class: 'top-divider', 'aria-hidden': 'true' }), this.name,
      h('div', { class: 'ws-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => this.newDesign() }, 'New'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => this.save() }, 'Save'),
        h('button', { class: 'btn', type: 'button', onclick: () => this.openExamples() }, 'Examples'),
        h('button', { class: 'btn', type: 'button', onclick: () => this.applyToRocket() }, 'Use on rocket'),
        h('button', { class: 'btn', type: 'button', onclick: () => bus.emit('nav', 'workshop') }, 'Rocket editor')),
      h('div', { class: 'grow' }), h('span', { class: 'workspace-mode' }, 'Payload workshop'));
    this.canvas = h('canvas', { tabindex: 0, 'aria-label': 'Payload assembly area' });
    this.selbar = h('div', { class: 'ws-selbar', hidden: true });
    this.empty = h('div', { class: 'ws-empty' }, h('div', { class: 'big' }, 'Build your spacecraft'), h('div', { class: 'dim' }, 'Start with a payload adapter and a bus, then drag in avionics, antennas, instruments and solar wings.'), h('button', { class: 'btn', type: 'button', onclick: () => this.openExamples() }, 'Open an example spacecraft'));
    this.sheet = h('div', { class: 'ws-sheet' }, this.canvas, this.empty, this.selbar);
    this.rail = h('nav', { class: 'ws-rail', 'aria-label': 'Payload categories' });
    this.fly = h('div', { class: 'ws-fly open' });
    this.bar = h('div', { class: 'ws-bar' });
    this.pill = h('button', { class: 'ws-pill', type: 'button', hidden: true, onclick: () => this.toggleDrawer(true) });
    this.undoBtn = h('button', { class: 'round', title: 'Undo (Ctrl+Z)', 'aria-label': 'Undo', onclick: () => this.undo() }, ico('undo'));
    this.redoBtn = h('button', { class: 'round', title: 'Redo (Ctrl+Y)', 'aria-label': 'Redo', onclick: () => this.redo() }, ico('redo'));
    this.fitBtn = h('button', { class: 'round', title: 'Fit to screen (F)', 'aria-label': 'Fit to screen', onclick: () => { this.view.auto = true; this.invalidate(); } }, ico('fit'));
    this.tools = h('div', { class: 'ws-tools' }, this.fitBtn, this.redoBtn, this.undoBtn);
    this.symBtn = h('button', { class: 'chip', type: 'button', onclick: () => this.setMode('sym') }, ico('sym'), h('span', {}, 'Symmetry'));
    this.depBtn = h('button', { class: 'chip', type: 'button', onclick: () => this.setMode('deployed') }, ico('open'), h('span', {}, 'Deployed view'));
    this.modes = h('div', { class: 'ws-modes', role: 'group', 'aria-label': 'View options' }, this.symBtn, this.depBtn);
    this.fitCard = h('section', { class: 'pl-fit', 'aria-label': 'Fairing fit' });
    this.bin = h('div', { class: 'ws-bin', 'aria-hidden': 'true' }, ico('trash'), h('span', {}, 'Drop here to remove'));
    this.info = h('aside', { class: 'ws-info', 'aria-label': 'Payload details' });
    root.append(this.sheet, top, this.rail, this.fly, this.pill, this.bar, this.tools, this.modes, this.fitCard, this.bin, this.info);
    this.renderModes();

    this.canvas.addEventListener('pointerdown', e => this.canvasDown(e));
    this.canvas.addEventListener('pointermove', e => { if (this.drag || this.pressing) return; const r = this.canvas.getBoundingClientRect(), u = this.hit(e.clientX - r.left, e.clientY - r.top); if (u !== this.hover) { this.hover = u; this.canvas.style.cursor = u ? 'grab' : ''; this.invalidate(); } });
    this.canvas.addEventListener('pointerleave', () => { if (this.hover) { this.hover = null; this.invalidate(); } });
    this.canvas.addEventListener('wheel', e => this.wheel(e), { passive: false });
    this.canvas.addEventListener('dblclick', () => { this.view.auto = true; this.invalidate(); });
    new ResizeObserver(() => this.invalidate()).observe(this.sheet);
    window.addEventListener('keydown', e => this.key(e));
    this.ready = this.loadCatalogue();
  },

  async loadCatalogue() {
    try {
      const response = await fetch('/data/payloads/catalogue.json'); if (!response.ok) throw new Error('Payload catalogue unavailable.');
      const data = await response.json(); if (data.schema !== SCHEMA) throw new Error('Payload catalogue is out of date (expected schema 2).');
      this.catalogue = data; this.byId = Object.fromEntries(data.components.map(c => [c.id, c]));
      this.design = this.readDesign(); this.lastSaved = JSON.stringify(state.blueprint?.payload || null);
      this.name.value = this.design.name; this.renderRail(); this.renderFly(); this.refresh();
    } catch (error) { this.sheet.append(h('div', { class: 'pl-error' }, error.message)); }
  },
  blank() { return { schema: SCHEMA, name: 'Untitled payload', fairing: { mode: 'rocket', id: null }, parts: [] }; },
  readDesign() {
    const ok = d => d?.schema === SCHEMA && Array.isArray(d.parts) && d.parts.every(p => this.byId[p.c]) && !structureError(d, this.byId);
    const fromBp = state.blueprint?.payload; if (ok(fromBp)) return clone(fromBp);
    try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); if (ok(saved)) return saved; } catch { }
    return this.blank();
  },

  /* ── rocket + fairing ── */
  fairingList() { return (state.catalog?.list() || []).filter(d => (d.category === 'fairing' && d.topD == null) || d.id === 'fairing_nosecone').sort((a, b) => a.diameter - b.diameter || a.height - b.height); },
  rocketFairing() {
    const bp = state.blueprint, cat = state.catalog; if (!bp?.parts?.length || !cat) return null;
    const isNose = d => d && (d.id === 'fairing_nosecone' || (d.category === 'fairing' && d.topD == null));
    const nose = bp.parts.find(p => isNose(cat.component(p.c))); if (!nose) return null;
    let extra = 0, cur = nose;
    for (let i = 0; i < 8; i++) { const next = bp.parts.find(p => p.parent === cur.uid && p.mount === 'below'), d = next && cat.component(next.c); if (!d || d.category !== 'fairing') break; extra += d.height; cur = next; }
    return fairingFromDef(cat.component(nose.c), extra, 'rocket');
  },
  rocketBelow() {   // the real rocket part the fairing sits on, drawn under the payload so it looks like the rocket
    const bp = state.blueprint, cat = state.catalog; if (!bp?.parts?.length || !cat) return null;
    const isNose = d => d && (d.id === 'fairing_nosecone' || (d.category === 'fairing' && d.topD == null)), nose = bp.parts.find(p => isNose(cat.component(p.c))); if (!nose) return null;
    let cur = nose;
    for (let i = 0; i < 12; i++) { const next = bp.parts.find(p => p.parent === cur.uid && p.mount === 'below'); if (!next) return null; const d = cat.component(next.c); if (d && d.category !== 'fairing' && !d.payload) return d; cur = next; }
    return null;
  },
  resolveFairing(L) {
    const f = this.design.fairing || { mode: 'auto' };
    if (f.mode === 'none') return null;
    if (f.mode === 'rocket') { const r = this.rocketFairing(); if (r) return r; }
    if (f.mode === 'catalogue' && f.id) { const d = this.fairingList().find(x => x.id === f.id); if (d) return fairingFromDef(d); }
    const list = this.fairingList().map(d => fairingFromDef(d)); if (!list.length) return null;
    return list.find(x => fitCheck(L, x).ok) || list[list.length - 1];
  },

  /* ── model operations ── */
  commit(design, sel) { this.pushHist(this.design); this.design = design; if (sel !== undefined) this.sel = sel; if (this.sel && !design.parts.some(p => p.uid === this.sel)) this.sel = null; this.refresh(); },
  pushHist(d) { this.hist.push(clone(d)); if (this.hist.length > 100) this.hist.shift(); this.fut = []; this.renderTools(); },
  undo() { const e = this.hist.pop(); if (!e) return; this.fut.push(clone(this.design)); this.design = e; this.sel = null; this.refresh(); },
  redo() { const e = this.fut.pop(); if (!e) return; this.hist.push(clone(this.design)); this.design = e; this.sel = null; this.refresh(); },
  removeFrom(design, uid) {
    const next = clone(design), p = next.parts.find(q => q.uid === uid); if (!p) return { design: next, notes: [] }; const def = this.byId[p.c], notes = [];
    if (def.mount === 'bus') { const n = next.parts.filter(q => !['adapter', 'bus'].includes(this.byId[q.c].mount)).length; if (n) notes.push('Everything mounted on the bus was removed too.'); next.parts = next.parts.filter(q => this.byId[q.c].mount === 'adapter'); }
    else next.parts = next.parts.filter(q => q.uid !== uid);
    return { design: next, notes };
  },
  remove() { if (!this.sel) return; const { design, notes } = this.removeFrom(this.design, this.sel); notes.forEach(n => toast(n, 'warn')); this.commit(design, null); },
  rowEdit(p, dlt) {
    const next = clone(this.design), q = next.parts.find(x => x.uid === p.uid); q.row = (q.row || 0) + dlt; const err = structureError(next, this.byId);
    if (err) { toast(err, 'warn', 3200); return; } this.commit(next, p.uid);
  },

  /** Every place a part could go, each with the resulting design and why it is allowed or refused. */
  targetsFor(def, sym, base) {
    const L = layoutOf(base, this.byId), out = [], bus = L.bus?.d; const make = (t, edit) => {
      const cand = clone(base), part = { uid: nextUid(base), c: def.id }; edit(cand, part); cand.parts.push(part);
      const error = structureError(cand, this.byId); out.push({ ...t, ok: !error, error, design: cand, uid: part.uid });
    };
    const dropOld = (cand, m) => { cand.parts = cand.parts.filter(q => this.byId[q.c].mount !== m); };
    if (def.mount === 'adapter') { make({ nodes: [{ x: 0, y: 0 }] }, c => dropOld(c, 'adapter')); return out; }
    if (def.mount === 'bus') { make({ nodes: [{ x: 0, y: L.busY }] }, c => dropOld(c, 'bus')); return out; }
    if (!bus) { out.push({ nodes: [{ x: 0, y: .3 }], ok: false, error: 'Add a bus first: everything else mounts on it.', design: base, uid: null }); return out; }
    const yMid = L.busY + bus.h / 2, e = bus.w / 2;
    if (def.mount === 'internal') make({ nodes: [{ x: 0, y: yMid }] }, () => { });
    else if (def.mount === 'top') make({ nodes: [{ x: 0, y: L.busTop }] }, () => { });
    else if (def.mount === 'wing') { if (sym) make({ nodes: [{ x: -e, y: yMid }, { x: e, y: yMid }] }, (c, p) => { p.dir = 0; }); else for (const dir of [-1, 1]) make({ nodes: [{ x: dir * e, y: yMid }] }, (c, p) => { p.dir = dir; }); }
    else if (def.mount === 'side') {
      const span = def.rows || 1, rowH = bus.h / bus.rows;
      for (let row = 0; row <= bus.rows - span; row++) { const y = L.busY + (row + span / 2) * rowH; if (sym) make({ nodes: [{ x: -e, y }, { x: e, y }] }, (c, p) => { p.dir = 0; p.row = row; }); else for (const dir of [-1, 1]) make({ nodes: [{ x: dir * e, y }] }, (c, p) => { p.dir = dir; p.row = row; }); }
      if (span > bus.rows) out.push({ nodes: [{ x: 0, y: yMid }], ok: false, error: `${def.name} needs ${span} side rows; ${bus.name} has ${bus.rows}.`, design: base, uid: null });
    }
    return out;
  },
  pickTarget(targets, wx, wy, maxDist) {
    let best = null, bd = maxDist; for (const t of targets) for (const n of t.nodes) { const d = Math.hypot(n.x - wx, n.y - wy); if (d < bd) { bd = d; best = t; } } return best;
  },
  quickAdd(def) {
    const targets = this.targetsFor(def, this.sym, this.design), t = targets.find(q => q.ok);
    if (!t) { toast(targets[0]?.error || 'That part cannot be placed.', 'warn', 4200); return; }
    this.commit(t.design, t.uid);
  },

  /* ── UI state ── */
  setMode(k) { this[k] = !this[k]; this.renderModes(); if (k === 'sym') this.renderFly(); this.view.auto = true; this.invalidate(); },
  renderModes() { for (const [b, on, tip] of [[this.symBtn, this.sym, 'Symmetry (M): side parts and wings are placed as mirrored pairs'], [this.depBtn, this.deployed, 'Deployed view (V): wings, dishes and booms open as they are in space']]) { b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); b.title = tip; } },
  renderRail() {
    this.rail.innerHTML = '';
    for (const c of this.catalogue.categories) this.rail.append(h('button', { class: 'rail-btn' + (this.cat === c.id ? ' on' : ''), type: 'button', 'data-cat': c.id, onclick: () => { this.cat = c.id; this.renderRail(); this.renderFly(); } }, h('span', {}, c.name)));
  },
  renderFly() {
    if (!this.catalogue) return; const f = this.fly; f.innerHTML = '';
    const list = this.catalogue.components.filter(c => c.category === this.cat), title = this.catalogue.categories.find(c => c.id === this.cat)?.name || 'Parts';
    f.append(h('div', { class: 'fly-h' }, h('b', {}, title), h('span', { class: 'fly-hint' }, `${list.length} parts`)));
    const grid = h('div', { class: 'fly-grid' });
    for (const d of list) {
      const cv = h('canvas', {}), code = d.name.split(' ')[0], label = d.name.slice(code.length + 1), pair = (d.mount === 'side' || d.mount === 'wing') && this.sym;
      const detail = d.mount === 'internal' ? `${d.bays} ${d.bays === 1 ? 'bay' : 'bays'}` : d.mount === 'bus' ? `${d.bays} bays · ${d.rows} rows` : d.gen ? `${pw(d.gen)} each` : d.mount === 'adapter' ? `${mt(d.w)} ring` : MOUNT_LABEL[d.mount];
      const card = h('div', { class: 'item', role: 'group', tabindex: 0, 'data-id': d.id, 'aria-label': d.name },
        cv, h('div', { class: 'item-copy' }, h('div', { class: 'n' }, code + (pair ? ' ×2' : '')), h('div', { class: 'l' }, label), h('div', { class: 'm' }, d.mount === 'adapter' || d.mount === 'bus' ? detail : `${MOUNT_LABEL[d.mount]} · ${detail}`), h('div', { class: 'm' }, `${kg(d.mass * (pair ? 2 : 1))} · ${fmtMoneyShort(d.cost * (pair ? 2 : 1))}`)),
        h('button', { class: 'item-info', type: 'button', 'aria-label': `Details for ${d.name}`, onclick: e => { e.stopPropagation(); this.showPart(d); } }, 'Details'));
      card.querySelector('.item-info').addEventListener('pointerdown', e => e.stopPropagation());
      card.addEventListener('pointerdown', e => this.cardDown(e, d));
      card.addEventListener('keydown', e => { if (e.key === 'Enter') this.quickAdd(d); });
      grid.append(card); requestAnimationFrame(() => drawIcon(cv, d));
    }
    f.append(grid, h('div', { class: 'fly-foot' }, 'Click to add · drag to a green node to place'));
  },
  cardDown(e, d) {
    if (e.button !== 0) return; e.preventDefault(); const sx = e.clientX, sy = e.clientY; let started = false;
    const move = ev => { if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) > DRAG_PX) { started = true; this.beginDrag({ def: d }, ev); } if (started) this.updateDrag(ev); };
    const off = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); };
    const up = ev => { off(); if (started) this.dragEnd(ev); else this.quickAdd(d); };
    const cancel = () => { off(); if (started) this.cancelDrag(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel);
  },

  /* ── drag & drop ── */
  beginDrag({ def, uid }, ev) {
    const orig = clone(this.design), d = { def, uid: uid || null, orig, origSel: this.sel, px: ev.clientX, py: ev.clientY, target: null, targets: [], over: false, overCanvas: false, overBin: false, fromPart: !!uid, notes: [], sym: uid ? !(orig.parts.find(p => p.uid === uid)?.dir) : this.sym };
    if (uid) { const r = this.removeFrom(this.design, uid); this.design = r.design; d.notes = r.notes; this.sel = null; }
    this.drag = d; this.root.classList.add('dragging'); this.empty.hidden = true; this.selbar.hidden = true; this.hover = null;
    this.L = layoutOf(this.design, this.byId); d.targets = this.targetsFor(d.def, d.sym, this.design); this.updateDrag(ev);
  },
  overPalette(x, y) {
    const hit = el => { if (!el || el.hidden) return false; const r = el.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
    return hit(this.rail) || hit(this.fly) || hit(this.root.querySelector('.ws-top')) || hit(this.fitCard) || (this.info.classList.contains('open') && hit(this.info));
  },
  updateDrag(ev) {
    const d = this.drag; if (!d) return; d.px = ev.clientX; d.py = ev.clientY;
    const br = this.bin.getBoundingClientRect(); d.overBin = d.fromPart && d.px >= br.left && d.px <= br.right && d.py >= br.top && d.py <= br.bottom; this.bin.classList.toggle('hot', d.overBin);
    d.over = d.overBin || this.overPalette(d.px, d.py);
    const r = this.canvas.getBoundingClientRect(), v = this.view, wx = (d.px - r.left - v.ox) / v.k, wy = (v.oy - (d.py - r.top)) / v.k;
    d.overCanvas = d.px >= r.left && d.px <= r.right && d.py >= r.top && d.py <= r.bottom && !d.over;
    d.target = d.over ? null : this.pickTarget(d.targets, wx, wy, SNAP_PX / v.k);
    if (d.target?.ok && !d.target.L) d.target.L = layoutOf(d.target.design, this.byId);
    this.invalidate();
  },
  dragEnd() {
    const d = this.drag; if (!d) return; const t = d.target; this.drag = null; this.root.classList.remove('dragging'); this.bin.classList.remove('hot');
    if (t?.ok) { this.design = d.orig; this.commit(t.design, t.uid); d.notes.forEach(n => toast(n, 'warn')); return; }
    if (d.fromPart && d.overBin) { this.design = d.orig; const r = this.removeFrom(d.orig, d.uid); this.commit(r.design, null); r.notes.forEach(n => toast(n, 'warn')); toast('Part removed'); return; }
    if (t && !t.ok && t.error) toast(t.error, 'warn', 4200); else if (!d.over) toast('Drop the part on a green node to attach it.', '', 2800);
    this.design = d.orig; this.sel = d.origSel; this.refresh();
  },
  cancelDrag() { const d = this.drag; if (!d) return; this.drag = null; this.root.classList.remove('dragging'); this.bin.classList.remove('hot'); this.design = d.orig; this.sel = d.origSel; this.refresh(); },

  /* ── canvas interaction ── */
  hit(mx, my) { for (let i = this.hits.length - 1; i >= 0; i--) { const q = this.hits[i]; if (mx >= q.x0 - 2 && mx <= q.x1 + 2 && my >= q.y0 - 2 && my <= q.y1 + 2) return q.uid; } return null; },
  canvasDown(e) {
    if (e.button !== 0 && e.button !== 1) return; e.preventDefault(); this.canvas.focus(); const r = this.canvas.getBoundingClientRect(), v = this.view;
    const uid = e.button === 0 ? this.hit(e.clientX - r.left, e.clientY - r.top) : null, start = { x: e.clientX, y: e.clientY, ox: v.ox, oy: v.oy }; let started = false; this.pressing = true;
    const p = uid && this.design.parts.find(q => q.uid === uid), def = p && this.byId[p.c], movable = def && ['top', 'side', 'wing', 'internal'].includes(def.mount);
    if (uid && uid !== this.sel) { this.sel = uid; this.renderSel(); this.renderInfo(); this.invalidate(); }
    const move = ev => {
      const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
      if (uid) { if (movable && !started && Math.hypot(dx, dy) > DRAG_PX) { started = true; this.beginDrag({ uid, def }, ev); } if (started) this.updateDrag(ev); return; }
      if (started || Math.hypot(dx, dy) > 3) { started = true; v.auto = false; v.ox = start.ox + dx; v.oy = start.oy + dy; this.canvas.style.cursor = 'grabbing'; this.invalidate(); }
    };
    const off = () => { this.pressing = false; this.canvas.style.cursor = ''; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); };
    const up = ev => { off(); if (uid) { if (started) this.dragEnd(ev); } else if (!started && this.sel) { this.sel = null; this.renderSel(); this.renderInfo(); this.invalidate(); } };
    const cancel = () => { off(); if (started && uid) this.cancelDrag(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel);
  },
  wheel(e) {
    e.preventDefault(); const v = this.view, r = this.canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, k2 = clamp(v.k * Math.exp(-e.deltaY * (e.deltaMode ? .05 : .0015)), 12, 900), s = k2 / v.k;
    v.ox = mx - (mx - v.ox) * s; v.oy = my - (my - v.oy) * s; v.k = k2; v.auto = false; this.invalidate();
  },
  key(e) {
    if (this.root.hidden || !this.design || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) || document.getElementById('dialog').open) return; const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') { if (this.drag) this.cancelDrag(); else if (this.info.classList.contains('open')) this.toggleDrawer(false); }
    else if (this.drag) return;
    else if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); this.redo(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.remove(); }
    else if (e.key === 'f' || e.key === 'F') { this.view.auto = true; this.invalidate(); }
    else if (e.key === 'm' || e.key === 'M') this.setMode('sym');
    else if (e.key === 'v' || e.key === 'V') this.setMode('deployed');
  },

  /* ── view fitting & drawing ── */
  fitTarget() {
    const W = this.sheet.clientWidth, H = this.sheet.clientHeight, L = this.L, f = this.fairingSpec, sr = this.sheet.getBoundingClientRect();
    const x0 = this.fly.getBoundingClientRect().right - sr.left + 24, x1 = W - (this.info.classList.contains('open') ? 392 : 300), y0 = 26, y1 = H - 104;
    let minX = -.5, maxX = .5, minY = 0, maxY = Math.max(.6, L.height);
    if (!this.deployed && f) { minX = -f.D / 2 - .5; maxX = f.D / 2 + .3; minY = -STUB; maxY = Math.max(f.H, L.height) + .1; }
    else {
      for (const it of L.items) {
        const ex = extentOf(it.def); if (!ex) { minX = Math.min(minX, it.x0); maxX = Math.max(maxX, it.x1); continue; }
        if (it.def.shape === 'dish') { minX = Math.min(minX, -ex.w / 2); maxX = Math.max(maxX, ex.w / 2); maxY = Math.max(maxY, it.y0 + ex.h); }
        else { const s = it.side || 1, e0 = it.edge ?? (s < 0 ? it.x1 : it.x0); minX = Math.min(minX, e0, e0 + s * ex.w); maxX = Math.max(maxX, e0, e0 + s * ex.w); }
      }
      minX -= .3; maxX += .3; maxY += .2;
    }
    const k = clamp(Math.min((x1 - x0) / (maxX - minX), (y1 - y0) / (maxY - minY)), 14, 420);
    return { k, ox: (x0 + x1) / 2 - (minX + maxX) / 2 * k, oy: (y0 + y1) / 2 + (minY + maxY) / 2 * k };
  },
  invalidate() { if (this.raf || !this.root || this.root.hidden || !this.design) return; this.raf = requestAnimationFrame(() => { this.raf = 0; this.frame(); }); },
  frame() {
    const v = this.view; if (v.auto && this.L) { const t = this.fitTarget(), e = .28; v.k += (t.k - v.k) * e; v.ox += (t.ox - v.ox) * e; v.oy += (t.oy - v.oy) * e; if (Math.abs(t.k - v.k) < .05 && Math.abs(t.ox - v.ox) < .4 && Math.abs(t.oy - v.oy) < .4) Object.assign(v, t); else this.invalidate(); }
    this.draw(); this.placeSel(); if (this.drag) this.invalidate();
  },
  shellPath(ctx, f, X, Y, k = 1) {
    const steps = 56; ctx.beginPath(); ctx.moveTo(X(-f.D / 2 * k), Y(0));
    for (let i = 0; i <= steps; i++) { const y = f.H * i / steps; ctx.lineTo(X(-outerR(f, y) * k), Y(y)); }
    for (let i = steps; i >= 0; i--) { const y = f.H * i / steps; ctx.lineTo(X(outerR(f, y) * k), Y(y)); } ctx.closePath();
  },
  paintFairingBack(ctx, f, X, Y) {   // inside of the far half of the shell, behind the spacecraft
    this.shellPath(ctx, f, X, Y); const g = ctx.createLinearGradient(X(-f.D / 2), 0, X(f.D / 2), 0);
    g.addColorStop(0, 'rgba(10,20,40,.62)'); g.addColorStop(.5, 'rgba(18,34,64,.46)'); g.addColorStop(1, 'rgba(8,16,34,.66)'); ctx.fillStyle = g; ctx.fill();
  },
  paintFairing(ctx, f, X, Y, status) {   // front half of the shell as clear glass, so the payload shows through
    const k = this.view.k, bad = status === 'bad', tight = status === 'tight', wall = Math.max(.012, f.D * .018);
    ctx.save(); this.shellPath(ctx, f, X, Y);
    const g = ctx.createLinearGradient(X(-f.D / 2), 0, X(f.D / 2), 0); g.addColorStop(0, 'rgba(236,244,255,.30)'); g.addColorStop(.14, 'rgba(236,244,255,.07)'); g.addColorStop(.62, 'rgba(236,244,255,.04)'); g.addColorStop(.9, 'rgba(236,244,255,.12)'); g.addColorStop(1, 'rgba(236,244,255,.30)');
    ctx.fillStyle = bad ? 'rgba(255,92,77,.14)' : g; ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = 'rgba(255,255,255,.10)'; ctx.beginPath(); ctx.moveTo(X(-f.D * .30), Y(0)); ctx.lineTo(X(-f.D * .24), Y(0)); ctx.lineTo(X(-f.D * .16), Y(f.H)); ctx.lineTo(X(-f.D * .22), Y(f.H)); ctx.fill(); ctx.restore();   // soft highlight
    ctx.lineJoin = 'round'; ctx.lineWidth = 2.2; ctx.strokeStyle = bad ? 'rgba(255,120,104,.98)' : 'rgba(240,246,255,.95)'; this.shellPath(ctx, f, X, Y); ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(240,246,255,.42)'; ctx.beginPath(); for (const sg of [-1, 1]) for (let i = 0; i <= 56; i++) { const y = f.H * i / 56, r = Math.max(0, outerR(f, y) - wall); i ? ctx.lineTo(X(sg * r), Y(y)) : ctx.moveTo(X(sg * r), Y(y)); } ctx.stroke();   // shell wall thickness
    ctx.setLineDash([7, 7]); ctx.lineWidth = 1.5; ctx.strokeStyle = bad ? 'rgba(255,170,160,.95)' : tight ? 'rgba(255,190,80,.98)' : 'rgba(104,232,246,.9)';
    for (const sgn of [-1, 1]) { ctx.beginPath(); for (let i = 0; i <= 56; i++) { const y = f.H * i / 56, r = usableR(f, y); i ? ctx.lineTo(X(sgn * r), Y(y)) : ctx.moveTo(X(sgn * r), Y(y)); } ctx.stroke(); } ctx.setLineDash([]);
    const sep = Math.max(3, k * .035); ctx.fillStyle = BASE.amber; ctx.fillRect(X(-f.D / 2) - 2, Y(0) - sep, f.D * k + 4, sep); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.strokeRect(X(-f.D / 2) - 2, Y(0) - sep, f.D * k + 4, sep);   // separation ring
    ctx.restore();
  },
  draw() {
    const c = this.canvas, d = Math.min(window.devicePixelRatio || 1, 2), W = this.sheet.clientWidth, H = this.sheet.clientHeight; if (!W || !H || !this.design || !this.L) return;
    if (c.width !== Math.round(W * d) || c.height !== Math.round(H * d)) { c.width = Math.round(W * d); c.height = Math.round(H * d); }
    const ctx = c.getContext('2d'), v = this.view, k = v.k, dr = this.drag, tgt = dr?.target, pv = tgt?.ok ? tgt.L : null, L = pv || this.L, f = this.fairingSpec, stowed = !this.deployed;
    const X = x => v.ox + x * k, Y = y => v.oy - y * k; ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.fillStyle = '#426295'; ctx.fillRect(0, 0, W, H);
    let step = 1; for (const s of [.1, .25, .5, 1, 2, 5]) { step = s; if (s * k >= 18) break; }
    const grid = (s, a) => { ctx.strokeStyle = `rgba(15,35,90,${a * 3})`; ctx.lineWidth = 1; ctx.beginPath(); for (let x = v.ox + Math.ceil((0 - v.ox) / (s * k)) * s * k; x < W; x += s * k) { ctx.moveTo(Math.round(x) + .5, 0); ctx.lineTo(Math.round(x) + .5, H); } for (let y = v.oy - Math.floor(v.oy / (s * k)) * s * k; y < H; y += s * k) { ctx.moveTo(0, Math.round(y) + .5); ctx.lineTo(W, Math.round(y) + .5); } ctx.stroke(); };
    grid(step, .045); grid(step * 5, .12);
    ctx.setLineDash([7, 9]); ctx.strokeStyle = 'rgba(10,25,70,.6)'; ctx.beginPath(); ctx.moveTo(Math.round(v.ox) + .5, 0); ctx.lineTo(Math.round(v.ox) + .5, H); ctx.stroke(); ctx.setLineDash([]);
    const fit = this.fit || { bad: new Set(), ok: true }; this.hits = [];

    if (stowed && f) {   // the real rocket part under the fairing, so the payload sits on the actual rocket
      const below = this.rocketBelow(), sh = (below ? Math.min(below.height, .9) : STUB) * k, sl = X(-f.D / 2), top = Y(0), sw = f.D * k;
      if (below && f.source === 'rocket') { ctx.save(); ctx.beginPath(); ctx.rect(sl - 6, top, sw + 12, sh); ctx.clip(); paintRocketPart(ctx, below, { x: X(0), y: top, S: k, onload: () => this.invalidate() }); ctx.restore(); }
      else { ctx.fillStyle = barrel(ctx, sl, sw, 'graphite'); ctx.fillRect(sl, top, sw, sh); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(sl, top, sw, sh); ctx.fillStyle = 'rgba(232,237,245,.55)'; ctx.font = '700 10px Archivo, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(f.source === 'rocket' ? 'ROCKET' : 'LAUNCH VEHICLE', X(0), top + sh * .62); }
      this.paintFairingBack(ctx, f, X, Y);
    }
    const order = ['wing', 'adapter', 'bus', 'side', 'top'], modules = L.modules, selUid = this.sel;
    for (const m of order) for (const it of L.items) {
      if (it.def.mount !== m) continue; const ghost = pv && tgt.uid === it.uid, dir = it.side || 1, ex = !stowed && extentOf(it.def);
      const o = { x: X(it.cx), y: Y(it.y0), S: k, stowed, dir }; let rect = { x0: X(it.x0), x1: X(it.x1), y0: Y(it.y1), y1: Y(it.y0) };
      if (m === 'bus') { this.hits.push({ uid: it.uid, ...rect }); this.hits.push(...paintBus(ctx, it.def, o, modules, selUid)); }
      else {
        if (ex && (it.def.shape === 'wing' || it.def.shape === 'boom')) { const e0 = it.edge ?? it.x0; paintPart(ctx, it.def, { ...o, x: X(e0) + dir * it.w * k / 2 }); rect = { x0: Math.min(X(e0), X(e0 + dir * ex.w)), x1: Math.max(X(e0), X(e0 + dir * ex.w)), y0: Y(it.y1), y1: Y(it.y0) }; }
        else if (ex) { paintPart(ctx, it.def, o); rect = { x0: X(-ex.w / 2), x1: X(ex.w / 2), y0: Y(it.y0 + ex.h), y1: Y(it.y0) }; }
        else paintPart(ctx, it.def, o);
        this.hits.push({ uid: it.uid, ...rect });
      }
      if (ghost) { ctx.strokeStyle = `rgba(95,219,143,${.7 + .25 * Math.sin(performance.now() / 130)})`; ctx.lineWidth = 2.5; ctx.strokeRect(rect.x0 - 3, rect.y0 - 3, rect.x1 - rect.x0 + 6, rect.y1 - rect.y0 + 6); }
      if (stowed && f && fit.bad.has(it.uid) && !pv) { ctx.strokeStyle = 'rgba(255,92,77,.95)'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.strokeRect(rect.x0 - 3, rect.y0 - 3, rect.x1 - rect.x0 + 6, rect.y1 - rect.y0 + 6); ctx.setLineDash([]); }
    }
    if (stowed && f) this.paintFairing(ctx, f, X, Y, fit.has && !fit.ok ? 'bad' : fit.tight ? 'tight' : 'ok');
    const outline = (q, col, lw, blur) => { ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = lw; if (blur) { ctx.shadowColor = col; ctx.shadowBlur = blur; } ctx.strokeRect(q.x0 - 4, q.y0 - 4, q.x1 - q.x0 + 8, q.y1 - q.y0 + 8); ctx.restore(); };
    if (!dr) for (const q of this.hits) { if (q.inner) continue; if (q.uid === this.hover && q.uid !== this.sel) outline(q, 'rgba(125,225,240,.5)', 1.5, 0); if (q.uid === this.sel) outline(q, '#52d6ea', 2, 10); }
    if (dr && !pv) {   // attach nodes while dragging
      const ph = .5 + .5 * Math.sin(performance.now() / 220);
      for (const t of dr.targets) for (const n of t.nodes) { const hot = t === tgt; if (!t.ok && !hot) continue; const x = X(n.x), y = Y(n.y), r = hot ? 11 : 7 + 1.5 * ph; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = t.ok ? (hot ? 'rgba(95,219,143,.95)' : 'rgba(95,219,143,.55)') : (hot ? 'rgba(255,92,77,.95)' : 'rgba(255,92,77,.3)'); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.stroke(); }
      const r = c.getBoundingClientRect(), gx = dr.px - r.left, gy = dr.py - r.top, gd = dr.def, bad = tgt && !tgt.ok;
      if (gd.shape === 'bus') paintBus(ctx, gd, { x: gx, y: gy + gd.h * k / 2, S: k }); else paintPart(ctx, gd, { x: gx, y: gy + gd.h * k / 2, S: k, stowed: true, alpha: .72 });
      if (bad && tgt.error) { ctx.font = '600 13px Archivo, sans-serif'; ctx.textAlign = 'left'; const m = tgt.error, tw = ctx.measureText(m).width, bx = clamp(gx + 24, 8, W - tw - 30), by = clamp(gy - 44, 8, H - 40); ctx.fillStyle = 'rgba(70,14,10,.94)'; ctx.fillRect(bx, by, tw + 18, 28); ctx.strokeStyle = '#ff5c4d'; ctx.lineWidth = 1; ctx.strokeRect(bx + .5, by + .5, tw + 17, 27); ctx.fillStyle = '#ffd5d0'; ctx.fillText(m, bx + 9, by + 19); }
    }
    if (L.items.length) {   // dimension lines + clearance callout
      const dxp = X(-(stowed && f ? f.D / 2 : L.width / 2)) - 46, y0 = Y(0), y1 = Y(L.height); ctx.strokeStyle = ctx.fillStyle = 'rgba(205,224,255,.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(dxp, y0); ctx.lineTo(dxp, y1); ctx.moveTo(dxp - 6, y0); ctx.lineTo(dxp + 6, y0); ctx.moveTo(dxp - 6, y1); ctx.lineTo(dxp + 6, y1); ctx.stroke();
      ctx.save(); ctx.translate(dxp - 8, (y0 + y1) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.font = '600 12px Archivo, sans-serif'; ctx.fillText(`${L.height.toFixed(2)} m`, 0, 0); ctx.restore();
      if (stowed && f) { const yf = Y(f.H); ctx.beginPath(); ctx.moveTo(dxp - 22, y0); ctx.lineTo(dxp - 22, yf); ctx.moveTo(dxp - 28, y0); ctx.lineTo(dxp - 16, y0); ctx.moveTo(dxp - 28, yf); ctx.lineTo(dxp - 16, yf); ctx.stroke(); ctx.save(); ctx.translate(dxp - 30, (y0 + yf) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.font = '600 11px Archivo, sans-serif'; ctx.fillStyle = 'rgba(205,224,255,.5)'; ctx.fillText(`fairing ${f.H.toFixed(2)} m`, 0, 0); ctx.restore(); }
      if (stowed && f && fit.has && fit.worst && !pv) {
        const w = fit.worst, yy = Y(w.y1), xx = X(Math.abs(w.x1) > Math.abs(w.x0) ? w.x1 : w.x0), cl = fit.minClear, label = cl >= 0 ? `${(cl * 100).toFixed(0)} cm` : `${(-cl * 100).toFixed(0)} cm over`;
        ctx.font = '700 11px Archivo, sans-serif'; ctx.textAlign = 'left'; const tw = ctx.measureText(label).width, bx = Math.max(xx, X(0)) + 16, by = yy - 8;
        ctx.fillStyle = cl >= 0 ? (fit.tight ? 'rgba(70,48,8,.92)' : 'rgba(10,52,38,.92)') : 'rgba(70,14,10,.94)'; ctx.fillRect(bx, by - 11, tw + 12, 20); ctx.strokeStyle = cl >= 0 ? (fit.tight ? '#ffb02e' : '#5fdb8f') : '#ff5c4d'; ctx.strokeRect(bx + .5, by - 10.5, tw + 11, 19); ctx.fillStyle = '#fff'; ctx.fillText(label, bx + 6, by + 4); ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(bx, by); ctx.stroke();
      }
    }
  },
  placeSel() {
    const b = this.selbar; if (b.hidden || !this.sel) return; const q = this.hits.find(x => x.uid === this.sel && !x.inner) || this.hits.find(x => x.uid === this.sel); if (!q) { b.hidden = true; return; } const W = this.sheet.clientWidth, H = this.sheet.clientHeight;
    b.style.left = clamp(q.x1 + 22, 150, W - b.offsetWidth - (this.info.classList.contains('open') ? 380 : 300)) + 'px'; b.style.top = clamp((q.y0 + q.y1) / 2 - b.offsetHeight / 2, 8, H - b.offsetHeight - 110) + 'px';
  },

  /* ── panels ── */
  refresh() {
    if (!this.design) return;
    this.L = layoutOf(this.design, this.byId); this.fairingSpec = this.resolveFairing(this.L); this.fit = fitCheck(this.L, this.fairingSpec);
    this.st = statsOf(this.design, this.L, this.byId); this.checks = checksOf(this.design, this.L, this.byId, this.st, this.fit);
    this.empty.hidden = !!(this.design.parts.length || this.drag);
    this.renderFit(); this.renderBar(); this.renderInfo(); this.renderSel(); this.renderTools(); this.invalidate();
  },
  renderTools() { this.undoBtn.disabled = !this.hist.length; this.redoBtn.disabled = !this.fut.length; },
  renderFit() {
    const f = this.fairingSpec, fit = this.fit, L = this.L, rocket = this.rocketFairing(), card = this.fitCard; card.innerHTML = '';
    const mode = this.design.fairing?.mode || 'auto', val = mode === 'catalogue' ? this.design.fairing.id : (mode === 'rocket' && !rocket ? 'auto' : mode);
    const select = h('select', { class: 'pl-select', 'aria-label': 'Fairing', onchange: () => { const v = select.value, d = clone(this.design); d.fairing = v === 'auto' || v === 'rocket' || v === 'none' ? { mode: v, id: null } : { mode: 'catalogue', id: v }; this.pushHist(this.design); this.design = d; this.view.auto = true; this.refresh(); } });
    const opt = (v, t) => select.append(h('option', { value: v, selected: v === val }, t));
    opt('auto', 'Auto · smallest that fits'); if (rocket) opt('rocket', `Rocket · ${rocket.code} (${rocket.D.toFixed(1)} × ${rocket.H.toFixed(1)} m)`);
    for (const d of this.fairingList()) opt(d.id, `${d.name.split(' ')[0]} · ${d.diameter.toFixed(1)} × ${d.height.toFixed(1)} m`); opt('none', 'No fairing');
    let verdict = ['idle', 'Add parts to check fit'];
    if (f && fit.has) verdict = !fit.ok ? ['bad', `Does not fit · ${(-fit.minClear * 100).toFixed(0)} cm over`] : fit.tight ? ['tight', `Tight fit · ${(fit.minClear * 100).toFixed(1)} cm`] : ['ok', `Fits · ${(fit.minClear * 100).toFixed(0)} cm clearance`];
    else if (!f) verdict = ['idle', 'No fairing selected'];
    const row = (a, b, cls = '') => h('div', { class: 'pl-row' }, h('span', {}, a), h('b', { class: cls }, b));
    card.append(h('div', { class: 'pl-fit-h' }, h('span', {}, 'FAIRING FIT'), h('span', { class: 'pl-badge ' + verdict[0] }, verdict[0] === 'ok' ? 'FITS' : verdict[0] === 'tight' ? 'TIGHT' : verdict[0] === 'bad' ? 'NO FIT' : '—')), select, h('div', { class: 'pl-verdict ' + verdict[0] }, verdict[1]));
    if (f) card.append(row('Spacecraft width', L.items.length ? mt(L.width) : '—'), row('Usable width', mt(f.D * USABLE)), row('Spacecraft height', L.items.length ? mt(L.height) : '—'), row('Straight section', mt(f.cylH)), L.adapter ? row('Adapter ring', `${mt(L.adapter.d.w)} / ${mt(f.D * USABLE)}`, L.adapter.d.w > f.D * USABLE ? 'bad' : '') : null);
    if (rocket && f && f.source !== 'rocket') { const rf = fitCheck(L, rocket); card.append(h('div', { class: 'pl-rocket ' + (L.items.length ? (rf.ok ? 'ok' : 'bad') : '') }, `${rocket.code} on your rocket: ${L.items.length ? (rf.ok ? 'fits' : 'does not fit') : '—'}`)); }
    if (!rocket) card.append(h('div', { class: 'pl-rocket' }, 'Your rocket has no fairing yet. Add one in the rocket editor to check against it.'));
  },
  renderBar() {
    const s = this.st, fit = this.fit, cell = (label, val, cls = '') => h('div', { class: 'cell' }, h('span', { class: 'lab' }, label), h('b', { class: 'num ' + cls }, val)); this.bar.innerHTML = '';
    const m = state.mode === 'mission' && state.missionId ? missionById(state.missionId) : null, alloc = m?.budget?.payload;
    this.bar.append(cell('Mass', s.count ? kg(s.mass) : '0 kg'), cell('Power', s.count ? `${s.net >= 0 ? '+' : '−'}${pw(Math.abs(s.net))}` : '—', s.count && s.net < 0 ? 'amber' : ''),
      cell(alloc ? 'Payload funds left' : 'Cost', alloc ? fmtMoneyShort(alloc - s.cost) : fmtMoneyShort(s.cost), alloc && alloc - s.cost < 0 ? 'amber' : ''), cell('Fit', !fit.has ? '—' : fit.ok ? (fit.tight ? 'Tight' : 'Fits') : 'No fit', fit.has && (!fit.ok || fit.tight) ? 'amber' : ''),
      h('button', { class: 'bar-more', type: 'button', onclick: () => this.toggleDrawer(true), 'aria-label': 'Payload statistics' }, 'Stats'));
    const msg = this.checks.errors[0]; this.pill.hidden = !(msg && this.design.parts.length); this.pill.textContent = msg || ''; this.pill.className = 'ws-pill bad';
  },
  toggleDrawer(force) { const open = force ?? !this.info.classList.contains('open'); this.info.classList.toggle('open', open); if (open) this.renderInfo(); this.invalidate(); },
  showPart(def) { this.preview = def; this.showingPart = true; this.toggleDrawer(true); this.renderInfo(); },
  partRows(d, n = 1) {
    const rows = [['Part ID', d.id], ['Mounts', MOUNT_LABEL[d.mount]], ['Stowed size', `${mt(d.w)} × ${mt(d.h)}`]];
    if (d.deployedW) rows.push([d.mount === 'wing' ? 'Wing span (deployed)' : d.shape === 'boom' ? 'Boom length (deployed)' : 'Dish diameter (deployed)', mt(d.deployedW)]);
    rows.push(['Mass', kg(d.mass * n) + (n > 1 ? ` (${n}×)` : '')], ['Cost', fmtMoney(d.cost * n)]);
    if (d.draw) rows.push(['Power draw', pw(d.draw * n)]); if (d.gen) rows.push(['Power output (1 AU)', pw(d.gen * n)]); if (d.wh) rows.push(['Energy storage', `${d.wh * n} Wh`]);
    if (d.mount === 'internal') rows.push(['Bays used', String(d.bays)]); if (d.mount === 'bus') rows.push(['Avionics bays', String(d.bays)], ['Side rows', String(d.rows)], ['Mounted-mass capacity', kg(d.capacity)]);
    if (d.rows && d.mount === 'side') rows.push(['Side rows used', String(d.rows)]); if (d.maxMass) rows.push(['Max spacecraft mass', kg(d.maxMass)]); if (d.basis) rows.push(['Real-world basis', d.basis]); return rows;
  },
  renderInfo() {
    const i = this.info; if (!this.design) return; i.innerHTML = ''; const p = this.sel && this.design.parts.find(q => q.uid === this.sel), sd = p && this.byId[p.c], detail = this.preview || sd, partMode = !!(this.showingPart && detail);
    i.append(h('div', { class: 'drawer-h' }, h('b', {}, partMode ? 'Part details' : 'Payload stats'), partMode ? h('button', { class: 'btn small quiet', onclick: () => { this.showingPart = false; this.preview = null; this.renderInfo(); } }, 'Payload stats') : null, h('button', { class: 'btn small quiet', onclick: () => this.toggleDrawer(false) }, 'Close')));
    if (partMode) { const n = p && sd === detail ? countOf(sd, p) : 1; i.append(h('h3', {}, detail.name), h('p', { class: 'dim', style: 'margin:4px 0 14px' }, detail.desc), h('div', { class: 'kv' }, this.partRows(detail, n).flatMap(([k, v]) => [h('span', {}, k), h('span', {}, String(v))]))); return; }
    const s = this.st, L = this.L, m = state.mode === 'mission' && state.missionId ? missionById(state.missionId) : null, alloc = m?.budget?.payload;
    i.append(h('div', { class: 'sec' }, 'Spacecraft'));
    const kv = [['Component count', s.count], ['Total mass', kg(s.mass)], ['Mounted mass', L.bus ? `${kg(s.mounted)} / ${kg(L.bus.d.capacity)}` : kg(s.mounted)], ['Avionics bays', L.bus ? `${s.baysUsed} / ${s.bays}` : '—'], ['Stowed envelope', L.items.length ? `${mt(L.width)} × ${mt(L.height)}` : '—'], ['Adapter limit', L.adapter ? kg(L.adapter.d.maxMass) : '—'], ['Cost', fmtMoney(s.cost)]];
    i.append(h('div', { class: 'kv' }, kv.flatMap(([k, v]) => [h('span', {}, k), h('span', {}, String(v))])));
    i.append(h('div', { class: 'sec' }, 'Power budget (at 1 AU)'));
    const pk = [['Generation', pw(s.gen)], ['Consumption', pw(s.draw)], ['Margin', `${s.net >= 0 ? '+' : '−'}${pw(Math.abs(s.net))}`], ['Battery storage', `${Math.round(s.wh)} Wh`], ['Eclipse endurance', s.draw > 0 && s.wh > 0 ? `${Math.floor(s.eclipseMin)} min (need ${ECLIPSE_MIN})` : '—']];
    i.append(h('div', { class: 'kv' }, pk.flatMap(([k, v]) => [h('span', {}, k), h('span', {}, String(v))])));
    if (alloc) { i.append(h('div', { class: 'sec' }, 'Mission payload funding')); i.append(h('div', { class: 'kv economy-kv' }, [['Payload allocation', fmtMoney(alloc)], ['Payload cost', fmtMoney(s.cost)], ['Funds left', fmtMoney(alloc - s.cost)]].flatMap(([k, v]) => [h('span', {}, k), h('span', { class: k === 'Funds left' && alloc - s.cost < 0 ? 'over' : '' }, v)]))); }
    i.append(h('div', { class: 'sec' }, 'Checks'));
    for (const e of this.checks.errors) i.append(h('div', { class: 'msg' }, e)); for (const w of this.checks.warnings) i.append(h('div', { class: 'msg warn' }, w));
    if (!this.checks.errors.length && !this.checks.warnings.length) i.append(h('div', { class: 'green' }, this.design.parts.length ? 'No problems found.' : 'Add parts to see checks.'));
  },
  renderSel() {
    const b = this.selbar, p = this.sel && this.design.parts.find(q => q.uid === this.sel); b.innerHTML = ''; if (!p) { b.hidden = true; return; }
    const d = this.byId[p.c], n = countOf(d, p);
    b.append(h('div', { class: 't', title: d.name }, d.name.split(' ')[0] + (n > 1 ? ' ×2' : p.dir ? (p.dir < 0 ? ' (left)' : ' (right)') : '')), h('button', { class: 'details', type: 'button', onclick: () => { this.preview = null; this.showingPart = true; this.toggleDrawer(true); this.renderInfo(); } }, 'Details'));
    if (d.mount === 'side') { const bus = this.L.bus?.d, span = d.rows || 1; if (bus && bus.rows - span > 0) b.append(h('div', { class: 'st' }, h('span', {}, 'Row'), h('button', { onclick: () => this.rowEdit(p, -1), 'aria-label': 'Move down a row' }, '−'), h('b', { class: 'num' }, String((p.row || 0) + 1)), h('button', { onclick: () => this.rowEdit(p, 1), 'aria-label': 'Move up a row' }, '+'))); }
    b.append(h('button', { class: 'del', type: 'button', title: 'Remove part (Delete)', 'aria-label': 'Remove part', onclick: () => this.remove() }, ico('trash'))); b.hidden = false;
  },

  /* ── file operations ── */
  summary() {
    const f = this.fairingSpec, rocket = this.rocketFairing();
    return { mass: +this.st.mass.toFixed(2), cost: Math.round(this.st.cost), powerGen: Math.round(this.st.gen), powerDraw: Math.round(this.st.draw), batteryWh: Math.round(this.st.wh), width: +this.L.width.toFixed(3), height: +this.L.height.toFixed(3), adapter: this.L.adapter?.d.id || null, adapterDiameter: this.L.adapter?.d.w || null, fairing: f ? f.id : null, fitsFairing: this.fit.has ? this.fit.ok : null, fitsRocket: rocket ? fitCheck(this.L, rocket).ok : null };
  },
  save() {
    this.design.name = this.name.value.trim() || 'Untitled payload'; this.name.value = this.design.name; const out = { ...clone(this.design), summary: this.summary() };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(out)); } catch { }
    if (state.blueprint) state.blueprint.payload = clone(out); state.payloadDesign = clone(out); this.lastSaved = JSON.stringify(state.blueprint?.payload || null);
    toast(`Saved “${this.design.name}”`, 'good');
  },
  applyToRocket() {
    if (!this.design.parts.length) { toast('Build a spacecraft first.', 'warn'); return; }
    if (this.checks.errors.length) { toast(this.checks.errors[0], 'warn', 4800); this.toggleDrawer(true); return; }
    const rocket = this.rocketFairing();
    if (rocket) { const rf = fitCheck(this.L, rocket); if (!rf.ok) { toast(`Does not fit the rocket’s ${rocket.code} fairing (${(-rf.minClear * 100).toFixed(0)} cm over). Pick a bigger fairing in the rocket editor.`, 'warn', 6000); return; } }
    this.save(); toast(rocket ? `Payload attached. It fits the ${rocket.code} fairing.` : 'Payload attached to the current rocket design.', 'good'); bus.emit('nav', 'workshop');
  },
  async newDesign() {
    if (this.design.parts.length && !(await ask('Start a new payload?', 'The current spacecraft is replaced. Unsaved changes are lost.', [{ label: 'Keep editing', value: false }, { label: 'New payload', value: true, primary: true }]))) return;
    this.pushHist(this.design); this.design = this.blank(); this.sel = null; this.name.value = this.design.name; this.view.auto = true; this.refresh();
  },
  openExamples() {
    const d = document.getElementById('dialog'); d.innerHTML = ''; d.onclose = null; d.className = 'vehicle-library';
    const make = pr => ({ schema: SCHEMA, name: pr.name, fairing: { mode: 'catalogue', id: pr.fairing }, parts: pr.parts.map((p, i) => ({ uid: 'q' + (i + 1), ...p })) });
    const load = pr => { const design = make(pr); if (design.parts.some(p => !this.byId[p.c]) || structureError(design, this.byId)) return toast('That example could not be built.', 'bad'); this.pushHist(this.design); this.design = design; this.sel = null; this.name.value = design.name; this.view.auto = true; d.close(); this.refresh(); };
    const cards = PRESETS.map(pr => { const dsg = make(pr), st = statsOf(dsg, layoutOf(dsg, this.byId), this.byId); return h('article', { class: 'vehicle-card' }, h('button', { class: 'vehicle-card-open', type: 'button', onclick: () => load(pr) }, h('span', { class: 'vehicle-card-copy' }, h('span', { class: 'vehicle-card-name' }, pr.name), h('span', { class: 'vehicle-card-meta' }, `${pr.blurb} · ${kg(st.mass)} · ${fmtMoneyShort(st.cost)}`), h('span', { class: 'vehicle-card-action' }, 'Open design', h('span', { 'aria-hidden': 'true' }, '→'))))); });
    d.append(h('header', { class: 'vehicle-library-header' }, h('div', {}, h('div', { class: 'vehicle-library-eyebrow' }, 'PAYLOAD WORKSHOP  /  EXAMPLES'), h('div', { class: 'dlg-h' }, 'Example spacecraft'), h('p', { class: 'vehicle-library-subtitle' }, 'Start from a working design and change it.')), h('button', { class: 'vehicle-library-close', type: 'button', 'aria-label': 'Close', onclick: () => d.close() }, '×')),
      h('div', { class: 'vehicle-library-content' }, h('div', { class: 'vehicle-library-grid' }, cards)), h('footer', { class: 'vehicle-library-footer' }, h('span', {}, 'Your current design is kept in undo history.'), h('button', { class: 'btn', type: 'button', onclick: () => d.close() }, 'Done')));
    d.showModal();
  },

  async show() {
    await this.ready; if (!this.catalogue) return;
    const src = state.blueprint?.payload; if (src?.schema === SCHEMA && JSON.stringify(src) !== this.lastSaved) { this.design = this.readDesign(); this.lastSaved = JSON.stringify(src); this.hist = []; this.fut = []; }
    this.sel = null; this.hover = null; this.drag = null; this.preview = null; this.showingPart = false; this.view.auto = true; this.name.value = this.design.name; this.info.classList.remove('open');
    this.renderRail(); this.renderFly(); this.refresh(); requestAnimationFrame(() => { this.view.auto = true; this.invalidate(); });
  },
  hide() { this.cancelDrag(); },
};