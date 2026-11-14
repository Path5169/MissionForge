//idgaf its very complex 
import { api, getJSON } from './api.js';
import { Catalog, newBlueprint, migrate } from '../vehicle/vehicle.js';

export const state = {
  catalog: null, presets: [], missions: [], solar: null, progress: {}, settings: { quality: 'high', reduceMotion: false },
  blueprint: null, mode: 'workshop', missionId: null, online: false,
};
export async function loadAll()
 {
  try {
    const cached = localStorage.getItem('missionforge.settings');
    if (cached) Object.assign(state.settings, JSON.parse(cached));
  } catch { }
  const [comps, catalogue, bodies, missions, presets, solar] = await Promise.all([
    getJSON('/data/components/components.json'), getJSON('/data/parts/index.json'), getJSON('/data/planets/bodies.json'),
    getJSON('/data/missions/missions.json'), getJSON('/data/vehicles/presets.json'), getJSON('/data/planets/solar.json')]);
  const partDefs = await Promise.all(catalogue.parts.map(async item => {
    const [def, behavior] = await Promise.all([getJSON(item.definition), getJSON(item.behavior)]);
    def.role = behavior.role; def.behaviorProfile = behavior;
    return def;
  }));
  comps.categoryOrder = catalogue.categoryOrder;
  comps.components.push(...partDefs);
  state.catalog = new Catalog(comps, bodies); state.missions = missions.missions; state.presets = presets.presets; state.solar = solar;
    try {
    const over = await getJSON('/data/missions/budget.json');
    for (const m of state.missions) {
      const o = over.missions?.[m.id]; if (!o) continue;
      m.budget = o.budget;
      if (m.rewards && o.rewards) {
        m.rewards.baseReward = o.rewards.baseReward;
        for (const b of m.rewards.bonuses || []) { const n = o.rewards.bonuses.find(x => x.id === b.id); if (n) b.amount = n.amount; }
        delete m.rewards.notes;
      }
    }
  } catch (e) { console.warn('budgets.json not applied', e); }
  try { await api.health(); state.online = true; state.progress = await api.progress(); Object.assign(state.settings, await api.settings()); } catch { state.online = false; }
  const last = state.settings.lastBlueprint;
  if (last) { try { const r = await api.getBlueprint(last); state.blueprint = await migrate(r.blueprint); } catch { } }
  if (!state.blueprint) {
    try { state.blueprint = (await loadPreset('capsule_orbiter')) || (await loadPreset('orbiter_one')); } catch { }
  }
  if (!state.blueprint) state.blueprint = newBlueprint();
}
export const loadPreset = async id => { const p = state.presets.find(x => x.id === id); return p ? migrate(structuredClone(p)) : null; };
export const mission = id => state.missions.find(m => m.id === id);