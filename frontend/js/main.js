import { state, loadAll } from './core/store.js';
import { api } from './core/api.js';
import { bus, h, toast } from './core/bus.js';
import { assets } from './rendering/assets.js';
import { audio } from './core/audio.js';
import { menu } from '../ui/menu/menu.js';
import { workshop } from '../ui/workshop/workshop.js';
import { payloadWorkshop } from '../ui/payload/payload.js';
import { missions } from '../ui/missions/missions.js';
import { openSettings } from '../ui/settings/settings.js';

const views = { menu, workshop, payloadWorkshop, missions };
let current = null;
const root = n => document.getElementById('view-' + n);
const VIEW_NAMES = ['menu', 'facility', 'workshop', 'payloadWorkshop', 'missions', 'flight', 'solar'];

async function loadView(name) {
  if (views[name]) return;
  if (name === 'facility') {
    const module = await import('./facility/FacilityView.js');
    views.facility = module.facilityView;
    views.facility.mount(root(name));
    return;
  }
  if (name === 'flight') {
    const module = await import('../ui/flight/flight.js');
    views.flight = module.flightScreen;
    views.flight.mount(root(name));
    return;
  }
  if (name === 'solar') {
    const module = await import('../ui/solar/solar.js');
    views.solar = module.solar;
    views.solar.mount(root(name));
    return;
  }
  throw new Error(`Unknown MissionForge screen: ${name}`);
}

async function go(name, arg) {
  await loadView(name);
  if (current) {
    views[current].hide?.();
    if (current === 'flight') views.flight.stop();
  }
  for (const n of VIEW_NAMES) root(n).hidden = n !== name;
  current = name;
  if (name === 'flight') {
    await views.flight.start(arg);
  } else {
    views[name].show?.();
  }
  window.MF.view = name;
}

async function boot() {
  window.MF = { state, views, go, workshop, audio, assets, view: null };
  try {
    await loadAll();
  } catch (e) {
    document.body.append(h('pre', { style: 'padding:30px;color:#ff5c4d' }, 'MissionForge could not load its data.\n' + e.message));
    throw e;
  }
  try {
    await assets.discoverPartImages();
  } catch { }

  try {
    const manifest = await api.assets();
    assets.init(manifest);
    if (manifest?.audio) {
      await audio.init(manifest.audio);
    }
  } catch { }

  audio.setupUIHooks();

  for (const n of Object.keys(views)) views[n].mount(root(n));
  bus.on('nav', (n, arg) => go(n, arg).catch(e => {
    console.error(`Could not open the ${n} screen.`, e);
    toast(`Could not open ${n}: ${e.message}`, 'bad', 6000);
  }));
  bus.on('settings', openSettings);
  window.addEventListener('error', e => toast('Error: ' + e.message, 'bad', 6000));
  window.addEventListener('unhandledrejection', e => toast('Error: ' + (e.reason?.message || e.reason), 'bad', 6000));
  await go('menu');
}

boot();
