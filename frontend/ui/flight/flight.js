import { state, mission as missionById } from '../../js/core/store.js';
import { api } from '../../js/core/api.js';
import { h, toast, ask, bus } from '../../js/core/bus.js';
import { instantiate } from '../../js/vehicle/vehicle.js';
import { computeStats } from '../../js/vehicle/stats.js';
import { FlightSessionClient } from '../../js/simulation/flight.js';
import { WARP_LEVELS } from '../../js/core/constants.js';
import { FlightView } from '../../js/rendering/flightView.js';
import { MapView, drawAdi } from '../../js/rendering/mapView.js';
import { audio } from '../../js/core/audio.js';
import { keybindings } from '../../js/core/keybindings.js';
import {
  fmtDist,
  fmtSpeed,
  fmtMass,
  fmtForce,
  fmtTime,
  fmtClock,
  fmtMoney,
} from '../shared/format.js';

const $ = (root, selector) => root.querySelector(selector);

const HTML = `
<canvas class="scene" id="fl-canvas"></canvas>
<canvas id="fl-map" hidden></canvas>

<div class="hud hud-left-col hud-tl">
  <div class="box" id="fl-mission"></div>
  <div class="hud-left" id="fl-left">
    <div class="throttle-gauge">
      <span class="gauge-title">Throttle</span>
      <div class="gtxt num" id="fl-thr-txt">0%</div>
      <div class="gauge" id="fl-gauge">
        <div class="fill" id="fl-thr"></div>
        <div class="min" id="fl-min"></div>
      </div>
    </div>
    <div class="stages" id="fl-stages"></div>
  </div>
</div>

<div class="hud hud-tr">
  <div class="clock">
    <span class="clock-label">MISSION ELAPSED</span>
    <span class="clock-value num">
      <span class="clock-prefix">T+</span>
      <span id="fl-clock">00:00:00</span>
    </span>
    <div class="tags" id="fl-tags"></div>
  </div>
</div>

<div class="hud hud-right">
  <div class="hud-right-header">
    <button class="telemetry-toggle" id="fl-telemetry-toggle"
      type="button" aria-expanded="false">
      <span class="toggle-icon">▾</span> <span class="toggle-text">More flight data</span>
    </button>
  </div>
  <div class="box">
    <div class="sec">Flight</div>
    <div class="row big">
      <span class="l">Altitude</span>
      <span class="v num" id="r-alt"></span>
    </div>
    <div class="row">
      <span class="l">Speed</span>
      <span class="v num" id="r-spd"></span>
    </div>
    <div class="row" id="r-heat-row" hidden>
      <span class="l">Skin temp</span>
      <span class="v num" id="r-heat"></span>
    </div>
    <div class="row">
      <span class="l">Body</span>
      <span class="v num" id="r-body"></span>
    </div>
    <div id="r-soi-wrap" hidden>
      <div class="row">
        <span class="l">SOI exit</span>
        <span class="v num" id="r-soi"></span>
      </div>
      <div class="bar"><i id="r-soibar"></i></div>
    </div>
    <div class="row" id="r-ca-row" hidden>
      <span class="l">Closest approach</span>
      <span class="v num" id="r-ca"></span>
    </div>
    <div class="advanced-telemetry" hidden>
      <div class="row">
        <span class="l">Vertical speed</span>
        <span class="v num" id="r-vert"></span>
      </div>
      <div class="row">
        <span class="l">Horizontal speed</span>
        <span class="v num" id="r-hor"></span>
      </div>
    </div>
  </div>

  <div class="box">
    <div class="sec">Orbit (predicted)</div>
    <div class="row">
      <span class="l">Apoapsis</span>
      <span class="v num magenta" id="r-apo"></span>
    </div>
    <div class="row">
      <span class="l">Periapsis</span>
      <span class="v num magenta" id="r-per"></span>
    </div>
    <div class="advanced-telemetry row" hidden>
      <span class="l">Time to apsis</span>
      <span class="v num" id="r-tta"></span>
    </div>
  </div>

  <div class="box">
    <div class="sec">Propulsion</div>
    <div class="row">
      <span class="l">Propellant</span>
      <span class="v num" id="r-fuel"></span>
    </div>
    <div class="bar"><i id="r-fuelbar"></i></div>
    <div class="row">
      <span class="l">Delta-v remaining</span>
      <span class="v num" id="r-dv"></span>
    </div>
    <div class="advanced-telemetry" hidden>
      <div class="row">
        <span class="l">Thrust-to-weight</span>
        <span class="v num" id="r-twr"></span>
      </div>
      <div class="row">
        <span class="l">Thrust</span>
        <span class="v num" id="r-thr"></span>
      </div>
      <div class="row">
        <span class="l">Mass</span>
        <span class="v num" id="r-mass"></span>
      </div>
    </div>
  </div>

  <div class="box advanced-telemetry" id="fl-node-box" hidden>
    <div class="sec">Maneuver preview</div>
    <label class="row"><span class="l">In (s)</span><input id="fl-node-at" type="number" min="0" value="60"></label>
    <label class="row"><span class="l">Prograde m/s</span><input id="fl-node-pro" type="number" value="0"></label>
    <label class="row"><span class="l">Radial m/s</span><input id="fl-node-rad" type="number" value="0"></label>
    <div class="row">
      <button id="fl-node-go" type="button">Preview</button>
      <button id="fl-node-clear" type="button">Clear</button>
    </div>
    <div class="dim" id="fl-node-out"></div>
  </div>
</div>

<div class="hud hud-bottom">
  <div class="prompt" id="fl-prompt" hidden></div>
  <div class="countdown" id="fl-countdown" hidden></div>
</div>

<div class="hud hud-adi">
  <canvas id="adi" aria-label="Vehicle attitude indicator"></canvas>
</div>

<div class="hud hud-controls">
  <div class="control-bar">
    <div class="control-hints">
      <span><kbd>W</kbd>/<kbd>S</kbd> Throttle</span>
      <span><kbd>A</kbd>/<kbd>D</kbd> Steer</span>
      <span><kbd>Space</kbd> Stage</span>
      <span><kbd>M</kbd> Map</span>
    </div>
    <div class="control-actions">
      <div class="camera-toolbar" id="fl-cam-bar" role="group" aria-label="3D Cameras">
        <button class="cam-btn active" data-cam="track" type="button" title="Ascent Tracking (1)">Track</button>
        <button class="cam-btn" data-cam="pad_wide" type="button" title="Launch Complex Wide (2)">Pad Wide</button>
        <button class="cam-btn" data-cam="pad_low" type="button" title="Low Angle Rocket (3)">Low Angle</button>
        <button class="cam-btn" data-cam="engine_close" type="button" title="Engine Plume Close-Up (4)">Engines</button>
        <button class="cam-btn" data-cam="distant" type="button" title="Perimeter Observation (5)">Perimeter</button>
        <button class="cam-btn" data-cam="free" type="button" title="Free 3D Orbit (6)">Free 3D</button>
      </div>
      <button class="controls-toggle" id="fl-map-toggle"
        type="button" aria-pressed="false">
        Map
      </button>
      <button class="controls-toggle" id="fl-controls-toggle"
        type="button" aria-expanded="false" aria-controls="fl-controls">
        All controls
      </button>
    </div>
  </div>

  <button id="fl-rover-deploy" class="rover-deploy-btn" hidden type="button">🚜 Deploy Surface Rover (R)</button>

  <div class="keys" id="fl-controls" hidden>
    <span><kbd>W</kbd>/<kbd>S</kbd> Adjust throttle</span>
    <span><kbd>Z</kbd> Full throttle</span>
    <span><kbd>X</kbd> Cut throttle</span>
    <span><kbd>A</kbd>/<kbd>D</kbd> Rotate</span>
    <span><kbd>Space</kbd> Stage</span>
    <span><kbd>1</kbd>–<kbd>4</kbd> Engine groups</span>
    <span><kbd>T</kbd>/<kbd>G</kbd> Prograde / retrograde</span>
    <span><kbd>Y</kbd> Hold attitude</span>
    <span><kbd>P</kbd> Payload</span>
    <span><kbd>C</kbd> Parachute</span>
    <span><kbd>J</kbd> Heat shield</span>
    <span><kbd>K</kbd> Sample</span>
    <span><kbd>L</kbd> Lander</span>
    <span><kbd>,</kbd>/<kbd>.</kbd> Time warp</span>
    <span><kbd>M</kbd> Map</span>
    <span><kbd>Wheel</kbd> Zoom / map</span>
    <span><kbd>Esc</kbd> Pause</span>
  </div>
</div>

<button class="btn pause-btn" id="fl-pause"
  style="pointer-events:auto">
  <span class="pause-icon" aria-hidden="true"></span>
  <span>Pause</span>
</button>
`;

const bodyFrom = data => ({
  id: data.id,
  name: data.name,
  R: data.R,
  mu: data.mu,
  rho0: data.rho0,
  scaleHeight: data.scaleHeight,
  atmosphereTop: data.atmosphereTop,
  ground: data.ground,
  groundDark: data.groundDark,
  sky: data.sky,
  style: data.style,
});

export const flightScreen = {
  client: null,
  sim: null,
  view: null,
  map: null,
  running: false,

  mount(root) {
    this.root = root;
    root.innerHTML = HTML;

    this.el = id => $(root, '#' + id);

    this.launchSequenceBtn = h('button', {
      class: 'launch-sequence',
      id: 'fl-launch-sequence',
      onclick: () => {
        if (this.launchCountdown) {
          this.cancelLaunchSequence();
        } else {
          this.beginLaunchSequence();
        }
      },
      hidden: true,
    });

    this.el('fl-pause').onclick = () => this.pause();

    this.el('fl-controls-toggle').onclick = e => {
      const panel = this.el('fl-controls');
      const expanded =
        e.currentTarget.getAttribute('aria-expanded') === 'true';

      e.currentTarget.setAttribute(
        'aria-expanded',
        String(!expanded)
      );

      panel.hidden = expanded;
    };

    this.el('fl-map-toggle').onclick = e => {
      const open = !this.mapOpen;
      this.setMapOpen(open);
      e.currentTarget.setAttribute('aria-pressed', String(open));
    };

    this.el('fl-node-go').onclick = () => this.previewNode();
    this.el('fl-node-clear').onclick = () => this.clearNode();

    this.el('fl-telemetry-toggle').onclick = e => {
      const btn = e.currentTarget;
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      const nextExpanded = !expanded;
      btn.setAttribute('aria-expanded', String(nextExpanded));

      const txt = btn.querySelector('.toggle-text') || btn;
      const icon = btn.querySelector('.toggle-icon');
      if (icon) icon.textContent = nextExpanded ? '▴' : '▾';
      txt.textContent = nextExpanded ? 'Less flight data' : 'More flight data';

      this.root.querySelectorAll('.advanced-telemetry')
        .forEach(row => {
          row.hidden = !nextExpanded;
        });
    };

    this.el('fl-canvas').addEventListener(
      'wheel',
      e => this.zoomWithWheel(e),
      { passive: false }
    );

    this.el('fl-map').addEventListener(
      'wheel',
      e => this.zoomWithWheel(e),
      { passive: false }
    );

    this._keydown = e => this.key(e, true);
    this._keyup = e => this.key(e, false);
    this._resize = () => this.resize();

    window.addEventListener('keydown', this._keydown);
    window.addEventListener('keyup', this._keyup);
    window.addEventListener('resize', this._resize);

    this.keys = new Set();
  },

  async start(cfg) {
    await this.stop();

    const generation = this.gen;
    this.cfg = cfg;

    const { catalog } = state;
    const bodyData = catalog.body(cfg.bodyId);

    if (!bodyData) {
      toast('Selected celestial body was not found.', 'bad');
      return;
    }

    const body = bodyFrom(bodyData);

    state.track = null;
    this.prediction = null;
    this.nodePreview = null;
    this.lastPrediction = 0;
    this.predicting = false;

    this.body = body;
    this.launchCountdown = null;
    this.paused = false;
    this.ended = false;
    this.mapOpen = false;
    this.mapTransition = null;
    this.flightEpoch = null;
    this.lastSnapshotTime = 0;
    this.lastRotationSent = null;
    this.lastThrottleSent = null;
    this.lastControlTime = 0;
    this.simTarget = null;
    this.telemetryTarget = null;
    this.interpolation = null;
    this._checkingEnd = false;
    this._ending = false;

    this.el('fl-controls-toggle')
      .setAttribute('aria-expanded', 'false');

    this.el('fl-controls').hidden = true;
    this.el('fl-map-toggle').setAttribute('aria-pressed', 'false');

    this.el('fl-telemetry-toggle')
      .setAttribute('aria-expanded', 'false');

    const toggleTxt = this.el('fl-telemetry-toggle').querySelector('.toggle-text');
    if (toggleTxt) toggleTxt.textContent = 'More flight data';
    else this.el('fl-telemetry-toggle').textContent = 'More flight data';
    const toggleIco = this.el('fl-telemetry-toggle').querySelector('.toggle-icon');
    if (toggleIco) toggleIco.textContent = '▾';

    this.root.querySelectorAll('.advanced-telemetry')
      .forEach(row => {
        row.hidden = true;
      });

    try {
      this.launchStats = await computeStats(
        cfg.blueprint,
        catalog,
        cfg.bodyId
      );
    } catch (error) {
      if (generation !== this.gen) return;

      toast(
        `Could not calculate launch vehicle: ${error.message}`,
        'bad',
        6000
      );

      return;
    }

    if (generation !== this.gen) return;

    if (!this.launchStats.ready) {
      toast(
        this.launchStats.errors[0] || 'Vehicle is not launch-ready.',
        'warn',
        6000
      );

      return;
    }

   
    this.visualParts = instantiate(
      cfg.blueprint,
      catalog,
      { includeLoose: true }
    );

    this.client = new FlightSessionClient();

    try {
      const snapshot = await this.client.start({
        blueprint: cfg.blueprint,
        bodyId: cfg.bodyId,
        start: cfg.start,
        missionId: cfg.missionId || null,
      });

      if (generation !== this.gen) {
        await this.client.close();
        return;
      }

      this._syncSnapshot(snapshot);
    } catch (error) {
      if (generation !== this.gen) return;

      toast(
        `Could not start flight session: ${error.message}`,
        'bad',
        7000
      );

      await this.stop();
      return;
    }

    this.mission = cfg.missionId
      ? structuredClone(missionById(cfg.missionId))
      : null;

    if (
      this.view &&
      this.view.quality !== state.settings.quality
    ) {
      this.view.dispose();
      this.view = null;
    }

    if (!this.view) {
      this.view = new FlightView(
        this.el('fl-canvas'),
        { quality: state.settings.quality }
      );
    } else {
      this.view.reset();
    }

    this.view.setBody({ ...body });

    await this.view.setVehicle(this.visualParts, cfg.blueprint?.payload);

    if (generation !== this.gen) return;

    this.map = this.map || new MapView(this.el('fl-map'));
    this.map.ground = body.ground;
    this.map.zoom = 1;

    this.el('fl-map').hidden = true;

    this.root.classList.remove(
      'map-open',
      'map-transitioning',
      'countdown-active'
    );

    this.resize();

    this.warpIdx = 0;
    this.dvT = 0;
    this.dv = this.launchStats.dv;

    this.buildMissionBox();

    this.running = true;
    this.last = performance.now();
    this.hudT = 0;
    this.keys.clear();

    audio.stopLoop('music_menu', 1.0);
    audio.playLoop('ambience_launch', { volume: 0.5 });

    requestAnimationFrame(t => this.frame(t));
  },

  _syncSnapshot(snapshot) {
    if (!snapshot) return;

    const rs = snapshot.renderState || {};
    const telemetry = snapshot.telemetry || {};
    const controls = snapshot.controls || {};

    const bodyId = rs.bodyId || telemetry.bodyId;
    if (bodyId && this.body && bodyId !== this.body.id) {
      this._switchBody(bodyId);
    }

    const position = rs.position || {};
    const velocity = rs.velocity || {};

    const runtimeParts = new Map(
      (rs.parts || []).map(part => [part.uid, part])
    );

    const parts = this.visualParts.map(part => {
      const runtime = runtimeParts.get(part.uid);

      return runtime
        ? { ...part, ...runtime, def: part.def }
        : { ...part };
    });

    const engines = parts.filter(part => part.def?.engine);

    const engineStates = new Map(
      (rs.engines || []).map(engine => [engine.uid, engine])
    );

    for (const engine of engines) {
      const runtime = engineStates.get(engine.uid);
      if (runtime) Object.assign(engine, runtime);
    }

    const orbitElements = snapshot.orbitElements || snapshot.orbit || null;

    const nextSim = {
      body: this.body,

      x: position.x ?? 0,
      y: position.y ?? this.body.R,
      vx: velocity.x ?? 0,
      vy: velocity.y ?? 0,

      th: rs.rotation ?? 0,
      t: snapshot.missionTime ?? 0,
      status: snapshot.status || 'prelaunch',

      throttle: telemetry.throttle ?? 0,
      sas: telemetry.sas ?? null,
      warp: telemetry.warp ?? 1,

      lastRails: telemetry.rails ?? false,

      stageDone: controls.stageDone ?? 0,
      stagesFired: controls.stagesFired ?? 0,

      crashed: rs.crashed ?? snapshot.status === 'crashed',
      crashMsg: rs.crashMessage || '',

      maxAlt: rs.maxAltitude ?? 0,
      baseOffset: rs.baseOffset ?? 0,
      com: rs.centerOfMass ?? 0,

      topY: rs.topY ?? 0,
      botY: rs.bottomY ?? 0,

      parts,
      engines,

      free: (rs.detachedObjects || []).map(object => ({
        ...object,
        parts: (object.uids || []).map(uid => parts.find(part => part.uid === uid)).filter(Boolean),
      })),
      blasts: rs.explosions || [],

      padWorld: rs.padPosition || null,

      holdDown: controls.holdDown ?? false,

      pressureRatio: altitude =>
        rs.pressureRatio ?? 1,

      orbit: orbitElements,
      elements: () => orbitElements,
    };

    const previousSim = this.sim;
    const previousTelemetry = this.telemetryData;
    this.simTarget = nextSim;
    this.telemetryTarget = telemetry;
    if (previousSim && Number.isFinite(previousSim.t) && nextSim.t >= previousSim.t) {
      const elapsed = Math.max(0.05, Math.min(0.25, nextSim.t - previousSim.t));
      this.interpolation = {
        from: previousSim,
        to: nextSim,
        telemetryFrom: previousTelemetry || telemetry,
        telemetryTo: telemetry,
        started: performance.now(),
        duration: elapsed * 1000,
      };
    } else {
      this.sim = nextSim;
      this.telemetryData = telemetry;
      this.interpolation = null;
    }
    this.currentSnapshot = snapshot;
    this.objectiveData = snapshot.objectives || [];

    this.launchCountdown =
      controls.launchCountdown ??
      snapshot.launchCountdown ??
      null;

    if (this.flightEpoch === null && this.sim.status !== 'prelaunch') {
      this.flightEpoch = this.sim.t;
    }

    this._schedulePrediction();
  },

  _switchBody(bodyId) {
    const data = state.catalog.body(bodyId);
    if (!data || !this.view) return;
    this.body = bodyFrom(data);
    this.view.setBody({ ...this.body });
    if (this.map) this.map.ground = this.body.ground;
    this.sim = null;
    this.interpolation = null;
    toast(`Entered ${this.body.name} sphere of influence`, 'good');
  },

  _targetBody() {
    const objectives = this.mission?.objectives || [];
    const progress = this.objectiveData || [];
    for (let i = 0; i < objectives.length; i++) {
      if (progress[i]?.met === true) continue;
      const id =
        objectives[i].body ||
        (objectives[i].type === 'reach_body' ? objectives[i].value : null);
      if (id && state.catalog.body(id)) return id;
    }
    return null;
  },

  _schedulePrediction() {
    const now = performance.now();
    const sessionId = this.client?.sessionId;
    if (
      !sessionId ||
      this.ended ||
      this.predicting ||
      now - (this.lastPrediction || 0) < 2000
    ) {
      return;
    }
    this.lastPrediction = now;
    this.predicting = true;
    const generation = this.gen;
    api.predictFlight(sessionId, { target: this._targetBody(), count: 240 })
      .then(result => {
        if (generation !== this.gen) return;
        this.prediction = result;
        state.track = { ...result, preview: this.nodePreview || null };
      })
      .catch(() => {})
      .finally(() => {
        this.predicting = false;
      });
  },

  async previewNode() {
    const sessionId = this.client?.sessionId;
    if (!sessionId) return;
    const read = id => Number(this.el(id).value) || 0;
    const node = {
      at: read('fl-node-at'),
      prograde: read('fl-node-pro'),
      radial: read('fl-node-rad'),
    };
    try {
      const result = await api.predictFlight(sessionId, {
        node,
        target: this._targetBody(),
        horizon: this.prediction?.horizon,
        count: 240,
      });
      this.nodePreview = result;
      if (state.track) {
        state.track.preview = result;
      } else {
        state.track = { ...(this.prediction || {}), preview: result };
      }
      this._showNode(result);
    } catch (error) {
      toast(error.message, 'bad');
    }
  },

  clearNode() {
    this.nodePreview = null;
    if (state.track) state.track.preview = null;
    this._showNode(null);
  },

  _showNode(result) {
    const out = this.el('fl-node-out');
    const node = result?.node;
    if (!node) {
      out.textContent = '';
      return;
    }
    const approach = result.closestApproach;
    let text = `Pe ${fmtDist(node.periapsis)} · Ap ${
      node.bound ? fmtDist(node.apoapsis) : 'Escape'
    }`;
    if (approach) {
      const targetName = state.catalog.body(approach.bodyId)?.name || approach.bodyId;
      text += ` · CA ${targetName} ${fmtDist(approach.distance)}`;
    }
    if (result.changes?.length) {
      const enc = result.changes[0];
      const encName = state.catalog.body(enc.toBody)?.name || enc.toBody;
      text += ` · SOI -> ${encName}`;
    } else if (result.impact) {
      const impName = state.catalog.body(result.impact.bodyId)?.name || result.impact.bodyId;
      text += ` · Impact ${impName}`;
    }
    out.textContent = text;
  },

  _updateInterpolatedState(now) {
    const state = this.interpolation;
    if (!state) return;
    const progress = Math.min(1, Math.max(0, (now - state.started) / state.duration));
    const lerp = (a, b) => a + (b - a) * progress;
    const angleDelta = (state.to.th - state.from.th + Math.PI) % (2 * Math.PI) - Math.PI;
    this.sim = {
      ...state.to,
      x: lerp(state.from.x, state.to.x),
      y: lerp(state.from.y, state.to.y),
      vx: lerp(state.from.vx, state.to.vx),
      vy: lerp(state.from.vy, state.to.vy),
      th: state.from.th + angleDelta * progress,
      t: lerp(state.from.t, state.to.t),
    };
    const interpolated = { ...state.telemetryTo };
    for (const key of ['alt', 'speed', 'vert', 'horiz', 'mass', 'fuel', 'thrust', 'twr', 'deltaV', 'temperature', 'heatFlux', 'ablativeMass']) {
      if (Number.isFinite(state.telemetryFrom[key]) && Number.isFinite(state.telemetryTo[key])) {
        interpolated[key] = lerp(state.telemetryFrom[key], state.telemetryTo[key]);
      }
    }
    this.telemetryData = interpolated;
    if (progress === 1) this.interpolation = null;
  },

  async _command(method, ...args) {
    if (!this.client || this.client.closed) return null;

    if (method === 'activateNextStage') {
      audio.play('stage_separation');
      this.view?.addTrauma(0.85);
    }

    try {
      const result = await this.client[method](...args);

      if (result?.snapshot) {
        this._syncSnapshot(result.snapshot);
      } else {
        this._syncSnapshot(this.client.currentSnapshot);
      }

      return result;
    } catch (error) {
      toast(error.message, 'warn');
      return null;
    }
  },

  async beginLaunchSequence() {
    if (
      !this.client ||
      this.sim?.status !== 'prelaunch' ||
      this.launchCountdown
    ) {
      return;
    }

    const result = await this._command(
      'command',
      'begin_launch_sequence'
    );

    if (!result) return;
    audio.play('engine_ignition');
    this.view?.addTrauma(0.6);

    this.launchSequenceBtn.textContent = 'Abort countdown';
    this.launchSequenceBtn.classList.add('is-abort');
  },

  async cancelLaunchSequence() {
    if (!this.launchCountdown) return;

    await this._command(
      'command',
      'abort_launch_sequence'
    );

    this.launchCountdown = null;

    this.launchSequenceBtn.textContent =
      'Start launch sequence';

    this.launchSequenceBtn.classList.remove('is-abort');

    this.el('fl-countdown').hidden = true;
    this.root.classList.remove('countdown-active');
  },

  async stop() {
    this.running = false;
    this.gen = (this.gen || 0) + 1;

    audio.stopLoop('ambience_launch');
    audio.stopLoop('engine_loop');
    audio.stopLoop('rover_movement');

    const dialog = document.getElementById('dialog');

    if (dialog?.open) dialog.close();

    const client = this.client;

    this.client = null;
    this.sim = null;
    this.simTarget = null;
    this.telemetryTarget = null;
    this.interpolation = null;
    this.currentSnapshot = null;

    if (client && !client.closed) {
      try {
        await client.close();
      } catch (error) {
        console.warn('Could not close flight session:', error);
      }
    }
  },

  resize() {
    if (!this.view) return;

    this.view.resize();
    this.map?.resize();
  },

  zoomWithWheel(e) {
    e.preventDefault();

    if (this.mapTransition || !this.view) return;

    const change = Math.exp(e.deltaY * 0.0018);

    if (this.mapOpen) {
      if (e.deltaY < 0 && this.map.zoom >= 0.999) {
        this.transitionMap(false);
        return;
      }

      const mapChange = Math.exp(e.deltaY * 0.0035);

      this.map.zoom = Math.min(
        1,
        Math.max(1e-7, this.map.zoom / mapChange)
      );

      return;
    }

    const zoom = this.view.zoom * change;

    if (zoom >= 12) {
      this.transitionMap(true);
    } else {
      this.view.zoom = Math.max(
        this.view.minZoom || 0.000001,
        zoom
      );
    }
  },

  setMapOpen(open) {
    this.el('fl-map-toggle')?.setAttribute('aria-pressed', String(open));
    this.transitionMap(open);
  },

  transitionMap(open) {
    if (this.mapTransition || open === this.mapOpen) return;

    const mapCanvas = this.el('fl-map');
    const startZoom = this.view.zoom;
    const endZoom = open ? 12 : 1;

    const duration = matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches ? 0 : 650;

    const started = performance.now();

    this.mapTransition = { open };

    if (open) {
      this.mapOpen = true;
      this.map.zoom = 1;
      mapCanvas.hidden = false;
      this.map.resize();
      this.root.classList.add('map-open');
    } else {
      this.root.classList.remove('map-open');
    }

    this.root.classList.add('map-transitioning');

    const animate = now => {
      if (
        !this.running ||
        !this.mapTransition ||
        this.mapTransition.open !== open
      ) {
        return;
      }

      const progress = duration
        ? Math.min(1, (now - started) / duration)
        : 1;

      const eased = 1 - (1 - progress) ** 3;

      this.view.zoom =
        startZoom + (endZoom - startZoom) * eased;

      if (progress < 1) {
        requestAnimationFrame(animate);
        return;
      }

      this.view.zoom = endZoom;

      if (!open) {
        this.mapOpen = false;
        mapCanvas.hidden = true;
      }

      this.root.classList.remove('map-transitioning');
      this.mapTransition = null;
    };

    requestAnimationFrame(animate);
  },

  key(e, down) {
    if (
      !this.running ||
      this.root.hidden ||
      document.getElementById('dialog')?.open
    ) {
      return;
    }

    if (
      [
        'Space',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
      ].includes(e.code)
    ) {
      e.preventDefault();
    }

    if (down) {
      this.keys.add(e.code);
    } else {
      this.keys.delete(e.code);
    }

    if (!down || e.repeat) return;

    if (
      this.launchCountdown &&
      [
        'Space',
        'KeyW',
        'ArrowUp',
        'ShiftLeft',
        'KeyZ',
        'KeyX',
        'KeyS',
        'ArrowDown',
        'ControlLeft',
      ].includes(e.code)
    ) {
      if (e.code === 'Space') {
        this.cancelLaunchSequence();
        return;
      }

      this.cancelLaunchSequence();
    }

    if (keybindings.matches(e.code, 'stage')) {
      this._command('activateNextStage');
      return;
    }
    if (keybindings.matches(e.code, 'throttleMax')) {
      this.throttleTarget = null;
      this._command('setThrottle', 1);
      return;
    }
    if (keybindings.matches(e.code, 'throttleCut')) {
      this.throttleTarget = null;
      this._command('setThrottle', 0);
      return;
    }
    if (keybindings.matches(e.code, 'sasPrograde')) {
      this._command('setSAS', 'prograde');
      return;
    }
    if (keybindings.matches(e.code, 'sasRetrograde')) {
      this._command('setSAS', 'retrograde');
      return;
    }
    if (keybindings.matches(e.code, 'sasRadial')) {
      this._command('setSAS', 'radial');
      return;
    }
    if (keybindings.matches(e.code, 'sasHold')) {
      this._command('setSAS', 'hold');
      return;
    }
    if (keybindings.matches(e.code, 'deployPayload')) {
      this._command('deployPayload');
      return;
    }
    if (keybindings.matches(e.code, 'deployRover')) {
      this._command('deployRover');
      return;
    }
    if (keybindings.matches(e.code, 'deployParachute')) {
      this._command('deployParachute');
      return;
    }
    if (keybindings.matches(e.code, 'jettisonFairing')) {
      this._command('jettisonFairing');
      return;
    }
    if (keybindings.matches(e.code, 'collectSample')) {
      this._command('collectSample');
      return;
    }
    if (keybindings.matches(e.code, 'toggleMap')) {
      this.setMapOpen(!this.mapOpen);
      return;
    }

    switch (e.code) {
      case 'Space':
        this._command('activateNextStage');
        break;

      case 'KeyZ':
        this.throttleTarget = null;
        this._command('setThrottle', 1);
        break;

      case 'KeyX':
        this.throttleTarget = null;
        this._command('setThrottle', 0);
        break;

      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
      case 'Digit4':
        this._command('toggleGroup', Number(e.code.slice(5)));
        break;

      case 'KeyT':
        this._command('setSAS', 'prograde');
        break;

      case 'KeyG':
        this._command('setSAS', 'retrograde');
        break;

      case 'KeyV':
        this._command('setSAS', 'radial');
        break;

      case 'KeyY':
        this._command('setSAS', 'hold');
        break;

      case 'KeyP':
        this._command('deployPayload');
        break;

      case 'KeyF':
        this._command('jettisonFairing');
        break;

      case 'KeyR':
        this._command('deployRover');
        break;

      case 'KeyC':
        this._command('deployParachute');
        break;

      case 'KeyJ':
        this._command('jettisonHeatShield');
        break;

      case 'KeyK':
        this._command('collectSample');
        break;

      case 'KeyL':
        this._command('deployLander');
        break;

      case 'KeyM':
        this.setMapOpen(!this.mapOpen);
        break;

      case 'Period': {
        const current = this.telemetryData?.warp ?? 1;
        const index = WARP_LEVELS.indexOf(current);
        this.warpIdx = Math.min(
          WARP_LEVELS.length - 1,
          Math.max(0, index) + 1
        );

        this._command('setWarp', WARP_LEVELS[this.warpIdx]);
        break;
      }

      case 'Comma': {
        const current = this.telemetryData?.warp ?? 1;
        const index = WARP_LEVELS.indexOf(current);
        this.warpIdx = Math.max(0, index - 1);

        this._command('setWarp', WARP_LEVELS[this.warpIdx]);
        break;
      }

      case 'Escape':
        e.preventDefault();
        this.pause();
        break;
    }
  },

  buildMissionBox() {
    const box = this.el('fl-mission');
    box.innerHTML = '';

    if (!this.mission) {
      box.append(
        h('div', { class: 'mtitle' }, 'Sandbox'),
        h(
          'div',
          { class: 'dim' },
          `${this.body.name}. No objectives: fly anywhere.`
        )
      );
    } else {
      const objectives = this.mission.objectives || [];
      const hasPhases = (this.mission.missionPhases && this.mission.missionPhases.length > 0) || objectives.some(o => o.phase);

      this.phaseHeaderEl = hasPhases
        ? h('div', { class: 'fl-phase-badge', id: 'fl-phase-badge' }, '')
        : null;

      this.objEls = objectives.map((objective, index) =>
        h(
          'div',
          { class: 'obj', 'data-index': index },
          h('i', {}, '○'),
          h('span', { class: 'obj-text' }, objective.label),
          h('span', { class: 'obj-badge' }, '')
        )
      );

      this.showAllObjectives = false;
      this.objToggleBtn = objectives.length > 1
        ? h(
            'button',
            {
              type: 'button',
              class: 'obj-toggle-btn',
              onclick: () => {
                this.showAllObjectives = !this.showAllObjectives;
                this._updateObjectives();
              },
            },
            'View all phases (' + objectives.length + ') ▼'
          )
        : null;

      this.missionActionsEl = h(
        'div',
        { class: 'mission-actions', id: 'fl-mission-actions' },
        h(
          'button',
          {
            type: 'button',
            class: 'action-btn',
            title: 'Deploy parachute (C)',
            onclick: () => this._command('deployParachute'),
          },
          'Parachute'
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'action-btn',
            title: 'Jettison heat shield (J)',
            onclick: () => this._command('jettisonHeatShield'),
          },
          'Heat Shield'
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'action-btn',
            title: 'Collect sample (K)',
            onclick: () => this._command('collectSample'),
          },
          'Sample'
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'action-btn',
            title: 'Deploy lander (L)',
            onclick: () => this._command('deployLander'),
          },
          'Lander'
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'action-btn',
            title: 'Jettison fairing (F)',
            onclick: () => this._command('jettisonFairing'),
          },
          'Fairing'
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'action-btn',
            title: 'Deploy payload (P)',
            onclick: () => this._command('deployPayload'),
          },
          'Payload'
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'action-btn',
            title: 'Deploy rover (R)',
            onclick: () => this._command('deployRover'),
          },
          'Rover'
        )
      );

      box.append(
        h('div', { class: 'mtitle' }, this.mission.title),
        ...(this.phaseHeaderEl ? [this.phaseHeaderEl] : []),
        ...this.objEls,
        ...(this.objToggleBtn ? [this.objToggleBtn] : []),
        this.missionActionsEl
      );
    }

    this.launchSequenceBtn.textContent =
      'Start launch sequence';

    this.launchSequenceBtn.classList.remove('is-abort');

    box.append(this.launchSequenceBtn);
  },

  async pause() {
    if (this.paused || this.ended || !this.client) return;

    this.paused = true;

    const generation = this.gen;

    const pauseResult = await this._command('pause');

    if (!pauseResult || generation !== this.gen) {
      this.paused = false;
      return;
    }

    const dialog = document.getElementById('dialog');
    dialog.classList.add('flight-pause');

    const choice = await ask(
      'Flight paused',
      'Simulation time is stopped. Resume your flight or leave the launch.',
      [
        {
          label: 'Resume flight',
          value: 'resume',
          primary: true,
        },
        { label: 'Restart flight', value: 'restart' },
        { label: 'Back to workshop', value: 'workshop' },
        { label: 'Main menu', value: 'menu' },
      ]
    );

    dialog.classList.remove('flight-pause');

    if (generation !== this.gen) return;

    if (choice === 'restart') {
      await this.start(this.cfg);
      return;
    }

    if (choice === 'workshop' || choice === 'menu') {
      await this.stop();
      bus.emit('nav', choice);
      return;
    }

    const resumeResult = await this._command('resume');

    if (resumeResult) {
      this.paused = false;
      this.last = performance.now();
    }
  },

  async _pollSnapshot() {
    if (!this.client || this.client.closed) return;

    try {
      const snapshot = await this.client.refresh();

      if (!this.running || !snapshot) return;

      this._syncSnapshot(snapshot);
      this._processEvents();
      this._updateObjectives();
      await this.checkEnd();
    } catch (error) {
      if (this.running) {
        toast(`Flight connection error: ${error.message}`, 'bad');
        this.connectionError = true;
      }
    }
  },

  _processEvents() {
    if (!this.client) return;

    for (const event of this.client.drainEvents()) {
      const kind =
        ['crash', 'flameout', 'lost', 'payload-lost', 'impact']
          .includes(event.type)
          ? 'bad'
          : ['touchdown', 'deploy', 'loose-landed']
            .includes(event.type)
            ? 'good'
            : ['warp', 'burnout'].includes(event.type)
              ? 'warn'
              : '';

      if (event.msg) toast(event.msg, kind);
    }
  },

  _updateObjectives() {
    if (!this.mission || !this.objEls) return;

    const objectives = this.objectiveData || [];
    const activePhase = this.currentSnapshot?.activePhase;
    const totalPhases = this.currentSnapshot?.totalPhases;

    if (this.phaseHeaderEl) {
      if (activePhase) {
        const phaseNames = this.mission.missionPhases || [];
        const phaseName = phaseNames[activePhase - 1] || `Phase ${activePhase} of ${totalPhases}`;
        this.phaseHeaderEl.textContent = phaseName;
        this.phaseHeaderEl.hidden = false;
      } else {
        this.phaseHeaderEl.hidden = true;
      }
    }

    if (this.objToggleBtn) {
      this.objToggleBtn.textContent = this.showAllObjectives
        ? 'Hide future phases ▲'
        : 'View all phases (' + objectives.length + ') ▼';
    }
    this.objEls.forEach((element, index) => {
      const objective = objectives[index] || {};
      const met = objective.met === true;
      const locked = objective.locked === true;
      const firstIncomplete = !locked && objectives.findIndex(
        item => item.met !== true && !item.locked
      ) === index;

      element.className =
        'obj' + (met ? ' met' : locked ? ' locked' : firstIncomplete ? ' next' : '');

      if (!this.showAllObjectives) {
        element.hidden = !firstIncomplete && !met;
      } else {
        element.hidden = false;
      }

      const iconEl = element.querySelector('i');
      if (iconEl) {
        iconEl.textContent = met ? '✓' : locked ? '🔒' : '○';
      }

      const badgeEl = element.querySelector('.obj-badge');
      if (badgeEl) {
        if (!met && !locked) {
          if (objective.required && objective.required > 1) {
            badgeEl.textContent = ` (${Math.round(objective.current || 0)}/${objective.required})`;
          } else if (objective.progress && objective.progress > 0) {
            badgeEl.textContent = ` (${Math.round((objective.progress || 0) * 100)}%)`;
          } else {
            badgeEl.textContent = '';
          }
        } else {
          badgeEl.textContent = '';
        }
      }
    });
  },

  frame(t) {
    if (!this.running) return;

    requestAnimationFrame(time => this.frame(time));

    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;

    this._updateInterpolatedState(t);

    if (!this.paused && !this.ended) {
      this._updatePlayerControls(dt);

      
      if (t - this.lastSnapshotTime >= 100) {
        this.lastSnapshotTime = t;
        this._pollSnapshot();
      }
    }

    if (!this.sim || !this.view) return;

    this.view.render(this.sim, this.paused ? 0 : dt);

    const telemetry = this.telemetryData || {};

    const thrust = telemetry.thrust || 0;
    const throttle = telemetry.throttle || 0;
    if (thrust > 0 && throttle > 0) {
      audio.playLoop('engine_loop', { volume: 0.7 });
      audio.setEngineThrottle(throttle);
    } else {
      audio.stopLoop('engine_loop', 0.2);
    }

    if (this.sim?.status === 'landed') {
      const isDriving = (telemetry.surfaceSpeed || 0) > 0.1 || (this.keys.has('KeyA') || this.keys.has('KeyD') || this.keys.has('ArrowLeft') || this.keys.has('ArrowRight'));
      if (isDriving) {
        audio.playLoop('rover_movement', { volume: 0.6 });
      } else {
        audio.stopLoop('rover_movement', 0.2);
      }
    } else {
      audio.stopLoop('rover_movement');
    }

    drawAdi(
      this.el('adi'),
      this.sim,
      telemetry
    );

    const spd = telemetry.speed || 0;
    const alt = telemetry.altitude || 0;
    const isTransonic = spd >= 250 && spd <= 450 && alt < 22000;
    this.root.classList.toggle('transonic-buffet', isTransonic);

    if (t - this.hudT >= 200) {
      this.hudT = t;
      this.hud(t, telemetry);
    }

    if (this.mapOpen && this.map) {
      this.map.draw(this.sim);
    }
  },

  _updatePlayerControls(dt) {
    if (!this.client || !this.sim) return;

    const keys = this.keys;

    const steerRightKey = keybindings.get('steerRight');
    const steerLeftKey = keybindings.get('steerLeft');
    const rotation =
      (keys.has(steerRightKey) || keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
      (keys.has(steerLeftKey) || keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);

    if (rotation !== this.lastRotationSent) {
      this.lastRotationSent = rotation;
      this._command('setRotation', rotation);
    }

    const thrUpKey = keybindings.get('throttleUp');
    const thrDownKey = keybindings.get('throttleDown');
    const throttleDirection =
      (
        keys.has(thrUpKey) ||
        keys.has('KeyW') ||
        keys.has('ArrowUp') ||
        keys.has('ShiftLeft')
          ? 1
          : 0
      ) -
      (
        keys.has(thrDownKey) ||
        keys.has('KeyS') ||
        keys.has('ArrowDown') ||
        keys.has('ControlLeft')
          ? 1
          : 0
      );

    if (throttleDirection === 0) {
      this.throttleTarget = null;
      return;
    }

    
    if (this.throttleTarget == null) {
      this.throttleTarget = this.telemetryData?.throttle ?? 0;
    }

    this.throttleTarget = Math.min(
      1,
      Math.max(0, this.throttleTarget + throttleDirection * dt * 0.6)
    );

    const target = this.throttleTarget;

    const now = performance.now();

    if (
      !this.throttleInFlight &&
      now - this.lastControlTime >= 100 &&
      Math.abs(target - this.lastThrottleSent) >= 0.005
    ) {
      this.lastControlTime = now;
      this.lastThrottleSent = target;
      this.throttleInFlight = true;
      this._command('setThrottle', target).finally(() => {
        this.throttleInFlight = false;
      });
    }
  },

  async checkEnd() {
    if (this._checkingEnd || this._ending || !this.currentSnapshot) {
      return;
    }

    const snapshot = this.currentSnapshot;

   
    const outcome =
      snapshot.outcome ||
      snapshot.missionStatus ||
      snapshot.mission?.status;

    const crashed =
      snapshot.status === 'crashed' ||
      outcome === 'failure';

    const completed =
      outcome === 'complete' ||
      outcome === 'completed' ||
      outcome === 'success' ||
      snapshot.status === 'mission_complete';

    if (!crashed && !completed) return;

    this._checkingEnd = true;
    this.ended = true;

    const generation = this.gen;
    const missionTime = snapshot.missionTime ?? 0;

    if (completed && this.mission) {
      try {
        await api.setProgress(
          this.mission.id,
          true,
          {
            time: missionTime,
            mass: this.launchStats.wetMass,
            cost: this.launchStats.cost,
          }
        );

        state.progress = await api.progress();
      } catch (error) {
        toast(
          'Could not save progress: ' + error.message,
          'bad'
        );
      }
    }

    if (generation !== this.gen) return;

    this._ending = true;

    let dialogBody;
    if (completed) {
      audio.play('mission_success');
      const rewards = this.mission?.rewards;
      const totalReward = rewards
        ? (rewards.baseReward || 0) + (rewards.bonuses || []).reduce((s, b) => s + (b.amount || 0), 0)
        : 0;
      const statsList = [
        h('div', { class: 'ms-budget-row' }, h('span', {}, 'Mission Elapsed Time'), h('b', {}, fmtTime(missionTime))),
        h('div', { class: 'ms-budget-row' }, h('span', {}, 'Launch Wet Mass'), h('b', {}, fmtMass(this.launchStats.wetMass || 0))),
        h('div', { class: 'ms-budget-row' }, h('span', {}, 'Mission Cost'), h('b', {}, fmtMoney(this.launchStats.cost || 0))),
      ];
      if (totalReward > 0) {
        statsList.push(h('div', { class: 'ms-budget-row ms-reward-total' }, h('span', {}, 'Total Rewards Awarded'), h('b', { class: 'ms-reward-val' }, fmtMoney(totalReward))));
      }
      const debriefNodes = [
        h('div', { class: 'fl-debrief-lead' }, `${this.mission?.title || 'Flight'}: All mission objectives successfully accomplished!`),
        h('div', { class: 'ms-budget' }, ...statsList),
      ];
      if (rewards?.scientificData?.length) {
        debriefNodes.push(
          h('div', { class: 'sec', style: 'margin-top:10px;font-weight:650;color:#7ee6f5;font-size:12px;text-transform:uppercase' }, 'Scientific Data Awarded'),
          h('ul', { class: 'ms-science-list', style: 'margin:4px 0 0 0;padding:0;list-style:none' },
            ...rewards.scientificData.map(d => h('li', { style: 'font-size:12px;color:#9fcab4;padding:3px 0' }, '\u2b21 ' + d))
          )
        );
      }
      dialogBody = h('div', { class: 'fl-debrief' }, ...debriefNodes);
    } else {
      audio.play('mission_failure');
      const crashMsg = snapshot.renderState?.crashMessage ||
        (snapshot.status === 'crashed' ? 'Vehicle crashed into terrain.' : 'Vehicle was lost during flight.');
      dialogBody = h('div', { class: 'fl-debrief fl-loss' },
        h('div', { class: 'fl-debrief-lead' }, crashMsg),
        h('div', { class: 'ms-budget' },
          h('div', { class: 'ms-budget-row' }, h('span', {}, 'Time of Loss'), h('b', {}, fmtTime(missionTime))),
          h('div', { class: 'ms-budget-row' }, h('span', {}, 'Flight Status'), h('b', { style: 'color:#ff4d4d' }, (snapshot.status || 'lost').toUpperCase()))
        )
      );
    }

    const choice = await ask(
      completed ? 'Mission complete' : 'Vehicle lost',
      dialogBody,
      [
        {
          label: completed ? 'Continue flying' : 'Restart flight',
          value: completed ? 'continue' : 'restart',
          primary: true,
        },
        { label: 'Back to workshop', value: 'workshop' },
        ...(this.mission
          ? [{ label: 'Missions', value: 'missions' }]
          : []),
        { label: 'Main menu', value: 'menu' },
      ]
    );

    if (generation !== this.gen) return;

    this._ending = false;
    this._checkingEnd = false;

    if (choice === 'continue' && completed) {
      this.mission = null;
      this.ended = false;
      this.buildMissionBox();
      return;
    }

    if (choice === 'workshop' || choice === 'missions' || choice === 'menu') {
      await this.stop();
      bus.emit('nav', choice);
      return;
    }

    await this.start(this.cfg);
  },

  hud(t, telemetry) {
    const E = id => this.el(id);

    const set = (id, value) => {
      const element = E(id);
      if (element && element.textContent !== String(value)) {
        element.textContent = String(value);
      }
    };

    const missionTime = this.sim?.t ?? 0;

    set(
      'fl-clock',
      fmtClock(
        this.flightEpoch === null
          ? 0
          : missionTime - this.flightEpoch
      )
    );

    set('r-alt', fmtDist(telemetry.alt ?? 0));
    set('r-spd', fmtSpeed(telemetry.speed ?? 0));

    const heatRow = E('r-heat-row');
    if (heatRow) {
      const temp = telemetry.temperature;
      const heatFlux = telemetry.heatFlux || 0;
      const entryActive = telemetry.entryHeating || heatFlux > 1000 || (temp && temp > 350);
      heatRow.hidden = !entryActive;
      if (entryActive && temp != null) {
        set('r-heat', `${Math.round(temp)} K (${Math.round(temp - 273.15)} °C)`);
        const heatEl = this.el('r-heat');
        if (heatEl) {
          heatEl.style.color = temp > 1500 ? '#ff4d4d' : temp > 800 ? '#ff9900' : '#ffcc00';
        }
      }
    }

    set('r-body', this.body?.name ?? '—');

    const soiRadius = telemetry.soiRadius;
    E('r-soi-wrap').hidden = !soiRadius;
    if (soiRadius) {
      const distance = (telemetry.alt ?? 0) + this.body.R;
      set(
        'r-soi',
        telemetry.timeToSoiExit == null ? '—' : fmtTime(telemetry.timeToSoiExit)
      );
      E('r-soibar').style.width =
        `${Math.min(100, (distance / soiRadius) * 100)}%`;
    }

    const approach = this.nodePreview?.closestApproach || this.prediction?.closestApproach;
    E('r-ca-row').hidden = !approach;
    if (approach) {
      const name = state.catalog.body(approach.bodyId)?.name ?? approach.bodyId;
      set('r-ca', `${name} ${fmtDist(approach.distance)} in ${fmtTime(approach.time)}`);
    }

    set(
      'r-vert',
      (telemetry.vert >= 0 ? '+' : '') +
      fmtSpeed(telemetry.vert ?? 0)
    );

    set('r-hor', fmtSpeed(telemetry.horiz ?? 0));

    const ground = [
      'prelaunch',
      'landed',
      'crashed',
    ].includes(telemetry.status);

    set(
      'r-apo',
      ground
        ? '—'
        : !telemetry.bound
          ? 'Escape'
          : fmtDist(telemetry.apo)
    );

    set(
      'r-per',
      ground
        ? '—'
        : telemetry.peri < 0
          ? 'Suborbital'
          : fmtDist(telemetry.peri)
    );

    E('r-per').classList.toggle(
      'amber',
      !ground && telemetry.peri < 0
    );

    set(
      'r-tta',
      ground || !telemetry.bound
        ? '—'
        : fmtTime(telemetry.tToApo)
    );

    const fuel = telemetry.fuel ?? 0;
    const fuelCapacity = telemetry.fuelCap || 1;
    const fuelPercent = Math.min(
      100,
      Math.max(0, 100 * fuel / fuelCapacity)
    );

    set(
      'r-fuel',
      `${Math.round(fuelPercent)}%  ·  ${fmtMass(fuel)}`
    );

    E('r-fuelbar').style.width = `${fuelPercent}%`;

    this.dv = telemetry.deltaV ?? this.dv ?? 0;
    set('r-dv', fmtSpeed(this.dv));

    set(
      'r-twr',
      telemetry.twr > 0 ? telemetry.twr.toFixed(2) : '—'
    );

    set(
      'r-thr',
      telemetry.thrust > 0
        ? fmtForce(telemetry.thrust)
        : '—'
    );

    set('r-mass', fmtMass(telemetry.mass ?? 0));

    const throttle = telemetry.throttle ?? 0;

    E('fl-thr').style.height = `${throttle * 100}%`;
    set('fl-thr-txt', `${Math.round(throttle * 100)}%`);

    const tags = E('fl-tags');

    const status = {
      prelaunch: 'On pad',
      landed: 'Landed',
      crashed: 'Crashed',
      flying: '',
    }[telemetry.status] || '';

    const wanted = [
      ...(telemetry.warp > 1
        ? [{
            text: `Warp ${telemetry.warp}×${telemetry.rails ? ' rails' : ''}`,
            className: 'warn',
          }]
        : []),

      ...(telemetry.sas
        ? [{
            text: 'SAS ' + telemetry.sas,
            className: 'on',
          }]
        : []),

      ...(status
        ? [{
            text: status,
            className: `status state-${telemetry.status}`,
          }]
        : []),
    ];

    const signature = wanted
      .map(item => `${item.text}|${item.className}`)
      .join();

    if (tags._sig !== signature) {
      tags._sig = signature;
      tags.innerHTML = '';

      wanted.forEach(item => {
        tags.append(
          h('span', {
            class: 'tag ' + item.className,
          }, item.text)
        );
      });
    }

    this.stageList(this.sim);
    this.prompt(this.sim, telemetry);
    this._updateObjectives();
  },

  stageList(sim) {
    if (!sim) return;

    const box = this.el('fl-stages');

    const stageNumbers = [
      ...new Set(
        sim.parts
          .filter(part => part.stage > 0)
          .map(part => part.stage)
      ),
    ].sort((a, b) => a - b);

    const nextStage = stageNumbers.find(
      number => number > sim.stageDone
    );

    const controls = sim.parts.filter(part =>
      part.alive &&
      (
        part.def.separator ||
        part.def.engine ||
        part.def.parachute ||
        part.def.power?.deployable ||
        part.def.landing ||
        part.def.wheel
      )
    );

    const signature =
      stageNumbers.join() +
      '|' + sim.stageDone +
      '|' +
      sim.parts.map(part =>
        [
          part.alive ? 1 : 0,
          part.ignited ? 1 : 0,
          part.spent ? 1 : 0,
          part.deployed ? 1 : 0,
          part.armed ? 1 : 0,
        ].join('')
      ).join('') +
      '|' +
      controls.map(part => part.uid).join();

    if (box._sig === signature) return;

    box._sig = signature;
    box.innerHTML = '';

    for (const number of stageNumbers.slice().reverse()) {
      const stageParts = sim.parts.filter(
        part => part.stage === number
      );

      const element = h(
        'div',
        {
          class:
            'stg' +
            (
              number === nextStage
                ? ' next'
                : number <= sim.stageDone
                  ? ' done'
                  : ''
            ),
        },
        h(
          'div',
          { class: 'row' },
          h(
            'b',
            { class: number === nextStage ? 'amber' : '' },
            number === nextStage ? 'NEXT ACTION' : number <= sim.stageDone ? 'RELEASED' : 'STAGED'
          ),
          h(
            'span',
            { class: 'l' },
            number === nextStage
              ? 'Space'
              : number <= sim.stageDone
                ? 'fired'
                : ''
          )
        )
      );

      for (const part of stageParts) {
        element.append(
          h(
            'div',
            { class: 'eng' },
            part.def.engine
              ? h(
                  'span',
                  {
                        class:
                      'dot' +
                      (
                        part.alive && part.firing
                          ? ' on'
                          : part.spent
                            ? ' out'
                            : ''
                      ),
                  }
                )
              : h('span', { class: 'dot' }),

            part.def.name.replace(/\(pair\)/, '') +
            (part.group ? `  · G${part.group}` : '')
          )
        );
      }

      box.append(element);
    }

    if (!stageNumbers.length) {
      box.append(
        h('div', { class: 'stg dim' }, 'No stages configured')
      );
    }

    if (controls.length) {
      const panel = h(
        'div',
        { class: 'stg component-controls' },
        h(
          'div',
          { class: 'row' },
          h('b', {}, 'Components'),
          h('span', { class: 'l' }, 'Manual')
        )
      );

      for (const part of controls) {
          const label = part.def.separator
          ? 'Separate'
          : part.def.engine
            ? (part.firing ? 'Shut down' : 'Ignite')
            : part.def.parachute
              ? (part.armed ? 'Armed' : 'Arm')
              : part.deployed
                ? 'Retract'
                : 'Deploy';

        const button = h(
          'button',
          {
            type: 'button',
            class: 'component-action',
            disabled: part.def.parachute && part.armed,
            onclick: async () => {
              await this._command('activatePart', part.uid);
            },
          },
          label
        );

        panel.append(
          h(
            'div',
            { class: 'row component-row' },
            h('span', {}, part.def.name),
            button
          )
        );
      }

      box.append(panel);
    }
  },

  prompt(sim, telemetry) {
    if (!sim) return;

    const prompt = this.el('fl-prompt');
    const countdown = this.el('fl-countdown');

    let message = '';

    const ready =
      sim.status === 'prelaunch' &&
      this.cfg.start.type === 'pad';

    this.launchSequenceBtn.hidden = !ready;
    this.root.classList.toggle('prelaunch', ready);

    if (this.launchCountdown) {
      const remaining =
        this.launchCountdown.remaining ??
        this.launchCountdown.remainingSeconds ??
        0;

      const count = Math.ceil(remaining);

      const label = count > 1 ? `T − ${count}` : count === 1 ? 'ENGINE START' : 'LIFTOFF';
      if (countdown.textContent !== label) {
        countdown.textContent = label;
        countdown.className = 'countdown ' + (count > 1 ? 't-minus' : count === 1 ? 'engine-start' : 'liftoff');
        if (count === 1) this.view?.addTrauma(0.35);
        if (count === 0) this.view?.addTrauma(0.75);
      }
      countdown.hidden = false;
      this.root.classList.add('countdown-active');
    } else {
      countdown.hidden = true;
      this.root.classList.remove('countdown-active');

      if (sim.status === 'prelaunch') {
        message = 'Press Space or click "Start launch sequence" to lift off.';
      }
    }

    const activeEngine = sim.engines.some(
      engine => engine.alive && engine.ignited && !engine.spent
    );

    if (
      !this.launchCountdown &&
      sim.stagesFired > 0 &&
      telemetry.thrust === 0 &&
      !activeEngine &&
      sim.status === 'flying' &&
      sim.parts.some(
        part => part.alive && part.stage > sim.stageDone
      )
    ) {
      message = 'No engine is firing. Activate the next stage from the stage controls.';
    }

    if (prompt.textContent !== message) {
      prompt.textContent = message;
    }

    prompt.hidden = !message;
  },
};