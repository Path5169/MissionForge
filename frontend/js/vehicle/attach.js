import { api } from '../core/api.js';
import { layout } from './vehicle.js';

const SIDE_GAP = 0.03;

const spread = (n, y) => n.side ? (n.dir ? [{ x: n.dir * n.x, y }] : [{ x: n.x, y }, { x: -n.x, y }]) : [{ x: 0, y }];

export async function attachTargets(bp, cat, def, { sym = true } = {}) {
  const { targets } = await api.vehicleAttachTargets(bp, def.id, sym);
  if (!targets.length) return [];

  const L = layout(bp, cat), height = def.category === 'fairing' ? 0 : def.height;

  const geometry = t => {
    if (t.free) return { centers: [{ x: 0, y: height / 2 }], nodes: [{ x: 0, y: 0 }] };
    const it = L.byUid[t.anchor];
    if (!it || it.detached) return null;
    if (t.mount === 'above') return { centers: spread(it, it.yTop - height / 2), nodes: spread(it, it.yTop) };
    if (t.mount === 'below') return { centers: spread(it, it.yBottom + height / 2), nodes: spread(it, it.yBottom) };

    const edge = it.x + it.def.diameter / 2, x = edge + def.diameter / 2 + SIDE_GAP;
    const ySide = it.yBottom - def.height / 2, yNode = def.radial ? ySide : (it.yTop + it.yBottom) / 2;
    if (it.side) return { centers: spread({ ...it, x }, ySide), nodes: spread({ ...it, x: edge }, yNode) };
    if (t.dir) return { centers: [{ x: t.dir * x, y: ySide }], nodes: [{ x: t.dir * edge, y: yNode }] };
    return { centers: [{ x, y: ySide }, { x: -x, y: ySide }], nodes: [{ x: edge, y: yNode }, { x: -edge, y: yNode }] };
  };

  const out = [];
  for (const t of targets) {
    const g = geometry(t);
    if (!g) continue;
    let centers = g.centers;
    if (t.ok) {
      const Lt = layout(t.blueprint, cat), n = Lt.byUid[t.uid];
      if (n) centers = spread(n, (n.yTop + n.yBottom) / 2 - reflowShift(L, Lt));
    }
    out.push({ mount: t.mount, anchor: t.anchor, dir: t.dir || 0, free: !!t.free, centers, nodes: g.nodes, ok: t.ok, error: t.error, bp: t.blueprint, uid: t.uid });
  }
  return out;
}

export function pickTarget(targets, wx, wy, maxDist) {
  let best = null, bd = Infinity;
  for (const t of targets) {
    if (t.free) return t;
    for (const c of t.centers) { const d = Math.hypot(c.x - wx, c.y - wy); if (d < bd) { bd = d; best = t; } }
  }
  return best && bd <= maxDist ? best : null;
}

export function reflowShift(oldL, newL) {
  for (const uid of Object.keys(oldL.byUid)) if (newL.byUid[uid]) return newL.byUid[uid].yTop - oldL.byUid[uid].yTop;
  return 0;
}