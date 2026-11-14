import { state } from '../../js/core/store.js';
import { api } from '../../js/core/api.js';
import { h, bus } from '../../js/core/bus.js';

const AU = 1.495978707e11, DAY = 86400;
const J2000_MS = 946728000000;
const secondsNow = () => (Date.now() - J2000_MS) / 1000;
const RATES = [['Paused', 0], ['1 day/s', DAY], ['10 days/s', 10 * DAY], ['100 days/s', 100 * DAY], ['1 year/s', 365.25 * DAY], ['10 years/s', 3652.5 * DAY]];
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const tint = (c, f) => c.map(v => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f)))));
const DISPLAY_COLOUR = { earth: [72, 142, 232] };
function ringArc(ctx, p, rad, from, to) {
  ctx.save(); ctx.lineCap = 'round';
  for (const [k, w, a] of [[2.15, 1.3, .55], [1.7, 1.9, .38]]) { ctx.strokeStyle = `rgba(222,200,150,${a})`; ctx.lineWidth = w; ctx.beginPath(); ctx.ellipse(p[0], p[1], rad * k, rad * k * .3, -.38, from, to); ctx.stroke(); }
  ctx.restore();
}
function drawBody(ctx, body, p, rad, sun) {
  const c = DISPLAY_COLOUR[body.id] || body.color;
  const halo = ctx.createRadialGradient(p[0], p[1], rad * .6, p[0], p[1], rad * 3.4);
  halo.addColorStop(0, rgb(c, .26)); halo.addColorStop(1, rgb(c, 0));
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(p[0], p[1], rad * 3.4, 0, 7); ctx.fill();
  if (body.id === 'saturn') ringArc(ctx, p, rad, Math.PI, Math.PI * 2);
  const dx = sun[0] - p[0], dy = sun[1] - p[1], len = Math.hypot(dx, dy) || 1, hx = p[0] + dx / len * rad * .4, hy = p[1] + dy / len * rad * .4;
  const sphere = ctx.createRadialGradient(hx, hy, rad * .08, p[0], p[1], rad * 1.08);
  sphere.addColorStop(0, rgb(tint(c, .6))); sphere.addColorStop(.5, rgb(c)); sphere.addColorStop(1, rgb(tint(c, -.72)));
  ctx.fillStyle = sphere; ctx.beginPath(); ctx.arc(p[0], p[1], rad, 0, 7); ctx.fill();
  if (body.id === 'saturn') ringArc(ctx, p, rad, 0, Math.PI);
}
function drawSun(ctx, sun) {
  const corona = ctx.createRadialGradient(sun[0], sun[1], 6, sun[0], sun[1], 96);
  corona.addColorStop(0, 'rgba(255,196,96,.55)'); corona.addColorStop(.22, 'rgba(255,160,52,.2)'); corona.addColorStop(1, 'rgba(255,140,40,0)');
  ctx.fillStyle = corona; ctx.beginPath(); ctx.arc(sun[0], sun[1], 96, 0, 7); ctx.fill();
  const core = ctx.createRadialGradient(sun[0] - 3, sun[1] - 3, 1, sun[0], sun[1], 11);
  core.addColorStop(0, '#fff7da'); core.addColorStop(.55, '#ffd27a'); core.addColorStop(1, '#ff9b2e');
  ctx.fillStyle = core; ctx.beginPath(); ctx.arc(sun[0], sun[1], 11, 0, 7); ctx.fill();
}
export const solar = {
  t: 0, rate: DAY, focus: 'sun', zoom: 1, pan: [0, 0], running: false, positions: {}, periods: {}, paths: {},
  mount(root) {
    this.root = root; root.innerHTML = ''; this.bodies = state.solar.bodies; this.by = Object.fromEntries(this.bodies.map(b => [b.id, b])); this.mus = this.by.sun.mu;
    let seed = 17391;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    this.stars = Array.from({ length: 190 }, () => ({
      x: random(),
      y: random(),
      radius: .35 + random() * .8,
      alpha: .2 + random() * .42,
      phase: random() * Math.PI * 2,
    }));
    this.asteroids = Array.from({ length: 320 }, () => {
      const radius = (2.1 + random() * 1.2) * AU;
      return {
        radius,
        angle: random() * Math.PI * 2,
        size: .4 + random() * .8,
        alpha: .18 + random() * .3,
      };
    });
    this.canvas = h('canvas', {
      tabindex: '0',
      'aria-label': 'Interactive solar system. Click a celestial body or use the left and right arrow keys to select one.',
    });
    this.date = h('div', { class: 'sol-date' });
    this.rateBtns = RATES.map(([label, value]) => h('button', {
      class: 'sol-rate',
      type: 'button',
      'aria-pressed': value === this.rate ? 'true' : 'false',
      onclick: () => { this.rate = value; this.paint(); },
    }, label));
    this.side = h('aside', { class: 'sol-info', 'aria-label': 'Selected celestial body', 'aria-live': 'polite' });
    this.rateControls = h('div', { class: 'sol-rates', role: 'group', 'aria-label': 'Time speed' }, this.rateBtns);
    const stage = h('div', { class: 'sol-stage' },
      this.canvas,
      h('div', { class: 'sol-vignette', 'aria-hidden': 'true' }),
      h('header', { class: 'sol-header' },
        h('button', { class: 'sol-back', type: 'button', onclick: () => bus.emit('nav', 'menu') }, '← Menu'),
        h('div', { class: 'sol-heading' },
          h('h1', {}, 'Solar system'),
          h('p', {}, 'Select a world in the scene to explore its orbit.')),
        h('div', { class: 'sol-clock' },
          this.date)),
      this.side,
      h('footer', { class: 'sol-dock' },
        h('button', { class: 'sol-today', type: 'button', onclick: () => { this.t = secondsNow(); this.paint(); } }, 'Today'),
        h('button', { class: 'sol-today', type: 'button', onclick: () => { if (state.track) { this.rate = 0; this.t = state.track.epoch; this.paint(); } } }, 'Mission'),
        this.rateControls));
    root.append(stage);
    this.loadOrbitPaths();
    this.canvas.addEventListener('wheel', e => { e.preventDefault(); this.zoom = Math.min(40, Math.max(.5, this.zoom * Math.exp(-e.deltaY * .0012))); }, { passive: false });
    let drag = null; this.canvas.addEventListener('mousedown', e => drag = [e.clientX, e.clientY]); window.addEventListener('mouseup', () => drag = null);
    window.addEventListener('mousemove', e => { if (drag) { this.pan[0] += e.clientX - drag[0]; this.pan[1] += e.clientY - drag[1]; drag = [e.clientX, e.clientY]; } });
    this.canvas.addEventListener('click', e => {
      const r = this.canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      const hit = (this.hitAreas || [])
        .filter(area => mx >= area.left && mx <= area.right && my >= area.top && my <= area.bottom)
        .sort((a, b) => Math.hypot(a.x - mx, a.y - my) - Math.hypot(b.x - mx, b.y - my))[0];
      if (hit) this.select(hit.id);
    });
    this.canvas.addEventListener('mousemove', e => {
      const r = this.canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      this.canvas.style.cursor = (this.hitAreas || []).some(area => mx >= area.left && mx <= area.right && my >= area.top && my <= area.bottom) ? 'pointer' : 'grab';
    });
    this.canvas.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const index = this.bodies.findIndex(body => body.id === this.focus);
      const direction = e.key === 'ArrowRight' ? 1 : -1;
      this.select(this.bodies[(index + direction + this.bodies.length) % this.bodies.length].id);
    });
    this.select('earth');
  },
  select(id) {
    if (this.focus !== id) {
      const currentIndex = this.bodies.findIndex(body => body.id === this.focus);
      const nextIndex = this.bodies.findIndex(body => body.id === id);
      const forwardDistance = (nextIndex - currentIndex + this.bodies.length) % this.bodies.length;
      this.selectionDirection = forwardDistance <= this.bodies.length / 2 ? 'next' : 'previous';
      this.selectionStarted = performance.now();
    }
    this.focus = id; this.pan = [0, 0]; this.zoom = id === 'sun' ? 1 : id === 'moon' ? 8 : 2.2; this.renderSide();
  },
  show() {
    this.reduceMotion = state.settings.reduceMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.root.classList.toggle('reduce-motion', this.reduceMotion);
    this.t = secondsNow(); this.running = true; this.last = performance.now();
    this.lastEphemeris = 0;
    this.refreshEphemeris();
    const loop = n => { if (!this.running) return; requestAnimationFrame(loop); this.t += this.rate * Math.min(.1, (n - this.last) / 1000); this.last = n; this.paint(); };
    requestAnimationFrame(loop);
  },
  hide() { this.running = false; },
  async loadOrbitPaths() {
    try {
      const orbiting = this.bodies.filter(b => b.a && (!b.parent || b.parent === 'sun'));
      const paths = await Promise.all(orbiting.map(async b => [b.id, (await api.ephemerisPath(b)).points]));
      this.paths = Object.fromEntries(paths);
    } catch (error) {
      console.error('Could not load solar-system orbit paths.', error);
    }
  },
  async refreshEphemeris() {
    if (!this.running || this.ephemerisRequest) return;
    const now = performance.now();
    if (now - (this.lastEphemeris || 0) < 250) return;
    this.lastEphemeris = now;
    const bodies = this.bodies.filter(b => b.id !== 'sun').map(body => ({
      body,
      mu: body.parent ? (this.by[body.parent]?.mu || this.mus) : this.mus,
    }));
    this.ephemerisRequest = api.ephemerisSnapshot(bodies, this.t)
      .then(snapshot => {
        this.positions = Object.fromEntries(Object.entries(snapshot).map(([id, value]) => [id, value.position]));
        this.periods = Object.fromEntries(Object.entries(snapshot).map(([id, value]) => [id, value.period]));
        this.updateLive();
        if (this.side.querySelector('.sol-period')) this.renderSide();
      })
      .catch(error => console.error('Could not update solar-system positions.', error))
      .finally(() => { this.ephemerisRequest = null; });
  },
  heli(id) {
    if (!id || id === 'sun') return [0, 0];
    const body = this.by[id], position = this.positions[id] || [0, 0];
    if (body && body.parent && body.parent !== 'sun') {
      const parentPos = this.heli(body.parent);
      return [parentPos[0] + position[0], parentPos[1] + position[1]];
    }
    return position;
  },
  paint() {
    this.refreshEphemeris();
    const c = this.canvas, d = Math.min(devicePixelRatio || 1, 2), W = c.clientWidth, H = c.clientHeight; if (c.width !== W * d) { c.width = W * d; c.height = H * d; } const ctx = c.getContext('2d'); ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, W, H);
    const k = Math.min(W, H) * .46 / Math.sqrt(30.2) * this.zoom, map = ([x, y]) => { const r = Math.hypot(x, y); if (r === 0) return [0, 0]; const q = Math.sqrt(r / AU) * k / r; return [x * q, -y * q]; };
    const fp = map(this.heli(this.focus === 'moon' ? 'earth' : this.focus)), ox = W * .42 + this.pan[0] - fp[0], oy = H / 2 + this.pan[1] - fp[1], P = v => { const m = map(v); return [ox + m[0], oy + m[1]]; };
    const time = performance.now() / 1000;
    for (const star of this.stars) {
      const twinkle = this.reduceMotion ? 0 : Math.sin(time * .7 + star.phase) * .08;
      ctx.globalAlpha = Math.max(.12, star.alpha + twinkle);
      ctx.fillStyle = '#e8edf5';
      ctx.beginPath();
      ctx.arc(star.x * W, star.y * H, star.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    this.screen = {}; ctx.lineWidth = 1;
    for (const b of this.bodies.filter(b => b.a && (!b.parent || b.parent === 'sun'))) { const path = this.paths[b.id]; if (!path) continue; const on = this.focus === b.id; ctx.save(); ctx.strokeStyle = on ? 'rgba(82,214,234,.9)' : 'rgba(138,151,171,.2)'; if (on) { ctx.shadowColor = 'rgba(82,214,234,.7)'; ctx.shadowBlur = 8; } ctx.beginPath(); path.forEach((p, i) => { const s = P(p); i ? ctx.lineTo(...s) : ctx.moveTo(...s); }); ctx.stroke(); ctx.restore(); }
    for (const asteroid of this.asteroids) {
      const angle = asteroid.angle + Math.sqrt(this.mus / asteroid.radius ** 3) * this.t;
      const p = P([Math.cos(angle) * asteroid.radius, Math.sin(angle) * asteroid.radius]);
      ctx.globalAlpha = asteroid.alpha;
      ctx.fillStyle = '#8a97ab';
      ctx.beginPath();
      ctx.arc(p[0], p[1], asteroid.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const sun = P([0, 0]); drawSun(ctx, sun); this.screen.sun = sun;
    this.drawTrack(ctx, P);
    ctx.font = '600 12px Archivo'; ctx.textAlign = 'left';
    const markers = [{ id: 'sun', name: 'Sun', p: sun, radius: 11, color: [232, 237, 245] }];
    for (const b of this.bodies) { if (b.id === 'sun') continue; let p;
      if (b.parent && b.parent !== 'sun') { const par = P(this.heli(b.parent)), m = this.positions[b.id] || [0, 0], a = Math.atan2(-m[1], m[0]), rr = 24 + 7 * Math.log2(this.zoom + 1); p = [par[0] + Math.cos(a) * rr, par[1] + Math.sin(a) * rr]; ctx.strokeStyle = 'rgba(138,151,171,.25)'; ctx.beginPath(); ctx.arc(par[0], par[1], rr, 0, 7); ctx.stroke(); } else p = P(this.heli(b.id));
      this.screen[b.id] = p; const col = b.color, rad = b.parent ? 3.2 : Math.max(3.2, 3 + Math.log10(b.radius / 2e6) * 4.2); drawBody(ctx, b, p, rad, sun);
      if (this.focus === b.id) {
        ctx.save(); ctx.strokeStyle = '#52d6ea'; ctx.lineWidth = 1.5; ctx.shadowColor = 'rgba(82,214,234,.9)'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(p[0], p[1], rad + 5, 0, 7); ctx.stroke(); ctx.restore(); ctx.lineWidth = 1;
        if (!this.reduceMotion && this.selectionStarted) {
          const progress = Math.min(1, (performance.now() - this.selectionStarted) / 480);
          if (progress < 1) {
            ctx.globalAlpha = 1 - progress;
            ctx.strokeStyle = '#52d6ea'; ctx.beginPath(); ctx.arc(p[0], p[1], rad + 8 + progress * 10, 0, 7); ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }
      markers.push({ id: b.id, name: b.name, p, radius: rad, color: col });
    }
    this.screen.sun = sun;
    markers.sort((a, b) => Number(b.id === this.focus) - Number(a.id === this.focus));
    const labelBounds = [];
    this.hitAreas = [];
    for (const marker of markers) {
      const selected = marker.id === this.focus;
      ctx.font = selected ? '600 14px Archivo' : '500 14px Archivo';
      const labelWidth = ctx.measureText(marker.name).width;
      this.hitAreas.push({
        id: marker.id,
        x: marker.p[0],
        y: marker.p[1],
        left: marker.p[0] - 14,
        right: marker.p[0] + marker.radius + 16 + labelWidth,
        top: marker.p[1] - 14,
        bottom: marker.p[1] + 14,
      });
      const infoWidth = Math.min(Math.max(W * .22, 220), 290);
      const infoLeft = W - W * .06 - infoWidth;
      const infoTop = H * (H <= 720 ? .34 : .36);
      const infoBottom = infoTop + 220;
      if (marker.p[0] > infoLeft - 90 && marker.p[0] < W - W * .06 &&
          marker.p[1] > infoTop - 20 && marker.p[1] < infoBottom + 20) continue;
      const choices = [0, -18, 18, -36, 36, -54, 54].flatMap(offset => [
        [marker.p[0] + marker.radius + 8, marker.p[1] + 4 + offset],
        [marker.p[0] - marker.radius - 8 - labelWidth, marker.p[1] + 4 + offset],
      ]);
      const label = choices.map(([x, baseline]) => ({
        x: Math.max(8, Math.min(W - labelWidth - 8, x)),
        top: baseline - 12,
        bottom: baseline + 5,
      })).find(candidate => {
        if (candidate.top < 116 || candidate.bottom > H - 62) return false;
        const overlapsInfo = candidate.x < W - W * .06 && candidate.x + labelWidth > infoLeft &&
          candidate.bottom > infoTop && candidate.top < infoBottom;
        if (overlapsInfo) return false;
        return !labelBounds.some(bounds =>
          candidate.x < bounds.right + 6 && candidate.x + labelWidth > bounds.left - 6 &&
          candidate.top < bounds.bottom + 5 && candidate.bottom > bounds.top - 5);
      });
      if (!label) continue;
      const y = label.top + 13;
      ctx.save();
      ctx.font = selected ? '600 14px Archivo' : '500 14px Archivo';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#04060d';
      ctx.strokeText(marker.name, label.x, y);
      ctx.fillStyle = selected ? '#52d6ea' : '#e8edf5';
      ctx.fillText(marker.name, label.x, y);
      ctx.restore();
      labelBounds.push({ left: label.x, right: label.x + labelWidth, top: label.top, bottom: label.bottom });
    }
    const dt = new Date(Date.UTC(2000, 0, 1, 12) + this.t * 1000);
    this.date.textContent = dt.toISOString().slice(0, 10) + ' ' + dt.toISOString().slice(11, 16) + ' UTC';
    this.rateBtns.forEach((button, index) => button.setAttribute('aria-pressed', RATES[index][1] === this.rate ? 'true' : 'false'));
    this.updateLive();
  },
  drawTrack(ctx, P) {
    const track = state.track;
    if (!track) return;
    const palette = ['#f5b942', '#ff7a59', '#b57bff', '#5fd38d', '#52d6ea'];
    const stroke = (segments, dash, alpha) => segments.forEach((segment, index) => {
      ctx.save();
      ctx.strokeStyle = palette[index % palette.length];
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 1.8;
      ctx.setLineDash(dash);
      ctx.beginPath();
      segment.points.forEach((point, i) => {
        const p = P(point);
        i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
      });
      ctx.stroke();
      ctx.restore();
    });
    const dot = (point, color, radius) => {
      const p = P(point);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p[0], p[1], radius, 0, 7);
      ctx.fill();
    };
    stroke(track.segments || [], [], .95);
    if (track.preview) stroke(track.preview.segments || [], [6, 5], .8);
    const drawSoiChanges = (changes, isPreview) => {
      for (const change of changes || []) {
        dot(change.point, isPreview ? '#52d6ea' : '#ffffff', 4);
        const p = P(change.point);
        ctx.save();
        ctx.font = '10px Archivo, sans-serif';
        ctx.fillStyle = isPreview ? '#52d6ea' : '#e8edf5';
        ctx.textAlign = 'left';
        const label = change.toBody ? `${change.toBody.toUpperCase()} SOI` : 'SOI';
        ctx.fillText(label, p[0] + 6, p[1] - 4);
        ctx.restore();
      }
    };
    drawSoiChanges(track.changes, false);
    if (track.preview) drawSoiChanges(track.preview.changes, true);
    if (track.preview?.node) dot(track.preview.node.point, '#52d6ea', 4);
    if (track.closestApproach?.point) dot(track.closestApproach.point, '#b57bff', 3);
    dot(track.position, '#ff4d6d', 4);
    const rocket = P(track.position);
    ctx.save();
    ctx.fillStyle = '#ff4d6d';
    ctx.font = '12px sans-serif';
    ctx.fillText('Rocket', rocket[0] + 8, rocket[1] - 8);
    ctx.restore();
  },

  renderSide() {
    const s = this.side;
    s.classList.toggle('sol-shift-next', this.selectionDirection === 'next');
    s.classList.toggle('sol-shift-previous', this.selectionDirection === 'previous');
    s.innerHTML = '';
    const b = this.by[this.focus], par = b.parent ? this.by[b.parent] : null, mu = par ? par.mu : this.mus;
    s.append(
      h('div', { class: 'sol-selected' },
        h('h2', {}, b.name),
        h('p', {}, par ? `Orbiting ${par.name}` : 'Central star')),
      h('dl', { class: 'sol-facts' }, [
        h('dt', {}, 'Distance'),
        h('dd', { class: 'sol-distance' }, '—'),
        h('dt', {}, 'Orbital speed'),
        h('dd', { class: 'sol-speed' }, '—'),
        ...(b.a ? [h('dt', {}, 'Period'), h('dd', { class: 'sol-period' }, this.periods[b.id] ? (this.periods[b.id] / DAY / (par && par.id === 'earth' ? 1 : 365.25)).toFixed(par && par.id === 'earth' ? 2 : 3) + (par && par.id === 'earth' ? ' days' : ' years') : 'Loading…')] : []),
      ]));
  },
  updateLive() {
    const b = this.by[this.focus], p = this.heli(b.id), rS = Math.hypot(...p);
    const distance = this.side.querySelector('.sol-distance');
    if (distance) {
      if (b.id === 'sun') distance.textContent = '—';
      else if (b.parent === 'earth') {
        const mu = this.by[b.parent].mu;
        const relativeDistance = Math.hypot(...(this.positions[b.id] || [0, 0]));
        distance.textContent = `${Math.round(relativeDistance / 1000).toLocaleString('en-US')} km`;
      } else distance.textContent = `${(rS / AU).toFixed(3)} AU`;
    }
    let speedValue = '—';
    if (b.id !== 'sun') {
      const mu = b.parent === 'earth' ? this.by.earth.mu : this.mus;
      const r = b.parent === 'earth' ? Math.hypot(...(this.positions[b.id] || [0, 0])) : rS;
      speedValue = `${(Math.sqrt(mu * (2 / r - 1 / b.a)) / 1000).toFixed(2)} km/s`;
    }
    const speed = this.side.querySelector('.sol-speed');
    if (speed) speed.textContent = speedValue;
  },
};