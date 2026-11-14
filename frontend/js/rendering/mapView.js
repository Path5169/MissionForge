import { fmtDist, fmtTime } from '../../ui/shared/format.js';
import { api } from '../core/api.js';
import { state } from '../core/store.js';

const AU = 1.495978707e11;
const clamp01 = v => Math.max(0, Math.min(1, v));
const smooth = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const tint = (c, f) => c.map(v => Math.max(0, Math.min(255,
  Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f)))));
const DISPLAY_COLOUR = { earth: [72, 142, 232] };
const fmtFar = m => m >= 0.05 * AU
  ? `${(m / AU).toFixed(2)} AU`
  : fmtDist(m);

const css = name =>
  getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();

const rgb = values =>
  `rgb(${values[0]},${values[1]},${values[2]})`;

const pointXY = point => {
  if (Array.isArray(point) && point.length >= 2) {
    return [Number(point[0]), Number(point[1])];
  }

  if (point && typeof point === 'object') {
    return [Number(point.x), Number(point.y)];
  }

  return [NaN, NaN];
};

export class MapView {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.zoom = 1;
    this.d = 1;
    this.positions = {};
    this.paths = {};
    this.lastEphemeris = 0;
    this.pathsRequested = false;
  }

  _bodies() {
    return state.solar?.bodies || [];
  }

  _heli(id, by) {
    if (id === 'sun') return [0, 0];
    const b = by[id];
    const pos = this.positions[id];
    if (!b || !pos) return null;
    if (b.parent && b.parent !== 'sun') {
      const parent = this._heli(b.parent, by);
      return parent ? [parent[0] + pos[0], parent[1] + pos[1]] : null;
    }
    return pos;
  }

  _refreshEphemeris(by) {
    const bodies = this._bodies();
    if (!bodies.length) return;

    if (!this.pathsRequested) {
      this.pathsRequested = true;
      const orbiting = bodies.filter(b => b.a && (!b.parent || b.parent === 'sun'));
      Promise.all(orbiting.map(async b =>
        [b.id, (await api.ephemerisPath(b)).points]))
        .then(list => { this.paths = Object.fromEntries(list); })
        .catch(() => { this.pathsRequested = false; });
    }

    const now = performance.now();
    if (this.ephemerisBusy || now - this.lastEphemeris < 400) return;
    this.lastEphemeris = now;
    this.ephemerisBusy = true;

    const epoch = state.track?.epoch ?? 0;
    const sunMu = by.sun?.mu;
    const request = bodies.filter(b => b.id !== 'sun').map(body => ({
      body,
      mu: body.parent ? (by[body.parent]?.mu || sunMu) : sunMu,
    }));

    api.ephemerisSnapshot(request, epoch)
      .then(snap => {
        this.positions = Object.fromEntries(
          Object.entries(snap).map(([id, v]) => [id, v.position]));
      })
      .catch(() => {})
      .finally(() => { this.ephemerisBusy = false; });
  }

  _drawSystem(ctx, g) {
    const { W, H, cx, cy, d, scale, bodyId } = g;
    const bodies = this._bodies();
    if (!bodies.length) return;

    const by = Object.fromEntries(bodies.map(b => [b.id, b]));
    this._refreshEphemeris(by);

    const origin = this._heli(bodyId, by);
    if (!origin) return;

    const rel = p => [p[0] - origin[0], p[1] - origin[1]];
    const toScreen = p => {
      const r = rel(p);
      return [cx + r[0] * scale, cy - r[1] * scale];
    };

    const cornerPx = Math.hypot(W, H) / 2;
    const fade = (px, py) =>
      1 - smooth(cornerPx * 0.55, cornerPx * 1.0, Math.hypot(px - cx, py - cy));

    const pxPerAU = AU * scale / d;

    const lineAlpha = 0.28 * (1 - smooth(1500, 4000, pxPerAU));
    if (lineAlpha > 0.01) {
      ctx.save();
      ctx.lineWidth = d;
      ctx.strokeStyle = `rgba(138,151,171,${lineAlpha})`;
      for (const id of Object.keys(this.paths)) {
        const pts = this.paths[id];
        if (!pts || id === bodyId) continue;
        ctx.beginPath();
        pts.forEach((pt, i) => {
          const [x, y] = toScreen(pointXY(pt));
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        ctx.stroke();
      }
      ctx.restore();
    }

    const track = state.track;
    const trackAlpha = 1 - smooth(60, 400, pxPerAU);
    if (track?.segments && trackAlpha > 0.02) {
      const palette = ['#f5b942', '#ff7a59', '#b57bff', '#5fd38d', '#52d6ea'];
      const strokeSegs = (segments, dash, alphaMult) => {
        segments.forEach((seg, i) => {
          ctx.save();
          ctx.globalAlpha = trackAlpha * alphaMult;
          ctx.strokeStyle = palette[i % palette.length];
          ctx.lineWidth = 1.6 * d;
          if (dash) ctx.setLineDash(dash);
          ctx.beginPath();
          (seg.points || []).forEach((pt, k) => {
            const [x, y] = toScreen(pointXY(pt));
            k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          });
          ctx.stroke();
          ctx.restore();
        });
      };
      strokeSegs(track.segments, null, 0.9);
      if (track.preview?.segments) {
        strokeSegs(track.preview.segments, [5 * d, 4 * d], 0.75);
      }
      const drawDots = (changes, color) => {
        for (const change of changes || []) {
          const [px, py] = toScreen(pointXY(change.point));
          ctx.save();
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(px, py, 3.5 * d, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = `600 ${10 * d}px Archivo, sans-serif`;
          ctx.fillStyle = '#ffffff';
          ctx.fillText(change.toBody ? `-> ${change.toBody.toUpperCase()}` : 'SOI', px + 5 * d, py - 4 * d);
          ctx.restore();
        }
      };
      drawDots(track.changes, '#ffffff');
      if (track.preview?.changes) drawDots(track.preview.changes, '#52d6ea');
      if (track.preview?.node?.point) {
        const [nx, ny] = toScreen(pointXY(track.preview.node.point));
        ctx.save();
        ctx.fillStyle = '#52d6ea';
        ctx.beginPath();
        ctx.arc(nx, ny, 4.5 * d, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = `600 ${10 * d}px Archivo, sans-serif`;
        ctx.fillText('NODE', nx + 6 * d, ny - 4 * d);
        ctx.restore();
      }
    }

    const sunPos = toScreen([0, 0]);
    const labels = [];

    const drawOne = (b, pos) => {
      const [px, py] = toScreen(pos);
      const alpha = fade(px, py);
      if (alpha <= 0.01) return;

      const isSun = b.id === 'sun';
      const rad = Math.max((isSun ? 5 : 2.6) * d, b.radius * scale);
      const c = DISPLAY_COLOUR[b.id] || b.color || [200, 200, 200];

      ctx.save();
      ctx.globalAlpha = alpha;

      if (isSun) {
        const glowR = Math.max(rad * 4, 60 * d);
        const glow = ctx.createRadialGradient(px, py, rad * 0.5, px, py, glowR);
        glow.addColorStop(0, 'rgba(255,196,96,.55)');
        glow.addColorStop(0.25, 'rgba(255,160,52,.2)');
        glow.addColorStop(1, 'rgba(255,140,40,0)');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(px, py, glowR, 0, 7); ctx.fill();

        const core = ctx.createRadialGradient(px - rad * .2, py - rad * .2, 1, px, py, rad);
        core.addColorStop(0, '#fff7da');
        core.addColorStop(0.55, '#ffd27a');
        core.addColorStop(1, '#ff9b2e');
        ctx.fillStyle = core;
        ctx.beginPath(); ctx.arc(px, py, rad, 0, 7); ctx.fill();
      } else {
        const halo = ctx.createRadialGradient(px, py, rad * .6, px, py, rad * 3);
        halo.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},.25)`);
        halo.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(px, py, rad * 3, 0, 7); ctx.fill();

        const dx = sunPos[0] - px, dy = sunPos[1] - py;
        const len = Math.hypot(dx, dy) || 1;
        const hx = px + dx / len * rad * .4, hy = py + dy / len * rad * .4;
        const sphere = ctx.createRadialGradient(hx, hy, rad * .08, px, py, rad * 1.08);
        const rgbs = a => `rgb(${a[0]},${a[1]},${a[2]})`;
        sphere.addColorStop(0, rgbs(tint(c, .6)));
        sphere.addColorStop(0.5, rgbs(c));
        sphere.addColorStop(1, rgbs(tint(c, -.72)));
        ctx.fillStyle = sphere;
        ctx.beginPath(); ctx.arc(px, py, rad, 0, 7); ctx.fill();

        if (b.id === 'saturn') {
          ctx.strokeStyle = 'rgba(222,200,150,.5)';
          ctx.lineWidth = 1.4 * d;
          ctx.beginPath();
          ctx.ellipse(px, py, rad * 2, rad * 0.6, -0.38, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();

      labels.push({
        name: b.name,
        x: px + rad + 8 * d,
        y: py + 4 * d,
        alpha,
        dist: Math.hypot(...rel(pos)),
      });
    };

    drawOne(by.sun, [0, 0]);
    for (const b of bodies) {
      if (b.id === 'sun' || b.id === bodyId) continue;
      const pos = this._heli(b.id, by);
      if (pos) drawOne(b, pos);
    }

    const own = by[bodyId];
    if (own && own.radius * scale < 14 * d) {
      labels.push({
        name: own.name,
        x: cx + Math.max(own.radius * scale, 3 * d) + 8 * d,
        y: cy + 4 * d,
        alpha: 1,
        dist: null,
      });
    }

    ctx.save();
    ctx.font = `500 ${12 * d}px Archivo, sans-serif`;
    ctx.lineJoin = 'round';
    for (const l of labels) {
      if (l.alpha < 0.3) continue;
      const text = l.dist != null ? `${l.name}  ${fmtFar(l.dist)}` : l.name;
      ctx.globalAlpha = clamp01((l.alpha - 0.3) / 0.5);
      ctx.lineWidth = 4 * d;
      ctx.strokeStyle = '#04060d';
      ctx.strokeText(text, l.x, l.y);
      ctx.fillStyle = '#e8edf5';
      ctx.fillText(text, l.x, l.y);
    }
    ctx.restore();
  }

  resize() {
    const d = Math.min(window.devicePixelRatio || 1, 2);

    this.c.width = this.c.clientWidth * d;
    this.c.height = this.c.clientHeight * d;

    this.d = d;
  }

  draw(sim) {
    const { ctx, c } = this;

    const d = this.d || 1;
    const W = c.width;
    const H = c.height;

    const body = sim?.body;
    const orbit = sim?.orbit || (typeof sim?.elements === 'function' ? sim.elements() : null);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(4,6,13,.9)';
    ctx.fillRect(0, 0, W, H);

    if (!body || !Number.isFinite(body.R) || !orbit) {
      ctx.fillStyle = 'rgba(232,237,245,.75)';
      ctx.font = `${12 * d}px Archivo, sans-serif`;

      ctx.fillText(
        'Waiting for backend orbital data...',
        16 * d,
        24 * d
      );

      return;
    }

    const cx = W / 2;
    const cy = H / 2;
    const radius = body.R;

    const path = Array.isArray(orbit.path)
      ? orbit.path
      : [];

    const free = Array.isArray(sim.free)
      ? sim.free
      : [];

    let maxPathRadius = 0;

    for (const point of path) {
      const [x, y] = pointXY(point);

      if (Number.isFinite(x) && Number.isFinite(y)) {
        maxPathRadius = Math.max(
          maxPathRadius,
          Math.hypot(x, y)
        );
      }
    }

    const reach = Math.max(
      radius * 1.35,
      maxPathRadius,
      Number.isFinite(orbit.ra) ? orbit.ra : 0,
      Number.isFinite(orbit.r) ? orbit.r : 0
    );

    const scale =
      0.4 * Math.min(W, H) /
      Math.max(reach, 1) *
      this.zoom;

    const project = (x, y) => [
      cx + x * scale,
      cy - y * scale
    ];

    ctx.font = `500 ${12 * d}px Archivo, sans-serif`;
    ctx.lineWidth = d;

    this._drawSystem(ctx, {
      W, H, cx, cy, d, scale, bodyId: body.id,
    });

    // Reference-radius rings.
    ctx.strokeStyle = 'rgba(138,151,171,.12)';

    for (let k = 1; k < 8 && radius * scale > 2 * d; k++) {
      const ringRadius =
        radius * k * (reach > radius * 8 ? 4 : 1);

      ctx.beginPath();
      ctx.arc(
        cx,
        cy,
        ringRadius * scale,
        0,
        Math.PI * 2
      );

      ctx.stroke();
    }

    // Atmosphere.
    if (body.atmosphereTop > 0) {
      ctx.fillStyle = 'rgba(82,143,235,.16)';

      ctx.beginPath();
      ctx.arc(
        cx,
        cy,
        (radius + body.atmosphereTop) * scale,
        0,
        Math.PI * 2
      );

      ctx.fill();
    }

    // Planet.
    ctx.fillStyle = rgb(
      this.ground || body.ground || [120, 120, 120]
    );

    ctx.beginPath();
    ctx.arc(
      cx,
      cy,
      radius * scale,
      0,
      Math.PI * 2
    );

    ctx.fill();

    // Backend-generated orbital path.
    this._drawPath(
      path,
      project,
      css('--plan'),
      2 * d,
      false
    );

    // Detached objects and their backend-generated trajectories.
    for (const object of free) {
      if (!object || object.dead) continue;

      if (Array.isArray(object.orbit?.path)) {
        this._drawPath(
          object.orbit.path,
          project,
          'rgba(82,214,234,.55)',
          d,
          true
        );
      }

      if (
        Number.isFinite(object.x) &&
        Number.isFinite(object.y)
      ) {
        const [x, y] = project(object.x, object.y);

        ctx.fillStyle = css('--ref');

        ctx.fillRect(
          x - 3 * d,
          y - 3 * d,
          6 * d,
          6 * d
        );

        ctx.fillStyle = css('--frost');

        ctx.fillText(
          object.label || 'Detached part',
          x + 8 * d,
          y + 4 * d
        );
      }
    }

    const mark = (x, y, label, color) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;

      const [px, py] = project(x, y);

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, 4 * d, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = css('--frost');

      ctx.fillText(
        label,
        px + 9 * d,
        py - 7 * d
      );
    };

    // Apoapsis marker.
    if (
      orbit.bound &&
      Number.isFinite(orbit.e) &&
      orbit.e > 1e-4 &&
      Number.isFinite(orbit.ra) &&
      Number.isFinite(orbit.w)
    ) {
      mark(
        orbit.ra * Math.cos(orbit.w + Math.PI),
        orbit.ra * Math.sin(orbit.w + Math.PI),
        `Ap ${fmtDist(orbit.ra - radius)}  ${fmtTime(orbit.tToApoapsis)}`,
        css('--plan')
      );
    }

    // Periapsis marker.
    if (
      Number.isFinite(orbit.rp) &&
      orbit.rp > radius * 0.9 &&
      Number.isFinite(orbit.w)
    ) {
      mark(
        orbit.rp * Math.cos(orbit.w),
        orbit.rp * Math.sin(orbit.w),
        `Pe ${fmtDist(orbit.rp - radius)}  ${fmtTime(orbit.tToPeriapsis)}`,
        css('--plan')
      );
    }

    // Vehicle marker.
    if (
      Number.isFinite(sim.x) &&
      Number.isFinite(sim.y)
    ) {
      const [vx, vy] = project(sim.x, sim.y);

      ctx.save();
      ctx.translate(vx, vy);
      ctx.rotate(sim.th || 0);

      ctx.fillStyle = css('--frost');

      ctx.beginPath();
      ctx.moveTo(0, -9 * d);
      ctx.lineTo(6 * d, 7 * d);
      ctx.lineTo(-6 * d, 7 * d);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }

    ctx.fillStyle = css('--dim');

    ctx.fillText(
      `${body.name || body.id}  ·  scroll out to see the solar system  ·  M to close`,
      16 * d,
      24 * d
    );

    const eccentricity = Number.isFinite(orbit.e)
      ? orbit.e.toFixed(3)
      : '--';

    ctx.fillText(
      `e ${eccentricity}   period ${fmtTime(orbit.period)}   inclination 0° (planar model)`,
      16 * d,
      42 * d
    );
  }

  _drawPath(points, project, color, width, dashed) {
    if (!Array.isArray(points) || points.length < 2) return;

    const ctx = this.ctx;
    const d = this.d || 1;

    ctx.save();

    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(
      dashed ? [5 * d, 5 * d] : []
    );

    ctx.beginPath();

    let started = false;

    for (const point of points) {
      const [x, y] = pointXY(point);

      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        continue;
      }

      const [px, py] = project(x, y);

      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else {
        ctx.lineTo(px, py);
      }
    }

    if (started) ctx.stroke();

    ctx.restore();
  }
}

/** Attitude indicator. Nose is fixed at the top; the horizon tilts with the vehicle; markers show where the velocity vector points. */
export function drawAdi(canvas, sim, tel) {
  const d = Math.min(window.devicePixelRatio || 1, 2);
  const S = canvas.clientWidth;

  if (S <= 0) return;

  if (canvas.width !== S * d) {
    canvas.width = S * d;
    canvas.height = S * d;
  }

  const ctx = canvas.getContext('2d');
  const R = S * d / 2 - 3 * d;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);

  const phi = Math.atan2(sim.x, sim.y);
  const beta = sim.th - phi;

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, 7);
  ctx.clip();
  ctx.rotate(-beta);

  ctx.fillStyle = sim.body.rho0 > 0
    ? '#27456e'
    : '#1a2230';

  ctx.fillRect(-R * 2, -R * 2, R * 4, R * 2);

  ctx.fillStyle = '#4a3a2c';
  ctx.fillRect(-R * 2, 0, R * 4, R * 2);

  ctx.strokeStyle = 'rgba(232,237,245,.9)';
  ctx.lineWidth = 2 * d;

  ctx.beginPath();
  ctx.moveTo(-R * 2, 0);
  ctx.lineTo(R * 2, 0);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(232,237,245,.35)';
  ctx.lineWidth = d;

  for (let a = -60; a <= 60; a += 30) {
    if (!a) continue;

    const y = -a / 90 * R * 1.1;

    ctx.beginPath();
    ctx.moveTo(-R * .16, y);
    ctx.lineTo(R * .16, y);
    ctx.stroke();
  }

  ctx.restore();

  const sp = Math.hypot(sim.vx, sim.vy);

  if (sp > 1) {
    const rel = Math.atan2(sim.vx, sim.vy) - phi - beta;

    const mk = (a, fn) => {
      ctx.save();
      ctx.translate(
        Math.sin(a) * R * .64,
        -Math.cos(a) * R * .64
      );
      fn();
      ctx.restore();
    };

    ctx.lineWidth = 2 * d;
    ctx.strokeStyle = '#5fdb8f';

    mk(rel, () => {
      ctx.beginPath();
      ctx.arc(0, 0, 6 * d, 0, 7);

      ctx.moveTo(-11 * d, 0);
      ctx.lineTo(-6 * d, 0);

      ctx.moveTo(11 * d, 0);
      ctx.lineTo(6 * d, 0);

      ctx.moveTo(0, -6 * d);
      ctx.lineTo(0, -11 * d);

      ctx.stroke();
    });

    ctx.strokeStyle = '#5fdb8f';

    mk(rel + Math.PI, () => {
      ctx.beginPath();
      ctx.arc(0, 0, 6 * d, 0, 7);

      ctx.moveTo(-4 * d, -4 * d);
      ctx.lineTo(4 * d, 4 * d);

      ctx.moveTo(4 * d, -4 * d);
      ctx.lineTo(-4 * d, 4 * d);

      ctx.stroke();
    });
  }

  ctx.strokeStyle = '#e8edf5';
  ctx.lineWidth = 3 * d;

  ctx.beginPath();

  ctx.moveTo(-R * .3, 0);
  ctx.lineTo(-R * .1, 0);

  ctx.moveTo(R * .3, 0);
  ctx.lineTo(R * .1, 0);

  ctx.moveTo(0, -R * .05);
  ctx.lineTo(0, R * .12);

  ctx.stroke();

  ctx.fillStyle = '#e8edf5';

  ctx.beginPath();
  ctx.moveTo(0, -R);
  ctx.lineTo(7 * d, -R + 13 * d);
  ctx.lineTo(-7 * d, -R + 13 * d);
  ctx.fill();

  ctx.strokeStyle = 'rgba(138,151,171,.7)';
  ctx.lineWidth = 1.5 * d;

  ctx.beginPath();
  ctx.arc(0, 0, R, 0, 7);
  ctx.stroke();
}