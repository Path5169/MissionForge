
function paintPayloadSprite(ctx, payload, { x, yBottom, S }) {
  const summary = payload.summary || {};
  const w = Math.max(0.6, Math.min(2.8, Number(summary.width) || 1.2)) * S;
  const h = Math.max(0.6, Math.min(3.2, Number(summary.height) || 1.3)) * S;
  const bw = w * 0.65, bh = h * 0.6;
  const bx = x - bw / 2, by = yBottom - bh;

  ctx.save();
  const pw = Math.max(20, w * 0.7);
  ctx.fillStyle = '#1e3a8a';
  ctx.strokeStyle = '#60a5fa';
  ctx.lineWidth = 1;
  ctx.fillRect(bx - pw, by + bh * 0.2, pw, bh * 0.6);
  ctx.strokeRect(bx - pw, by + bh * 0.2, pw, bh * 0.6);
  ctx.fillRect(bx + bw, by + bh * 0.2, pw, bh * 0.6);
  ctx.strokeRect(bx + bw, by + bh * 0.2, pw, bh * 0.6);

  const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  g.addColorStop(0, '#b45309');
  g.addColorStop(0.3, '#f59e0b');
  g.addColorStop(0.7, '#fbbf24');
  g.addColorStop(1, '#92400e');
  ctx.fillStyle = g;
  ctx.strokeStyle = '#78350f';
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeRect(bx, by, bw, bh);

  ctx.fillStyle = '#94a3b8';
  ctx.beginPath();
  ctx.arc(x, by - 4, bw * 0.35, 0, Math.PI, true);
  ctx.fill();
  ctx.strokeStyle = '#475569';
  ctx.stroke();

  ctx.font = '600 10px Archivo, sans-serif';
  ctx.fillStyle = '#38bdf8';
  ctx.textAlign = 'center';
  ctx.fillText(payload.name || 'Spacecraft', x, by - 12);
  ctx.restore();
}

import { state, mission as missionById } from '../../js/core/store.js';
import { api } from '../../js/core/api.js';
import { h, toast, ask, bus } from '../../js/core/bus.js';
import { layout, find, newBlueprint, migrate } from '../../js/vehicle/vehicle.js';
import { attachTargets, pickTarget, reflowShift } from '../../js/vehicle/attach.js';
import { computeStats } from '../../js/vehicle/stats.js';
import { financialSnapshot, canBuildBlueprint } from '../../js/core/economy.js';
import { paintPart, paintFairing, drawIcon, tankLinks } from '../shared/partArt.js';
import { assets } from '../../js/rendering/assets.js';
import { fmtMass, fmtSpeed, fmtMoney, fmtForce, fmtDist, fmtTime, slug } from '../shared/format.js';

const CATS = { command: ['Command', 'probe_core'], aero: ['Aero', 'AERO-CONE-SHORT'], fairing: ['Fairings', 'FAIR-MORE'], heatshield: ['Heat shields', 'BAS-HEATSHIELD'], tank: ['Tanks', 'tank_m'], separator: ['Separators', 'decoupler'], engine: ['Engines', 'engine_vacuum'], landing: ['Landing', 'landing_legs'], utility: ['Utility', 'BAS-RCS'], power: ['Power', 'OTH-SOLAR-3'], docking: ['Docking', 'OTH-DOCK-1'], wheel: ['Wheels', 'OTH-WHEEL-1'] };

const ART_ONLY = true;
const hasArt = def => def.category === 'fairing' || !ART_ONLY || assets.hasPartImage(def);
const paletteOf = (cat, c) => cat.list().filter(x => x.category === c && hasArt(x));
const usesOnlyArt = (bp, cat) => [...(bp.parts || []), ...(bp.looseParts || [])].every(p => { const d = cat.component(p.c); return !d || hasArt(d); });
const ICON = {
  undo: '<svg viewBox="0 0 24 24"><path d="M9 7 4 12l5 5M4 12h10a6 6 0 0 1 0 12" transform="translate(0 -3)" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  redo: '<svg viewBox="0 0 24 24"><path d="m15 7 5 5-5 5M20 12H10a6 6 0 0 0 0 12" transform="translate(0 -3)" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  fit: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  sym: '<svg viewBox="0 0 24 24"><path d="M12 3v18" stroke="currentColor" stroke-width="1.8" stroke-dasharray="2.5 2.5" fill="none"/><path d="M9 6 3 12l6 6zM15 6l6 6-6 6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  grid: '<svg viewBox="0 0 24 24"><path d="M4 9h16M4 15h16M9 4v16M15 4v16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  stage: '<svg viewBox="0 0 24 24"><path d="M5 5h14M5 12h14M5 19h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
};
const ico = k => h('span', { class: 'ico', html: ICON[k] });
const sidesOf = it => it.side ? (it.dir ? [it.dir] : [1, -1]) : [0];
const SNAP_PX = 36, SNAP_MAX_PX = 70, FREE_SNAP_PX = 22, DRAG_PX = 6, clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const workshop = {
  sel: null, hover: null, stats: null, sym: true, snap: true, gridStep: 1, openCat: null, hist: [], fut: [], drag: null, L: null, raf: 0,
  view: { k: 40, ox: 0, oy: 0, tk: 40, tox: 0, toy: 0, auto: true },
  get bp() { return state.blueprint; }, get cat_() { return state.catalog; },

  mount(root) {
    this.root = root; root.innerHTML = '';
    this.name = h('input', { type: 'text', class: 'name', maxlength: 80, 'aria-label': 'Vehicle name', onchange: () => { state.blueprint.name = this.name.value.trim() || 'Untitled vehicle'; } });
    this.ctx = h('div', { class: 'ctx' });
    const top = h('div', { class: 'ws-top' }, h('button', { class: 'brand', onclick: () => bus.emit('nav', 'menu'), title: 'Main menu' }, 'MissionForge'),
      h('span', { class: 'top-divider', 'aria-hidden': 'true' }),
      this.name, h('div', { class: 'ws-actions' },
        h('button', { class: 'btn', onclick: () => this.newVehicle() }, 'New'),
        h('button', { class: 'btn primary', onclick: () => this.save() }, 'Save'),
        h('button', { class: 'btn', onclick: () => this.openLoad() }, 'Load'),
        h('button', { class: 'btn', onclick: () => bus.emit('nav', 'payloadWorkshop') }, 'Payload editor'),
        this.payloadBadge = h('button', { class: 'chip payload-chip', style: 'border-color: #52d6ea; color: #52d6ea;', onclick: () => bus.emit('nav', 'payloadWorkshop') }, '🛰️ Payload')),
      h('div', { class: 'grow' }), this.ctx);
    this.canvas = h('canvas', { tabindex: 0, 'aria-label': 'Vehicle assembly area' }); this.selbar = h('div', { class: 'ws-selbar', hidden: true });
    this.empty = h('div', { class: 'ws-empty' }, h('div', { class: 'big' }, 'Build your vehicle'), h('div', { class: 'dim' }, 'Choose a part, then drag it onto the assembly area.'),
      h('button', { class: 'btn', onclick: () => this.openLoad() }, 'Open an example rocket'));
    this.sheet = h('div', { class: 'ws-sheet' }, this.canvas, this.empty, this.selbar);
    this.rail = h('nav', { class: 'ws-rail', 'aria-label': 'Part categories' }, Object.entries(CATS).filter(([c]) => paletteOf(this.cat_, c).length).map(([c, [label, icon]]) => {
      const cv = h('canvas', { class: 'ri' }); const b = h('button', { class: 'rail-btn', 'data-cat': c, title: label, onclick: () => this.toggleCat(c) }, cv, h('span', {}, label)); b._icon = [cv, icon]; return b;
    }));
    this.fly = h('div', { class: 'ws-fly' });
    this.bar = h('div', { class: 'ws-bar' }); this.pill = h('button', { class: 'ws-pill', hidden: true, onclick: () => this.toggleDrawer(true, 'stats') });
    this.undoBtn = h('button', { class: 'round', title: 'Undo (Ctrl+Z)', 'aria-label': 'Undo', onclick: () => this.undo() }, ico('undo'));
    this.redoBtn = h('button', { class: 'round', title: 'Redo (Ctrl+Y)', 'aria-label': 'Redo', onclick: () => this.redo() }, ico('redo'));
    this.fitBtn = h('button', { class: 'round', title: 'Fit rocket to screen (F)', 'aria-label': 'Fit to screen', onclick: () => { this.view.auto = true; this.invalidate(); } }, ico('fit'));
    this.tools = h('div', { class: 'ws-tools' }, this.fitBtn, this.redoBtn, this.undoBtn);
    this.info = h('aside', { class: 'ws-info', 'aria-label': 'Vehicle details' });
    this.symBtn = h('button', { class: 'chip', onclick: () => this.setMode('sym') }, h('span', {}, 'Symmetry'));
    this.snapBtn = h('button', { class: 'chip', onclick: () => this.setMode('snap') }, h('span', {}, 'Grid snap'));
    this.fairingBtn = h('button', { class: 'chip', onclick: () => this.toggleAllShrouds() }, h('span', {}, 'Fairings'));
    this.modes = h('div', { class: 'ws-modes', role: 'group', 'aria-label': 'Build options' }, this.symBtn, this.snapBtn, this.fairingBtn);
    this.bin = h('div', { class: 'ws-bin', 'aria-hidden': 'true' }, ico('trash'), h('span', {}, 'Drop here to delete'));
    root.append(this.sheet, top, this.rail, this.fly, this.pill, this.bar, this.tools, this.modes, this.bin, this.info); this.renderModes();
    this.rail.querySelectorAll('.rail-btn').forEach(b => { b._ready = false; });

    this.canvas.addEventListener('pointerdown', e => this.canvasDown(e));
    this.canvas.addEventListener('pointermove', e => { if (this.drag || this.pressing) return; const r = this.canvas.getBoundingClientRect(), u = this.hit(e.clientX - r.left, e.clientY - r.top); if (u !== this.hover) { this.hover = u; this.canvas.style.cursor = u ? 'grab' : ''; this.invalidate(); } });
    this.canvas.addEventListener('pointerleave', () => { if (this.hover) { this.hover = null; this.invalidate(); } });
    this.canvas.addEventListener('wheel', e => this.wheel(e), { passive: false });
    this.canvas.addEventListener('dblclick', () => { this.view.auto = true; this.invalidate(); });
    new ResizeObserver(() => this.invalidate()).observe(this.sheet); window.addEventListener('keydown', e => this.key(e));
  },
  show() {
    this.name.value = state.blueprint.name; this.hist = []; this.fut = []; this.sel = null; this.hover = null; this.drag = null; this.view.auto = true;
    this.infoMode = 'stats'; this.partPreview = null; this.toggleDrawer(false);
    this.L = layout(this.bp, this.cat_); this.railIcons(); const cats = [...this.rail.children].map(b => b.dataset.cat); if (!cats.includes(this.openCat)) this.openCat = cats.includes(this.bp.parts.length ? 'tank' : 'command') ? (this.bp.parts.length ? 'tank' : 'command') : cats[0]; this.renderCtx(); this.setCat(this.openCat, true); this.refresh(); this.snapView();
  },
  hide() { this.cancelDrag(); },
  bodyId() { return state.mode === 'mission' && state.missionId ? missionById(state.missionId).body : 'earth'; },
  railIcons() { for (const b of this.rail.children) if (!b._ready) { const [cv, id] = b._icon, d = this.cat_.component(id); if (d) { drawIcon(cv, d, { w: 40, h: 34, pad: 2, cap: 26 }); b._ready = true; } } },

  
  apply(bp, { sel, stats = true, shift = true } = {}) {
    const old = this.L; state.blueprint = bp; this.L = layout(bp, this.cat_);
    if (shift && old && old.items.length && this.L.items.length) this.shiftView(reflowShift(old, this.L));
    if (sel !== undefined) this.sel = sel; if (this.sel && !find(bp, this.sel)) this.sel = null;
    if (stats) this.refresh(); else this.invalidate();
  },
  commit(bp, sel) { this.pushHist(this.bp, this.sel); this.apply(bp, { sel }); },
  pushHist(bp, sel) { this.hist.push({ bp: structuredClone(bp), sel }); if (this.hist.length > 100) this.hist.shift(); this.fut = []; this.renderTools(); },
  undo() { const e = this.hist.pop(); if (!e) return; this.fut.push({ bp: structuredClone(this.bp), sel: this.sel }); this.apply(e.bp, { sel: e.sel }); this.renderTools(); },
  redo() { const e = this.fut.pop(); if (!e) return; this.hist.push({ bp: structuredClone(this.bp), sel: this.sel }); this.apply(e.bp, { sel: e.sel }); this.renderTools(); },
  shiftView(dy) { if (!dy) return; const v = this.view; v.oy -= dy * v.k; v.toy -= dy * v.k; },
  refresh() {
    const request = this.statsRequest = (this.statsRequest || 0) + 1;
    this.empty.hidden = !!(this.bp.parts.length || this.bp.looseParts?.length || this.drag);
    const activeMission = state.mode === 'mission' && state.missionId ? missionById(state.missionId) : null;
    this.finances = financialSnapshot(this.bp, this.cat_, activeMission, state.mode);
    this.stats = { ...(this.stats || { partCount: 0, looseCount: 0, dryMass: 0, propellant: 0, wetMass: 0, cost: 0, height: 0, g: 0, stages: [], dv: 0, twrSL: 0, twrVac: 0 }), bodyId: this.bodyId(), errors: ['Calculating vehicle statistics…'], warnings: [], ready: false };
    this.renderBar(); this.renderInfo(); this.renderSel(); this.renderTools(); this.invalidate();
    computeStats(this.bp, this.cat_, this.bodyId(), state.mode === 'mission' ? state.missionId : null).then(stats => {
      if (request !== this.statsRequest) return;
      this.stats = stats; this.renderBar(); this.renderInfo(); this.invalidate();
    }).catch(error => {
      if (request !== this.statsRequest) return;
      console.error('[MissionForge] /api/vehicle/stats failed:', error);
      this.stats = { ...this.stats, ready: false, errors: [`Backend calculation failed: ${error.message}`] };
      this.renderBar(); this.renderInfo(); this.invalidate();
    });
  },
  async remove() {
    if (!this.sel) return;
    try {
      const r = await api.vehicleRemovePart(this.bp, this.sel);
      if (!r.ok) { toast(r.error || 'Part could not be removed.', 'warn'); return; }
      r.notes.forEach(n => toast(n, 'warn'));
      this.commit(r.blueprint, null);
    } catch (e) { toast(e.message, 'bad', 5000); }
  },
  async stageEdit(p, dlt) {
    try { this.commit((await api.vehicleSetStage(this.bp, p.uid, p.stage + dlt)).blueprint, this.sel); } catch (e) { toast(e.message, 'bad', 5000); }
  },
  async groupEdit(p, dlt) {
    try { this.commit((await api.vehicleSetGroup(this.bp, p.uid, p.group + dlt)).blueprint, this.sel); } catch (e) { toast(e.message, 'bad', 5000); }
  },
  async restage() {
    try { this.commit((await api.vehicleAutoStage({ ...this.bp, stagingMode: 'auto' })).blueprint, this.sel); } catch (e) { toast(e.message, 'bad', 5000); }
  },

  setMode(k) { this[k] = !this[k]; this.renderModes(); if (k === 'sym' && this.fly.classList.contains('open')) this.renderFly(); this.invalidate(); },
  renderModes() {
    const allOpen = this.stageSections().length > 0 && this.stageSections().every(s => this.shroudOpen?.[s.id]);
    for (const [b, on, tip] of [
      [this.symBtn, this.sym, 'Symmetry (M): side parts as a mirrored pair, or one at a time'],
      [this.snapBtn, this.snap, 'Grid snap (G): lock dragged parts to the grid and pull toward attach nodes'],
      [this.fairingBtn, allOpen, allOpen ? 'Fairings: reset and re-install fairings' : 'Fairings: jettison all stage fairings']
    ]) {
      b.classList.toggle('on', !!on);
      b.setAttribute('aria-pressed', !!on);
      b.title = tip;
    }
  },


  renderCtx() {
  this.ctx.innerHTML = '';
  const m = state.mode === 'mission' && state.missionId ? missionById(state.missionId) : null;
  if (m) this.ctx.append(
    h('span', { class: 'mission-tag' }, 'Mission: ' + m.title),
    h('button', { class: 'btn small quiet', onclick: () => { state.mode = 'sandbox'; state.missionId = null; this.show(); } }, 'Leave mission'));
  else this.ctx.append(h('span', { class: 'workspace-mode' }, state.mode === 'sandbox' ? 'Sandbox' : 'Workshop · build & save'));

  this.launchBtn = null;
  if (m || state.mode === 'sandbox' || state.mode === 'workshop') {
    this.launchBtn = h('button', { class: 'btn primary launch-btn', onclick: () => this.launch() }, 'Launch ▶');
    this.ctx.append(this.launchBtn);
    if (this.stats) this.launchBtn.disabled = !this.stats.ready;
  }
},
launch() {
  if (!this.stats?.ready) { toast(this.stats?.errors?.[0] || 'Vehicle is not launch-ready.', 'warn'); return; }
  const m = state.mode === 'mission' && state.missionId ? missionById(state.missionId) : null;
  bus.emit('nav', 'flight', {
    bodyId: m ? m.body : 'earth',
    start: m ? m.start : { type: 'pad' },
    blueprint: structuredClone(state.blueprint),
    missionId: m ? m.id : undefined,
  });
},

  toggleCat(c) { this.setCat(this.openCat === c && this.fly.classList.contains('open') ? null : c); },
  setCat(c, force) {
    if (c) this.openCat = c; const open = !!c; this.fly.classList.toggle('open', open); this.root.classList.toggle('fly-open', open);
    for (const b of this.rail.children) b.classList.toggle('on', open && b.dataset.cat === this.openCat);
    if (open) this.renderFly(); if (!force) this.invalidate();
  },
  renderFly() {
    const f = this.fly, c = this.openCat; f.innerHTML = '';
    f.append(h('div', { class: 'fly-h' }, h('b', {}, CATS[c][0]), h('span', { class: 'fly-hint' }, `${paletteOf(this.cat_, c).length} parts`)));
    const grid = h('div', { class: 'fly-grid' });
    const palette = paletteOf(this.cat_, c).slice().sort((a, b) => c === 'fairing' ? Number(a.shape === 'cylinder' || a.shape === 'ring') - Number(b.shape === 'cylinder' || b.shape === 'ring') || a.name.localeCompare(b.name) : 0);
    for (const d of palette) {
      const cv = h('canvas', {}); const code = d.name.split(' ')[0], label = d.name.slice(code.length + 1).replace(/ \(pair\)/, '');
      const displayLabel = c === 'fairing' && (d.shape === 'cylinder' || d.shape === 'ring') ? `Cylindrical tank shroud · ${label}` : label;
      const meta = `${d.engine ? `${fmtForce(d.engine.thrustVac)} thrust` : d.tank ? `${fmtMass(d.tank.propellant)} fuel` : fmtMass(d.mass)} · ${fmtMoney(d.cost * (d.radial && this.sym ? 2 : 1))}${d.radial && this.sym ? ' pair' : ''}`;
      const card = h('div', { class: 'item', role: 'group', tabindex: 0, 'data-id': d.id, 'aria-label': d.name },
        cv, h('div', { class: 'item-copy' },
          h('div', { class: 'n' }, code + (d.radial ? (this.sym ? ' ×2' : ' ×1') : '')),
          h('div', { class: 'l' }, displayLabel), h('div', { class: 'm' }, meta)),
        h('button', { class: 'item-info', type: 'button', 'aria-label': `Details for ${d.name}`, onclick: e => { e.stopPropagation(); this.showPartDetails(d); } }, 'Details'));
      card.querySelector('.item-info').addEventListener('pointerdown', e => e.stopPropagation());
      card.addEventListener('pointerdown', e => this.cardDown(e, d));
      grid.append(card); requestAnimationFrame(() => drawIcon(cv, d, { w: 64, h: 64, pad: 5, cap: 46 }));
    }
    f.append(grid, h('div', { class: 'fly-foot' }, 'Drag onto canvas · near a node to attach · hold Alt to place loose'));
  },
  partRows(d, n = 1) {
    const profile = d.behaviorProfile;
    const rows = [['Part ID', d.id], ['Role', profile?.role || d.category], ['How it works', profile?.description || d.description], ['Activation', profile?.activation || 'Passive'], ['Effect', profile?.effects || 'Structural or visual contribution'], ['Mass', fmtMass(d.mass * n) + (n > 1 ? ` (${n}×)` : '')], ['Size', `${d.diameter} × ${d.height} m`], ['Cost', fmtMoney(d.cost * n)]];
    if (d.engine) rows.push(['Thrust (vac)', fmtForce(d.engine.thrustVac * n)], ['Isp vac / sea level', `${d.engine.ispVac} / ${d.engine.ispSL} s`], ['Min throttle', d.engine.type === 'solid' ? 'fixed' : Math.round(d.engine.minThrottle * 100) + '%'], ['Propulsion', d.engine.type]);
    if (d.powerDraw) rows.push(['Electrical demand', d.powerDraw + ' kW']);
    if (d.tank) rows.push(['Propellant', fmtMass(d.tank.propellant)]); if (d.solid) rows.push(['Propellant', fmtMass(d.solid.propellant * n)]); if (d.landing) rows.push(['Safe landing speed', d.landing.maxSpeed + ' m/s']);
    if (d.parachute) rows.push(['Canopy area', d.parachute.canopyArea + ' m²'], ['Deploy altitude', d.parachute.deploymentAltitude + ' m'], ['Max deploy speed', d.parachute.maxDeploySpeed + ' m/s']);
    if (d.heatshield) rows.push(['Ablative material', fmtMass(d.heatshield.ablativeMass)], ['Design temperature', d.heatshield.maxTemperature + ' °C']);
    if (d.power) rows.push(['Power output', d.power.outputKW + ' kW']);
    if (d.rcs) rows.push(['RCS thrust', fmtForce(d.rcs.thrust)], ['Propellant reserve', fmtMass(d.rcs.propellant)]);
    if (d.wheel) rows.push(['Wheel radius', d.wheel.radius + ' m'], ['Rated speed', d.wheel.maxSpeed + ' m/s']);
    if (d.docking) rows.push(['Capture radius', d.docking.captureRadius + ' m']);
    if (d.payload) rows.push(['Payload type', d.payload.type || 'Mission payload'], ['Scientific value', d.payload.scienceValue ? d.payload.scienceValue + ' pts' : 'High']);
    if (d.science) rows.push(['Instruments', Array.isArray(d.science.instruments) ? d.science.instruments.join(', ') : d.science.type || 'Survey suite']);
    if (d.lander) rows.push(['Lander crew', d.lander.crewCapacity ? `${d.lander.crewCapacity} crew` : 'Uncrewed'], ['Stage role', d.lander.stage || 'Descent / Ascent']);
    if (d.sampleReturn) rows.push(['Capacity', d.sampleReturn.capacity || 'Hermetic sample canister'], ['Heat protection', d.sampleReturn.heatProtected ? 'Yes' : 'No']);
    if (profile?.runtimeStatus) rows.push(['Runtime module', profile.runtimeStatus]);
    if (d.specBasis) rows.push(['Real-world basis', d.specBasis]);
    if (d.simulationStatus) rows.push(['Flight support', d.simulationStatus]);
    return rows;
  },
  cardDown(e, d) {
    if (e.button !== 0) return; e.preventDefault(); const sx = e.clientX, sy = e.clientY; let started = false;
    const move = ev => { if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) > DRAG_PX) { started = true; this.beginDrag({ def: d }, ev); } if (started) this.updateDrag(ev); };
    const off = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); };
    const up = ev => { off(); if (started) this.dragEnd(ev); };
    const cancel = () => { off(); if (started) this.cancelDrag(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel);
  },

  
  beginDrag({ def, uid }, ev) {
    const p = uid && find(this.bp, uid);
    const d = { def: def || this.cat_.component(p.c), uid: uid || null, part: p && structuredClone(p), orig: structuredClone(this.bp), origSel: this.sel, autoBefore: this.view.auto, px: ev.clientX, py: ev.clientY, target: null, targets: [], over: false, overCanvas: false, notes: [], fromRocket: !!uid, sym: uid ? !p.dir : this.sym, overBin: false, pending: null };
    this.partPreview = null;
    this.drag = d; this.root.classList.add('dragging'); this.empty.hidden = true; this.selbar.hidden = true; this.hover = null;
    if (uid) { this.view.auto = false; this.sel = null; this.root.classList.add('drag-rocket'); }
    d.pending = (async () => {
      try {
        if (uid) {
          const r = await api.vehicleRemovePart(this.bp, uid);
          if (this.drag !== d) return;
          d.notes = r.notes || [];
          this.apply(r.blueprint, { stats: false });
        }
        const targets = await attachTargets(this.bp, this.cat_, d.def, { sym: d.sym });
        if (this.drag !== d) return;
        d.targets = targets;
      } catch (e) {
        if (this.drag === d) { toast(e.message, 'bad', 5000); this.cancelDrag(); }
        return;
      } finally {
        d.pending = null;
      }
      this.updateDrag({ clientX: d.px, clientY: d.py });
    })();
    this.updateDrag(ev);
  },
  overPalette(x, y) {
    const hit = el => { if (!el || el.hidden) return false; const r = el.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
    return hit(this.rail) || (this.fly.classList.contains('open') && hit(this.fly)) || hit(this.root.querySelector('.ws-top')) || (this.info.classList.contains('open') && hit(this.info));
  },
  updateDrag(ev) {
    const d = this.drag; if (!d) return; d.px = ev.clientX; d.py = ev.clientY; const br = this.bin.getBoundingClientRect(); d.overBin = d.fromRocket && d.px >= br.left && d.px <= br.right && d.py >= br.top && d.py <= br.bottom; this.bin.classList.toggle('hot', d.overBin); d.over = d.overBin || this.overPalette(d.px, d.py);
    const r = this.canvas.getBoundingClientRect(), v = this.view, wx = (d.px - r.left - v.ox) / v.k, wy = (d.py - r.top - v.oy) / v.k;
    d.overCanvas = d.px >= r.left && d.px <= r.right && d.py >= r.top && d.py <= r.bottom && !d.over;
    if (ev.altKey !== undefined) d.alt = ev.altKey;
    const snap = (this.snap ? clamp(SNAP_PX + .1 * d.def.height * v.k, SNAP_PX, SNAP_MAX_PX) : FREE_SNAP_PX) / v.k, t = d.over || d.alt ? null : pickTarget(d.targets.filter(q => q.ok), wx, wy, snap);
    if (t?.ok && !canBuildBlueprint(t.bp, this.cat_, state.mode === 'mission' ? missionById(state.missionId) : null, state.mode, d.orig)) {
      t.ok = false;
      t.error = 'This component would exceed the mission construction allowance.';
    }
    d.target = t;
    if (t && t.ok && !t.preview) { const L = layout(t.bp, this.cat_); t.preview = { L, dy: reflowShift(this.L, L) }; }
    this.invalidate();
  },
  async dragEnd() {
    const d = this.drag; if (!d) return;
    if (d.pending) { await d.pending; if (this.drag !== d) return; }
    const t = d.target; this.drag = null; this.root.classList.remove('dragging', 'drag-rocket'); this.bin.classList.remove('hot');
    if (t && t.ok) { this.view.auto = d.autoBefore; this.pushHist(d.orig, d.origSel); d.notes.forEach(n => toast(n, 'warn')); this.apply(t.bp, { sel: t.uid }); return; }
    if (d.fromRocket && d.overBin) { this.view.auto = d.autoBefore; this.pushHist(d.orig, d.origSel); d.notes.forEach(n => toast(n, 'warn')); toast('Part removed', ''); this.apply(this.bp, { sel: null }); return; }
    if (d.overCanvas) {
      const { x, y } = this.dropPosition(d);
      let r;
      try { r = await api.vehicleAddLoosePart(this.bp, d.def.id, x, y, { uid: d.part?.uid, stage: d.part?.stage, group: d.part?.group }); } catch (e) { r = { ok: false, error: e.message }; }
      if (!r.ok) { this.view.auto = d.autoBefore; toast(r.error, 'warn', 4200); if (d.fromRocket) this.apply(d.orig, { sel: d.origSel }); else this.refresh(); return; }
      if (!canBuildBlueprint(r.blueprint, this.cat_, state.mode === 'mission' ? missionById(state.missionId) : null, state.mode, d.orig)) {
        this.view.auto = d.autoBefore;
        toast('This component would exceed the mission construction allowance.', 'warn', 4200);
        if (d.fromRocket) this.apply(d.orig, { sel: d.origSel }); else this.refresh();
        return;
      }
      this.view.auto = d.autoBefore;
      this.pushHist(d.orig, d.origSel); d.notes.forEach(n => toast(n, 'warn')); this.partPreview = null; this.apply(r.blueprint, { sel: r.uid, shift: false });
      return;
    }
    this.view.auto = d.autoBefore;
    if (!d.over) toast('Drop the part on the assembly grid to place it.', '', 2600);
    if (d.fromRocket) this.apply(d.orig, { sel: d.origSel }); else this.refresh();
  },
  stageSections() {
    const L = this.L, bp = this.bp;
    if (!bp?.parts?.length || !L?.items?.length) return [];
    const main = L.items.filter(it => !it.side && !it.detached).sort((a, b) => a.yTop - b.yTop);
    if (!main.length) return [];
    const sections = [];
    let curr = [];
    let idx = 0;
    for (const it of main) {
      if (it.def.separator && !it.def.clamp) {
        if (curr.length) {
          const yTop = Math.min(...curr.map(i => i.yTop));
          const yBottom = Math.max(...curr.map(i => i.yBottom));
          const maxD = Math.max(...curr.map(i => i.def.diameter || 1.2));
          sections.push({ id: `sec-${idx++}`, yTop, yBottom, maxD, x: 0, items: curr });
          curr = [];
        }
      } else {
        curr.push(it);
      }
    }
    if (curr.length) {
      const yTop = Math.min(...curr.map(i => i.yTop));
      const yBottom = Math.max(...curr.map(i => i.yBottom));
      const maxD = Math.max(...curr.map(i => i.def.diameter || 1.2));
      sections.push({ id: `sec-${idx++}`, yTop, yBottom, maxD, x: 0, items: curr });
    }
    return sections;
  },
  toggleAllShrouds() {
    const secs = this.stageSections();
    if (!secs.length) return;
    const allOpen = secs.length > 0 && secs.every(s => this.shroudOpen?.[s.id]);
    this.shroudOpen = this.shroudOpen || {};
    this.shroudJettison = this.shroudJettison || {};
    if (allOpen) {
      this.shroudOpen = {};
      this.shroudJettison = {};
    } else {
      const now = performance.now();
      for (const s of secs) {
        if (!this.shroudOpen[s.id]) {
          this.shroudOpen[s.id] = true;
          this.shroudJettison[s.id] = now;
        }
      }
    }
    this.renderModes();
    this.invalidate();
  },
  toggleShroudAt(mx, my) {
    const v = this.view, k = v.k;
    const X = x => v.ox + x * k, Y = y => v.oy + y * k;
    const secs = this.stageSections();
    for (const sec of secs) {
      const x = X(sec.x), y0 = Y(sec.yTop), y1 = Y(sec.yBottom);
      const w = (sec.maxD + 0.35) * k;
      const isOpen = !!this.shroudOpen?.[sec.id];
      if (!isOpen) {
        if (mx >= x - w / 2 - 14 && mx <= x + w / 2 + 14 && my >= y0 - 6 && my <= y1 + 6) {
          this.shroudOpen = this.shroudOpen || {};
          this.shroudJettison = this.shroudJettison || {};
          this.shroudOpen[sec.id] = true;
          this.shroudJettison[sec.id] = performance.now();
          this.renderModes();
          this.invalidate();
          return true;
        }
      }
    }
    return false;
  },
  isItemCovered(it) {
    if (!it || it.def.separator) return false;
    const secs = this.stageSections();
    for (const sec of secs) {
      if (sec.items.some(i => i.uid === it.uid)) {
        return !this.shroudOpen?.[sec.id];
      }
    }
    return false;
  },
  dropPosition(d) {
    const r = this.canvas.getBoundingClientRect(), v = this.view, gs = this.gridStep * v.k;
    let sx = d.px - r.left, sy = d.py - r.top;
    if (this.snap) { sx = v.ox + Math.round((sx - v.ox) / gs) * gs; sy = v.oy + Math.round((sy - v.oy) / gs) * gs; }
    return { x: (sx - v.ox) / v.k, y: (sy - v.oy) / v.k };
  },
  cancelDrag() {
    const d = this.drag; if (!d) return; this.drag = null; this.root.classList.remove('dragging', 'drag-rocket'); this.bin.classList.remove('hot');
    this.view.auto = d.autoBefore;
    if (d.fromRocket) this.apply(d.orig, { sel: d.origSel }); else this.refresh();
  },

 
  hit(mx, my) {
    const v = this.view, L = this.L; if (!L) return null;
    for (const it of L.items.slice().reverse()) for (const sx of sidesOf(it)) {
      if (this.isItemCovered(it)) continue;
      const x = v.ox + (it.detached ? it.x : sx * it.x) * v.k, w = it.def.diameter * v.k;
      if (mx >= x - w / 2 - 3 && mx <= x + w / 2 + 3 && my >= v.oy + it.yTop * v.k - 3 && my <= v.oy + it.yBottom * v.k + 3) return it.uid;
    }
    return null;
  },
  canvasDown(e) {
    if (e.button !== 0 && e.button !== 1) return; e.preventDefault(); this.canvas.focus(); const r = this.canvas.getBoundingClientRect(), v = this.view;
    const uid = e.button === 0 ? this.hit(e.clientX - r.left, e.clientY - r.top) : null, start = { x: e.clientX, y: e.clientY, ox: v.ox, oy: v.oy }; let started = false; this.pressing = true;
    if (uid && uid !== this.sel) { this.sel = uid; this.partPreview = null; this.renderSel(); this.renderInfo(); this.invalidate(); }
    const move = ev => {
      const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
      if (uid) { if (!started && Math.hypot(dx, dy) > DRAG_PX) { started = true; this.beginDrag({ uid }, ev); } if (started) this.updateDrag(ev); return; }
      if (started || Math.hypot(dx, dy) > 3) { started = true; v.auto = false; v.ox = v.tox = start.ox + dx; v.oy = v.toy = start.oy + dy; v.tk = v.k; this.canvas.style.cursor = 'grabbing'; this.invalidate(); }
    };
    const off = () => { this.pressing = false; this.canvas.style.cursor = ''; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); };
    const up = ev => {
      off();
      if (!started && this.toggleShroudAt(ev.clientX - r.left, ev.clientY - r.top)) return;
      if (uid) { if (started) this.dragEnd(ev); } else if (!started && this.sel) { this.sel = null; this.partPreview = null; this.renderSel(); this.renderInfo(); this.invalidate(); }
    };
    const cancel = () => { off(); if (started && uid) this.cancelDrag(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel);
  },
  wheel(e) {
    e.preventDefault(); const v = this.view, r = this.canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const k2 = clamp(v.k * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0015)), 5, 170), s = k2 / v.k;
    v.ox = mx - (mx - v.ox) * s; v.oy = my - (my - v.oy) * s; v.k = k2; v.tk = k2; v.tox = v.ox; v.toy = v.oy; v.auto = false; this.invalidate();
  },
  key(e) {
    if (this.root.hidden || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || document.getElementById('dialog').open) return; const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') { if (this.drag) this.cancelDrag(); else if (this.fly.classList.contains('open')) this.setCat(null); else if (this.info.classList.contains('open')) this.toggleDrawer(false); }
    else if (this.drag) return;
    else if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); this.redo(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.remove(); }
    else if (e.key === 'f' || e.key === 'F') { this.view.auto = true; this.invalidate(); }
    else if (e.key === 'm' || e.key === 'M') this.setMode('sym');
    else if (e.key === 'g' || e.key === 'G') this.setMode('snap');
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault(); const L = this.L.items.filter(i => !i.side), i = L.findIndex(x => x.uid === this.sel), n = L[clamp(i < 0 ? 0 : i + (e.key === 'ArrowDown' ? 1 : -1), 0, L.length - 1)];
      if (n) { this.sel = n.uid; this.renderSel(); this.renderInfo(); this.invalidate(); }
    }
  },


  fitTarget() {
    const W = this.sheet.clientWidth, H = this.sheet.clientHeight, L = this.L, sr = this.sheet.getBoundingClientRect();
    const panel = this.fly.classList.contains('open') ? this.fly : this.rail, x0 = panel.getBoundingClientRect().right - sr.left + 18;
    const x1 = W - (this.info.classList.contains('open') ? 370 : 36), y0 = 30, y1 = H - 110;
    const b = L.bounds, w = Math.max(2.6, b.maxX - b.minX), hM = Math.max(4, b.maxY - b.minY), k = Math.max(6, Math.min((x1 - x0 - 80) / w, (y1 - y0) / hM * .94, 78));
    return { k, ox: (x0 + x1) / 2 - (b.minX + b.maxX) * k / 2, oy: (y0 + y1) / 2 - (b.minY + b.maxY) * k / 2 };
  },
  snapView() { const t = this.fitTarget(), v = this.view; Object.assign(v, { k: t.k, ox: t.ox, oy: t.oy, tk: t.k, tox: t.ox, toy: t.oy }); this.invalidate(); },
  invalidate() { if (this.raf || !this.root || this.root.hidden) return; this.raf = requestAnimationFrame(() => { this.raf = 0; this.frame(); }); },
  frame() {
    const v = this.view; if (v.auto) { const t = this.fitTarget(); v.tk = t.k; v.tox = t.ox; v.toy = t.oy; }
    const e = .24; v.k += (v.tk - v.k) * e; v.ox += (v.tox - v.ox) * e; v.oy += (v.toy - v.oy) * e;
    const moving = Math.abs(v.tk - v.k) > .02 || Math.abs(v.tox - v.ox) > .3 || Math.abs(v.toy - v.oy) > .3; if (!moving) { v.k = v.tk; v.ox = v.tox; v.oy = v.toy; }
    this.draw(); this.placeSel(); if (moving || this.drag || this.pulse) this.invalidate();
  },
  draw() {
    const c = this.canvas, d = Math.min(window.devicePixelRatio || 1, 2), W = this.sheet.clientWidth, H = this.sheet.clientHeight; if (!W || !H) return;
    if (c.width !== Math.round(W * d) || c.height !== Math.round(H * d)) { c.width = Math.round(W * d); c.height = Math.round(H * d); }
    const ctx = c.getContext('2d'), v = this.view, k = v.k, dr = this.drag, tgt = dr?.target, pv = tgt?.ok ? tgt.preview : null, L = pv ? pv.L : this.L, dy = pv ? pv.dy : 0;
    const X = x => v.ox + x * k, Y = y => v.oy + (y - dy) * k, now = performance.now(); ctx.setTransform(d, 0, 0, d, 0, 0);
    
        ctx.fillStyle = '#426295'; ctx.fillRect(0, 0, W, H);
    let step = 1; for (const s of [1, 2, 5, 10, 20, 50]) { step = s; if (s * k >= 16) break; }
    const grid = (s, a, lw) => { ctx.strokeStyle = `rgba(15,35,90,${a*3})`; ctx.lineWidth = lw; ctx.beginPath(); for (let x = v.ox + Math.ceil((0 - v.ox) / (s * k)) * s * k; x < W; x += s * k) { ctx.moveTo(Math.round(x) + .5, 0); ctx.lineTo(Math.round(x) + .5, H); } for (let y = v.oy + Math.ceil((0 - v.oy) / (s * k)) * s * k; y < H; y += s * k) { ctx.moveTo(0, Math.round(y) + .5); ctx.lineTo(W, Math.round(y) + .5); } ctx.stroke(); };
    this.gridStep = step; grid(step, .045, 1); grid(step * 5, .12, 1);
    ctx.setLineDash([7, 9]); ctx.strokeStyle = 'rgba(10,25,70,.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Math.round(v.ox) + .5, 0); ctx.lineTo(Math.round(v.ox) + .5, H); ctx.stroke(); ctx.setLineDash([]);
   
   for (const it of L.items) {
     if (it.def.category !== 'fairing') continue;
     const childPart = this.bp.parts.find(p => p.parent === it.uid && p.mount === 'below');
     const child = childPart && L.byUid[childPart.uid];
     if (!child) continue;
     for (const sx of sidesOf(it)) paintFairing(ctx, it.def, { x: X(it.detached ? it.x : sx ? sx * it.x : 0), top: Y(child.yTop - .12), bottom: Y(child.yBottom + .12), width: child.def.diameter + .5, S: k, alpha: .98 });
   }
   for (const it of L.items) {
     if (it.def.category === 'fairing') continue;
     for (const sx of sidesOf(it)) paintPart(ctx, it.def, { x: X(it.detached ? it.x : sx ? sx * it.x : 0), y: Y(it.yTop), S: k, dir: sx || 1, ...tankLinks(L, it), onload: () => this.invalidate() });
    }
    this.shroudOpen = this.shroudOpen || {};
    this.shroudJettison = this.shroudJettison || {};
    const secs = this.stageSections();
    for (let si = 0; si < secs.length; si++) {
      const sec = secs[si];
      const isOpen = !!this.shroudOpen[sec.id];
      const t0 = this.shroudJettison[sec.id];
      if (isOpen && t0) {
        const dt = (now - t0) / 1000;
        if (dt >= 2.0) continue;
        this.pulse = true;
      } else if (isOpen) {
        continue;
      }

      const dt = isOpen && t0 ? (now - t0) / 1000 : 0;
      const y0 = Y(sec.yTop), y1 = Y(sec.yBottom);
      const h = Math.max(16, y1 - y0);
      const w = (sec.maxD + 0.35) * k;
      const halfW = w / 2;
      const cx = X(0);
      const cy = (y0 + y1) / 2;
      const split = dt === 0 ? 0 : 14 + dt * (halfW * 1.6 + 140);
      const fallY = dt === 0 ? 0 : 450 * dt * dt;
      const rot = dt === 0 ? 0 : dt * 1.5;
      const alpha = dt === 0 ? 1 : (dt < 0.9 ? 1 : Math.max(0, 1 - (dt - 0.9) / 0.9));
      const isTop = si === 0;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(cx - split, cy + fallY);
      ctx.rotate(-rot);
      ctx.translate(-cx, -cy);

      const lGrad = ctx.createLinearGradient(cx - halfW, 0, cx, 0);
      lGrad.addColorStop(0, '#98a2b0');
      lGrad.addColorStop(0.2, '#dce3ec');
      lGrad.addColorStop(0.7, '#f8fafc');
      lGrad.addColorStop(1, '#c9d3e0');
      ctx.fillStyle = lGrad;
      ctx.strokeStyle = '#222834';
      ctx.lineWidth = Math.max(1, k / 32);

      ctx.beginPath();
      if (isTop) {
        ctx.moveTo(cx, y0 - 24 * (k / 32));
        ctx.quadraticCurveTo(cx - halfW, y0, cx - halfW, y0 + h * 0.2);
        ctx.lineTo(cx - halfW, y1);
        ctx.lineTo(cx, y1);
      } else {
        ctx.rect(cx - halfW, y0, halfW, h);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(30, 36, 48, 0.92)';
      ctx.fillRect(cx - halfW, y0, halfW, Math.min(8, h * 0.08));
      ctx.fillRect(cx - halfW, y1 - Math.min(8, h * 0.08), halfW, Math.min(8, h * 0.08));
      ctx.fillStyle = '#f0aa38';
      ctx.fillRect(cx - halfW, y0 + Math.min(8, h * 0.08) - 1.5, halfW, 1.5);
      ctx.fillRect(cx - halfW, y1 - Math.min(8, h * 0.08), halfW, 1.5);

      for (let py = y0 + 36; py < y1 - 20; py += 36) {
        ctx.strokeStyle = 'rgba(70, 85, 105, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - halfW, py);
        ctx.lineTo(cx, py);
        ctx.stroke();
      }
      for (let by = y0 + 16; by < y1 - 10; by += 28) {
        ctx.fillStyle = '#1c222e';
        ctx.fillRect(cx - 3, by, 3, 4);
      }
      if (dt > 0.02) {
        ctx.fillStyle = '#11151c';
        ctx.fillRect(cx - 5, y0, 5, h);
      }
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(cx + split, cy + fallY);
      ctx.rotate(rot);
      ctx.translate(-cx, -cy);

      const rGrad = ctx.createLinearGradient(cx, 0, cx + halfW, 0);
      rGrad.addColorStop(0, '#f8fafc');
      rGrad.addColorStop(0.3, '#ffffff');
      rGrad.addColorStop(0.7, '#d2dae5');
      rGrad.addColorStop(1, '#8c96a5');
      ctx.fillStyle = rGrad;
      ctx.strokeStyle = '#222834';
      ctx.lineWidth = Math.max(1, k / 32);

      ctx.beginPath();
      if (isTop) {
        ctx.moveTo(cx, y0 - 24 * (k / 32));
        ctx.quadraticCurveTo(cx + halfW, y0, cx + halfW, y0 + h * 0.2);
        ctx.lineTo(cx + halfW, y1);
        ctx.lineTo(cx, y1);
      } else {
        ctx.rect(cx, y0, halfW, h);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(30, 36, 48, 0.92)';
      ctx.fillRect(cx, y0, halfW, Math.min(8, h * 0.08));
      ctx.fillRect(cx, y1 - Math.min(8, h * 0.08), halfW, Math.min(8, h * 0.08));
      ctx.fillStyle = '#f0aa38';
      ctx.fillRect(cx, y0 + Math.min(8, h * 0.08) - 1.5, halfW, 1.5);
      ctx.fillRect(cx, y1 - Math.min(8, h * 0.08), halfW, 1.5);

      for (let py = y0 + 36; py < y1 - 20; py += 36) {
        ctx.strokeStyle = 'rgba(70, 85, 105, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, py);
        ctx.lineTo(cx + halfW, py);
        ctx.stroke();
      }
      for (let by = y0 + 16; by < y1 - 10; by += 28) {
        ctx.fillStyle = '#1c222e';
        ctx.fillRect(cx, by, 3, 4);
      }
      if (dt > 0.02) {
        ctx.fillStyle = '#11151c';
        ctx.fillRect(cx, y0, 5, h);
      }
      ctx.restore();

      if (dt === 0) {
        ctx.save();
        ctx.fillStyle = 'rgba(10, 15, 24, 0.76)';
        ctx.beginPath();
        ctx.roundRect(cx - 40, cy - 10, 80, 20, 4);
        ctx.fill();
        ctx.strokeStyle = 'rgba(125, 225, 240, 0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#a6c6e8';
        ctx.font = '600 9px Archivo';
        ctx.textAlign = 'center';
        ctx.fillText('STAGE FAIRING', cx, cy + 3);
        ctx.restore();
      }
    }
    const outline = (it, col, lw, blur) => { if (this.isItemCovered(it)) return; ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = lw; if (blur) { ctx.shadowColor = col; ctx.shadowBlur = blur; } for (const sx of sidesOf(it)) { const x = X(it.detached ? it.x : sx * it.x), w = it.def.diameter * k; ctx.beginPath(); ctx.roundRect(x - w / 2 - 4, Y(it.yTop) - 4, w + 8, (it.yBottom - it.yTop) * k + 8, 4); ctx.stroke(); } ctx.restore(); };
    this.pulse = false;
    if (!dr) {
      if (this.hover && this.hover !== this.sel && L.byUid[this.hover]) outline(L.byUid[this.hover], 'rgba(125,225,240,.5)', 1.5, 0);
      if (this.sel && L.byUid[this.sel]) outline(L.byUid[this.sel], '#52d6ea', 2, 10);
    }
    if (pv && L.byUid[tgt.uid]) { this.pulse = true; outline(L.byUid[tgt.uid], `rgba(95,219,143,${.65 + .3 * Math.sin(now / 130)})`, 2.5, 14); }
    
    if (dr && !pv) {
      this.pulse = true; const ph = .5 + .5 * Math.sin(now / 220);
      for (const t of dr.targets) for (const n of t.nodes) {
        const hot = t === tgt; if (!t.ok && !hot) continue;
        const x = X(n.x), y = Y(n.y), r = hot ? 11 : 7 + 1.5 * ph; ctx.beginPath(); ctx.arc(x, y, r, 0, 7);
        ctx.fillStyle = t.ok ? (hot ? 'rgba(95,219,143,.95)' : 'rgba(95,219,143,.55)') : (hot ? 'rgba(255,92,77,.95)' : 'rgba(255,92,77,.3)'); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.stroke();
      }
    }
   
    if (dr && !pv) {
      const r = c.getBoundingClientRect(), def = dr.def, bad = tgt && !tgt.ok, gs = this.gridStep * k; let gx = dr.px - r.left, gy = dr.py - r.top;
      if (this.snap && !dr.over) { gx = v.ox + Math.round((gx - v.ox) / gs) * gs; gy = v.oy + Math.round((gy - v.oy) / gs) * gs; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(gx - 6, gy); ctx.lineTo(gx + 6, gy); ctx.moveTo(gx, gy - 6); ctx.lineTo(gx, gy + 6); ctx.stroke(); }
      if (def.category === 'fairing') paintFairing(ctx, def, { x: gx, top: gy - 42, bottom: gy + 42, width: def.diameter + .28, S: k, alpha: .72 });
      else paintPart(ctx, def, { x: gx, y: gy - def.height * k / 2, S: k, dir: 1, alpha: .72, onload: () => this.invalidate() });
      if (bad) { ctx.font = '600 13px Archivo'; ctx.textAlign = 'left'; const m = tgt.error, tw = ctx.measureText(m).width, bx = clamp(gx + 20, 8, W - tw - 30), by = clamp(gy - 38, 8, H - 40); ctx.fillStyle = 'rgba(70,14,10,.94)'; ctx.fillRect(bx, by, tw + 18, 28); ctx.strokeStyle = '#ff5c4d'; ctx.lineWidth = 1; ctx.strokeRect(bx + .5, by + .5, tw + 17, 27); ctx.fillStyle = '#ffd5d0'; ctx.fillText(m, bx + 9, by + 19); }
    }
    if (!this.bp.parts.length) return;
   
    const dx = X(-L.width / 2) - 52, y0 = Y(0), y1 = Y(L.height); ctx.strokeStyle = ctx.fillStyle = 'rgba(205,224,255,.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(dx, y0); ctx.lineTo(dx, y1); ctx.moveTo(dx - 6, y0); ctx.lineTo(dx + 6, y0); ctx.moveTo(dx - 6, y1); ctx.lineTo(dx + 6, y1); ctx.stroke();
    ctx.save(); ctx.translate(dx - 8, (y0 + y1) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.font = '600 12px Archivo'; ctx.fillText(L.height.toFixed(1) + ' m', 0, 0); ctx.restore();
      for (const part of this.bp.parts) {
      const it = L.byUid[part.uid];
      if (!it || !it.def.separator || it.def.clamp) continue;
      const yy = Y((it.yTop + it.yBottom) / 2);
      ctx.save();
      ctx.setLineDash([6, 7]);
      ctx.strokeStyle = 'rgba(255,176,46,.62)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(X(-L.width / 2 - .28), yy);
      ctx.lineTo(X(L.width / 2 + .28), yy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(8,12,19,.86)';
      ctx.fillRect(X(L.width / 2) + 7, yy - 9, 90, 18);
      ctx.fillStyle = '#ffd28a';
      ctx.textAlign = 'left';
      ctx.font = '600 10px Archivo';
      ctx.fillText('SEPARATION', X(L.width / 2) + 13, yy + 3.5);
      ctx.restore();
    }
      const rx = X(L.width / 2) + 40;
    ctx.textAlign = 'center';
    ctx.font = '700 12px Archivo';
    const groups = this.bp.parts.filter(p => L.byUid[p.uid] && p.group).map(p => {
      const it = L.byUid[p.uid];
      return { p, yc: Y((it.yTop + it.yBottom) / 2) };
    }).sort((a, b) => a.yc - b.yc);
    let lastY = -1e9;
    for (const { p, yc } of groups) {
      const ty = Math.max(yc, lastY + 23);
      lastY = ty;
      ctx.fillStyle = '#7ee6f5';
      ctx.fillText('G' + p.group, rx, ty + 4);
    }
  },
  placeSel() {
    const b = this.selbar; if (b.hidden || !this.sel || !this.L.byUid[this.sel]) return; const it = this.L.byUid[this.sel], v = this.view, W = this.sheet.clientWidth, H = this.sheet.clientHeight;
    const right = v.ox + (it.detached ? it.x + it.def.diameter / 2 : it.side ? it.x + it.def.diameter / 2 : Math.max(this.L.width / 2, it.def.diameter / 2)) * v.k + 74, yc = v.oy + (it.yTop + it.yBottom) / 2 * v.k;
    b.style.left = clamp(right, 100, W - b.offsetWidth - (this.info.classList.contains('open') ? 370 : 12)) + 'px'; b.style.top = clamp(yc - b.offsetHeight / 2, 8, H - b.offsetHeight - 110) + 'px';
  },

 
  renderSel() {
    const b = this.selbar, p = this.sel && find(this.bp, this.sel); b.innerHTML = ''; if (!p) { b.hidden = true; return; }
    const d = this.cat_.component(p.c), n = this.L.byUid[p.uid]?.count || 1;
    const step = (label, val, fn) => h('div', { class: 'st' }, h('span', {}, label), h('button', { onclick: () => fn(-1), 'aria-label': 'decrease ' + label }, '−'), h('b', { class: 'num' }, val || '–'), h('button', { onclick: () => fn(1), 'aria-label': 'increase ' + label }, '+'));
    b.append(h('div', { class: 't', title: d.name }, d.name.split(' ')[0] + (n > 1 ? ' ×' + n : p.dir ? (p.dir < 0 ? ' (left)' : ' (right)') : '')),
      h('button', { class: 'details', type: 'button', onclick: () => this.showPartDetails(d, n), 'aria-label': `Details for ${d.name}` }, 'Details'));
    const loose = this.bp.looseParts?.some(q => q.uid === p.uid);
    if (!loose && (d.engine || d.separator)) b.append(step('Stage', p.stage, dlt => this.stageEdit(p, dlt)));
    if (!loose && d.engine && d.engine.type !== 'solid') b.append(step('Group', p.group, dlt => this.groupEdit(p, dlt)));
    b.append(h('button', { class: 'del', title: 'Remove part (Delete)', 'aria-label': 'Remove part', onclick: () => this.remove() }, ico('trash'))); b.hidden = false;
  },
  renderTools() { this.undoBtn.disabled = !this.hist.length; this.redoBtn.disabled = !this.fut.length; },
  renderBar() {
    if (this.payloadBadge) {
      this.payloadBadge.textContent = this.bp?.payload?.name ? '🛰️ ' + this.bp.payload.name : '🛰️ Payload';
    }
    const s = this.stats, body = this.cat_.body(s.bodyId);
    const first = s.stages[0];
    const cell = (label, val, cls = '') => h('div', { class: 'cell' }, h('span', { class: 'lab' }, label), h('b', { class: 'num ' + cls }, val));
    this.bar.innerHTML = '';
    const finance = this.finances || financialSnapshot(this.bp, this.cat_, state.mode === 'mission' ? missionById(state.missionId) : null, state.mode);
    const financeValue = finance.mode === 'career' ? fmtMoney(finance.remainingConstruction) : fmtMoney(finance.construction);
    this.bar.append(
      cell('Wet mass', s.partCount ? fmtMass(s.wetMass) : '0 kg'),
      cell('Delta-v', s.ready ? fmtSpeed(s.dv) : '–', first && body.rho0 > 0 && first.twrSL < 1 ? 'amber' : ''),
      cell(finance.mode === 'career' ? 'Funds left' : 'Vehicle cost', financeValue, finance.mode === 'career' && finance.remainingConstruction < 0 ? 'amber' : ''),
      h('button', { class: 'bar-more', type: 'button', onclick: () => this.toggleDrawer(true, 'stats'), 'aria-label': 'Vehicle statistics and finances' }, 'Stats'));
    const msg = s.errors[0], statsFailed = !!msg && !/^Calculating/.test(msg); this.pill.hidden = !(msg && (s.partCount || statsFailed)); this.pill.textContent = msg || ''; this.pill.className = 'ws-pill bad';
    if (this.launchBtn) this.launchBtn.disabled = !s.ready;
  },
  toggleDrawer(force, mode) {
    if (mode) this.infoMode = mode;
    const open = force ?? !this.info.classList.contains('open');
    this.info.classList.toggle('open', open);
    this.root.classList.toggle('drawer-open', open);
    if (open) this.renderInfo();
    this.invalidate();
  },
  showPartDetails(def, count = def.radial && this.sym ? 2 : 1) {
    this.partPreview = { def, count };
    this.toggleDrawer(true, 'part');
  },
  renderInfo() {
    const i = this.info; i.innerHTML = ''; const p = this.sel && find(this.bp, this.sel), s = this.stats;
    const selectedDef = p && this.cat_.component(p.c);
    const detail = this.partPreview || (selectedDef ? { def: selectedDef, count: this.L.byUid[p.uid]?.count || 1 } : null);
    const partMode = this.infoMode === 'part' && detail;
    i.append(h('div', { class: 'drawer-h' },
      h('b', {}, partMode ? 'Part details' : 'Vehicle stats'),
      partMode ? h('button', { class: 'btn small quiet', onclick: () => this.toggleDrawer(true, 'stats') }, 'Vehicle stats') : null,
      h('button', { class: 'btn small quiet', onclick: () => this.toggleDrawer(false) }, 'Close')));
    if (partMode) {
      const { def, count } = detail;
      i.append(h('h3', {}, def.name),
        h('p', { class: 'dim', style: 'margin:4px 0 14px' }, def.description),
        h('div', { class: 'kv' }, this.partRows(def, count).flatMap(([k, v]) => [h('span', {}, k), h('span', {}, v)])));
      return;
    }
    i.append(h('div', { class: 'sec' }, 'Vehicle'));
    const body = this.cat_.body(s.bodyId);
    const totalVacThrust = s.stages?.length ? s.stages.reduce((sum, stage) => sum + (Number(stage.thrustVac) || 0), 0) : null;
    const burnSeconds = s.stages?.some(stage => Number(stage.burnTime) > 0) ? s.stages.reduce((sum, stage) => sum + (Number(stage.burnTime) || 0), 0) : null;
    const totalParts = (Number(s.partCount) || 0) + (Number(s.looseCount) || 0);
    const kv = [
      ['Component count', totalParts + (s.looseCount ? ` (${s.looseCount} loose)` : '')],
      ['Dry mass', fmtMass(s.dryMass)],
      ['Wet mass', fmtMass(s.wetMass)],
      ['Propellant capacity', fmtMass(s.propellant)],
      ['Total thrust (vacuum)', totalVacThrust == null ? 'Unavailable' : fmtForce(totalVacThrust)],
      ['Thrust-to-weight ratio', s.stages?.length && Number.isFinite(s.twrVac) ? s.twrVac.toFixed(2) + ' (vac)' : 'Unavailable'],
      ['Estimated burn time', burnSeconds == null ? 'Unavailable from current backend stats' : fmtTime(burnSeconds)],
      ['Height', fmtDist(s.height)],
      ['Construction cost', fmtMoney((this.finances || {}).construction ?? s.cost)],
    ];
    i.append(h('div', { class: 'kv' }, kv.flatMap(([k, v]) => [h('span', {}, k), h('span', {}, String(v))])));
    const finance = this.finances || financialSnapshot(this.bp, this.cat_, state.mode === 'mission' ? missionById(state.missionId) : null, state.mode);
    i.append(h('div', { class: 'sec' }, finance.mode === 'career' ? 'Mission finances' : finance.mode === 'sandbox' ? 'Sandbox expenditure' : 'Workshop expenditure'));
    const financeRows = finance.mode === 'career'
      ? [['Mission budget', fmtMoney(finance.budget.total)], ['Construction allowance', fmtMoney(finance.budget.construction)], ['Construction expenditure', fmtMoney(finance.construction)], ['Available construction funds', fmtMoney(finance.remainingConstruction)], ['Expected fuel expenditure', fmtMoney(finance.expectedFuel)], ['Operating allocation', fmtMoney(finance.operating)], ['Contingency reserve', fmtMoney(finance.budget.contingency)], ['Estimated mission expenditure', fmtMoney(finance.expectedMissionCost)], ['Budget utilization', `${(finance.budgetUtilization * 100).toFixed(1)}%`]]
      : [['Construction expenditure', fmtMoney(finance.construction)], ['Fuel capacity', fmtMass(finance.fuelCapacity)], ['Estimated fuel expenditure', fmtMoney(finance.expectedFuel)], ['Estimated operating expenditure', fmtMoney(finance.operating)], ['Estimated total expenditure', fmtMoney(finance.expectedMissionCost)], ['Spending limit', 'Unlimited']];
    i.append(h('div', { class: 'kv economy-kv' }, financeRows.flatMap(([k, v]) => [h('span', {}, k), h('span', {}, String(v))])));
    if (s.ready) i.append(h('div', { style: 'display:flex;gap:26px;margin-top:12px' }, h('div', {}, h('div', { class: 'big-num' }, fmtSpeed(s.dv).replace(' m/s', '')), h('div', { class: 'label' }, 'Total delta-v, m/s')), h('div', {}, h('div', { class: 'big-num ' + (s.twrSL < 1 ? 'amber' : '') }, s.twrSL.toFixed(2)), h('div', { class: 'label' }, `Stage 1 thrust-to-weight, ${body.name}`))));
    i.append(h('div', { class: 'sec', style: 'display:flex;justify-content:space-between;align-items:center' }, h('span', {}, this.bp.stagingMode === 'auto' ? 'Automatic staging' : 'Manual staging'),
      h('button', { class: 'btn small', onclick: () => this.restage() }, 'Re-stage automatically')));
    if (s.stages.length) {
      const t = h('table', { class: 'stg' }, h('tr', {}, ['Stage', 'Δv', 'Burn', 'TWR'].map(x => h('th', {}, x)))), byStage = n => this.bp.parts.filter(q => q.stage === n).map(q => this.cat_.component(q.c).name.replace(/ \(pair\)/, '')).join(', ');
      for (const st of s.stages) { t.append(h('tr', {}, h('td', {}, h('b', {}, st.stage)), h('td', {}, st.dv ? Math.round(st.dv) + ' m/s' : '–'), h('td', {}, st.burnTime ? Math.round(st.burnTime) + ' s' : '–'), h('td', {}, st.twrSL.toFixed(2)))); t.append(h('tr', {}, h('td', { class: 'stg-parts', colspan: 4 }, byStage(st.stage)))); }
      i.append(t);
    } else i.append(h('div', { class: 'dim' }, 'Delta-v appears once the vehicle is valid.'));
    if (s.missingCapabilities?.length) {
      i.append(h('div', { class: 'sec' }, 'Missing mission capabilities'));
      for (const cap of s.missingCapabilities) i.append(h('div', { class: 'msg warn' }, '⚠ ' + cap));
    }
    i.append(h('div', { class: 'sec' }, 'Checks')); for (const e of s.errors) i.append(h('div', { class: 'msg' }, e)); for (const w of s.warnings) i.append(h('div', { class: 'msg warn' }, w));
    if (!s.errors.length && !s.warnings.length) i.append(h('div', { class: 'green' }, 'No problems found.'));
  },

  
  async newVehicle() {
    if ((this.bp.parts.length || this.bp.looseParts?.length) && !(await ask('Start a new vehicle?', 'The current design is replaced. Unsaved changes are lost.', [{ label: 'Keep editing', value: false }, { label: 'New vehicle', value: true, primary: true }]))) return;
    state.blueprint = newBlueprint(); this.show();
  },
  async save() {
    const bp = this.bp; bp.name = this.name.value.trim() || 'Untitled vehicle'; this.name.value = bp.name; bp.id = bp.id && !state.presets.some(p => p.id === bp.id) ? bp.id : slug(bp.name) + '-' + Math.random().toString(36).slice(2, 6);
    try { await api.saveBlueprint(bp.id, bp); state.settings.lastBlueprint = bp.id; await api.putSettings({ lastBlueprint: bp.id }); toast(`Saved “${bp.name}”`, 'good'); } catch (e) { toast('Save failed: ' + e.message, 'bad', 5000); }
  },
  async openLoad() {
    let saved = []; try { saved = await api.listBlueprints(); } catch (e) { toast(e.message, 'bad'); }
    const presets = state.presets;
    const d = document.getElementById('dialog'); d.innerHTML = ''; d.onclose = null; d.className = 'vehicle-library';
    const load = async bp => { const m = await migrate(structuredClone(bp)); if (!m) return toast('That blueprint could not be read.', 'bad'); state.blueprint = m; d.close(); this.show(); };
    const summary = bp => {
      const parts = [...(bp.parts || []), ...(bp.looseParts || [])];
      return `${parts.length} ${parts.length === 1 ? 'part' : 'parts'} · ${new Set(parts.map(part => this.cat_.component(part.c)?.category).filter(Boolean)).size} categories`;
    };
    const card = (vehicle, onLoad, savedVehicle = false) => {
      const open = h('button', { class: 'vehicle-card-open', type: 'button', onclick: onLoad },
        h('span', { class: 'vehicle-card-art', 'aria-hidden': 'true' }, h('span', { class: 'vehicle-art-flame' }), h('span', { class: 'vehicle-art-body' }), h('span', { class: 'vehicle-art-nose' })),
        h('span', { class: 'vehicle-card-copy' },
          h('span', { class: 'vehicle-card-name' }, vehicle.name || 'Untitled vehicle'),
          h('span', { class: 'vehicle-card-meta' }, summary(vehicle)),
          h('span', { class: 'vehicle-card-action' }, 'Open design', h('span', { 'aria-hidden': 'true' }, '→'))));
      const content = [open];
      if (savedVehicle) content.push(h('button', {
        class: 'vehicle-card-delete',
        type: 'button',
        'aria-label': `Delete ${vehicle.name}`,
        title: 'Delete saved vehicle',
        onclick: async () => {
          try {
            await api.deleteBlueprint(vehicle.id);
            toast(`Deleted “${vehicle.name}”`, 'good');
            this.openLoad();
          } catch (error) {
            toast('Could not delete vehicle: ' + error.message, 'bad', 5000);
          }
        },
      }, '×'));
      return h('article', { class: 'vehicle-card', 'data-search': `${vehicle.name || ''} ${summary(vehicle)}`.toLowerCase() }, ...content);
    };
    const builtInGrid = h('div', { class: 'vehicle-library-grid' }, presets.map(vehicle => card(vehicle, () => load(vehicle))));
    const savedGrid = h('div', { class: 'vehicle-library-grid' });
    const builtInSection = h('section', { class: 'vehicle-library-section' },
      h('div', { class: 'vehicle-section-heading' }, h('h3', {}, 'Flight-ready starters'), h('span', {}, `${presets.length} designs`)),
      builtInGrid);
    const savedSection = h('section', { class: 'vehicle-library-section' },
      h('div', { class: 'vehicle-section-heading' }, h('h3', {}, 'Your saved vehicles'), h('span', { class: 'saved-count' }, `${saved.length} designs`)),
      savedGrid);
    const empty = h('div', { class: 'vehicle-library-empty', hidden: true }, 'No designs match that search.');
    const search = h('input', {
      class: 'vehicle-library-search',
      type: 'search',
      placeholder: 'Search vehicles…',
      'aria-label': 'Search saved and built-in vehicles',
      oninput: () => {
        const query = search.value.trim().toLowerCase();
        let visible = 0;
        for (const section of [builtInSection, savedSection]) {
          const cards = [...section.querySelectorAll('.vehicle-card')];
          let sectionVisible = 0;
          for (const item of cards) {
            const matches = !query || item.dataset.search.includes(query);
            item.hidden = !matches;
            sectionVisible += Number(matches);
          }
          section.hidden = sectionVisible === 0;
          visible += sectionVisible;
        }
        empty.hidden = visible > 0;
      },
    });
    d.append(
      h('header', { class: 'vehicle-library-header' },
        h('div', {},
          h('div', { class: 'vehicle-library-eyebrow' }, 'VEHICLE WORKSHOP  /  DESIGN LIBRARY'),
          h('div', { class: 'dlg-h' }, 'Load a vehicle'),
          h('p', { class: 'vehicle-library-subtitle' }, 'Choose a starter design or continue with a saved build.')),
        h('button', { class: 'vehicle-library-close', type: 'button', 'aria-label': 'Close vehicle library', onclick: () => d.close() }, '×')),
      h('div', { class: 'vehicle-library-toolbar' }, search, h('span', { class: 'vehicle-library-total' }, `${presets.length + saved.length} DESIGNS`)),
      h('div', { class: 'vehicle-library-content' }, builtInSection, savedSection, empty),
      h('footer', { class: 'vehicle-library-footer' }, h('span', {}, 'Your current build stays untouched until you open a design.'), h('button', { class: 'btn', type: 'button', onclick: () => d.close() }, 'Done')),
    );
    if (saved.length) {
      const loadedAll = await Promise.all(saved.map(async vehicle => {
        try {
          return { ...vehicle, blueprint: (await api.getBlueprint(vehicle.id)).blueprint };
        } catch (error) {
          toast(`Could not load saved vehicle “${vehicle.name}”: ${error.message}`, 'bad', 5000);
          return null;
        }
      }));
      const loaded = loadedAll.filter(vehicle => vehicle && usesOnlyArt(vehicle.blueprint, this.cat_)); savedSection.querySelector('.saved-count').textContent = `${loaded.length} designs`;
      savedGrid.replaceChildren(...loaded.filter(Boolean).map(vehicle => card(vehicle.blueprint, () => load(vehicle.blueprint), true)));
      if (!loaded.length) savedGrid.append(h('div', { class: 'vehicle-library-empty saved-empty' }, 'None of your saved builds use only parts that have artwork.'));
      savedGrid.querySelectorAll('.vehicle-card').forEach((item, index) => {
        const vehicle = loaded.filter(Boolean)[index];
        item.dataset.search = `${vehicle.name || ''} ${summary(vehicle.blueprint)}`.toLowerCase();
        item.querySelector('.vehicle-card-name').textContent = vehicle.name || vehicle.blueprint.name || 'Untitled vehicle';
        item.querySelector('.vehicle-card-meta').textContent = summary(vehicle.blueprint);
        item.querySelector('.vehicle-card-open').onclick = () => load(vehicle.blueprint);
      });
    } else {
      savedGrid.append(h('div', { class: 'vehicle-library-empty saved-empty' }, 'No saved builds yet. Save a design from the Workshop and it will appear here.'));
    }
    if (!d.open) d.showModal();
  },
};