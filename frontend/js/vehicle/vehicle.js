import { api } from '../core/api.js';

export const SCHEMA = 2;

export class Catalog {
  constructor(components, bodies) {
    this.meta = components; this.defs = Object.fromEntries(components.components.map(c => [c.id, c])); this.bodies = bodies.bodies;
  }
  component(id) { return this.defs[id] || null; }
  body(id) { return this.bodies[id] || null; }
  list() {
    const order = this.meta.categoryOrder; return this.meta.components.filter(c => c.palette !== false).slice().sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
  }
}

const clone = o => JSON.parse(JSON.stringify(o));
export const newBlueprint = (name = 'Untitled vehicle') => ({ schema: SCHEMA, name, stagingMode: 'auto', parts: [], looseParts: [] });
export const find = (bp, uid) => bp.parts.find(p => p.uid === uid) || (bp.looseParts || []).find(p => p.uid === uid) || null;
export const stackChild = (bp, uid) => bp.parts.find(p => p.parent === uid && p.mount === 'below') || null;


export const sideChildren = (bp, uid) => bp.parts.filter(p => p.parent === uid && (p.mount === 'side' || p.mount === 'radial'));

export function layout(bp, cat) {
  const items = [], byUid = {}; let bottom = 0, width = 0;
  const chainOf = first => { const out = []; for (let c = first; c; c = stackChild(bp, c.uid)) { const d = cat.component(c.c); if (!d) break; out.push({ c, d }); } return out; };
  const place = (first, x, dir, side, yTop) => {
    const chain = chainOf(first); let y = yTop;
    for (const { c, d } of chain) {
      const visualHeight = d.category === 'fairing' ? 0 : d.height;
      const it = { uid: c.uid, def: d, x, yTop: y, yBottom: y + visualHeight, count: side ? (dir ? 1 : 2) : 1, side, dir };
      items.push(it); byUid[c.uid] = it; bottom = Math.max(bottom, it.yBottom + (d.landing?.drop || 0)); width = Math.max(width, side ? 2 * (x + d.diameter / 2) : d.diameter); y = it.yBottom;
      for (const s of sideChildren(bp, c.uid)) {
        const bch = chainOf(s), wide = Math.max(...bch.map(q => q.d.diameter)), h = bch.reduce((a, q) => a + q.d.height, 0);
        place(s, x + d.diameter / 2 + wide / 2 + 0.03, s.dir || 0, true, it.yBottom - h);   // bottom-aligned with its host
      }
    }
  };
  const root = bp.parts.find(p => !p.parent); if (root) place(root, 0, 0, false, 0);
  const vehicleWidth = width;
  for (const p of bp.looseParts || []) {
    const d = cat.component(p.c); if (!d) continue;
    const it = { uid: p.uid, def: d, x: p.x, yTop: p.y - d.height / 2, yBottom: p.y + d.height / 2, count: 1, side: false, dir: 0, detached: true };
    items.push(it); byUid[p.uid] = it;
  }
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const it of items) {
    const dirs = it.side ? (it.dir ? [it.dir] : [-1, 1]) : [0];
    for (const dir of dirs) {
      const x = it.detached ? it.x : dir * it.x;
      bounds.minX = Math.min(bounds.minX, x - it.def.diameter / 2);
      bounds.maxX = Math.max(bounds.maxX, x + it.def.diameter / 2);
      bounds.minY = Math.min(bounds.minY, it.yTop);
      bounds.maxY = Math.max(bounds.maxY, it.yBottom);
    }
  }
  if (!items.length) Object.assign(bounds, { minX: -1.3, maxX: 1.3, minY: 0, maxY: 5 });
  return { items, byUid, height: bottom, width: vehicleWidth, bounds };
}


export function instantiate(bp, cat, { includeLoose = false } = {}) {
  const L = layout(bp, cat);
  const attached = bp.parts.map(p => {
    const def = cat.component(p.c), it = L.byUid[p.uid] || { side: false, dir: p.dir || 0, count: 1, x: 0, yTop: 0, yBottom: def?.height || 1 };
    return { uid: p.uid, def, parent: p.parent, side: it.side, dir: it.dir || 0, count: it.count, x: it.x, y0: it.yTop, y1: it.yBottom, stage: p.stage, group: p.group,
      fuel: def.tank ? def.tank.propellant * it.count : def.solid ? def.solid.propellant * it.count : 0, ignited: false, spent: false, alive: true };
  });
  if (!includeLoose) return attached;
  const loose = (bp.looseParts || []).flatMap(p => {
    const def = cat.component(p.c), it = L.byUid[p.uid]; if (!def || !it) return [];
    return [{ uid: p.uid, def, parent: null, side: false, dir: 0, count: 1, x: p.x, y0: it.yTop, y1: it.yBottom, stage: 0, group: 0,
      detached: true, fuel: def.tank ? def.tank.propellant : def.solid ? def.solid.propellant : 0, ignited: false, spent: false, alive: true }];
  });
  return [...attached, ...loose];
}


export async function migrate(raw) {
  if (raw && raw.schema === SCHEMA && Array.isArray(raw.parts)) {
    let bp = clone(raw);
    bp.looseParts ||= [];
    bp.stagingMode = bp.stagingMode || 'auto';
    if (bp.stagingMode === 'auto') {
      try { bp = (await api.vehicleAutoStage(bp)).blueprint; } catch {}
    }
    return bp;
  }
  if (Array.isArray(raw)) {
    let bp = newBlueprint('Imported vehicle'), last = null;
    for (const id of raw) {
      const r = await api.vehicleAddPart(bp, id, last, 'below', 0);
      if (!r.ok) continue;
      bp = r.blueprint;
      last = r.uid;
    }
    return bp;
  }
  return null;
}