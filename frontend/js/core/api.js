async function call(method, url, body) {
  let res;

  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new Error('Cannot reach the MissionForge server. Is it still running?');
  }

  if (!res.ok) {
    let d = '';

    try {
      const j = await res.json();
      d = typeof j.detail === 'string'
        ? j.detail
        : JSON.stringify(j.detail?.[0]?.msg || j.detail);
    } catch {}

    throw new Error(d || `Server returned ${res.status}`);
  }

  return res.json();
}

export const api = {
  health: () => call('GET', '/api/health'),

  listBlueprints: () => call('GET', '/api/blueprints'),
  getBlueprint: id => call('GET', `/api/blueprints/${id}`),
  saveBlueprint: (id, bp) => call('PUT', `/api/blueprints/${id}`, bp),
  deleteBlueprint: id => call('DELETE', `/api/blueprints/${id}`),

  progress: () => call('GET', '/api/progress'),
  setProgress: (id, completed, stats) =>
    call('PUT', `/api/progress/${id}`, { completed, stats }),

  settings: () => call('GET', '/api/settings'),
  putSettings: s => call('PUT', '/api/settings', s),

  assets: () => call('GET', '/api/assets'),

  vehicleStats: (blueprint, bodyId = 'earth', missionId = null) =>
    call('POST', '/api/vehicle/stats', { blueprint, bodyId, missionId }),

  vehicleAddPart: (blueprint, partId, anchor, mount = 'below', dir = 0) =>
    call('POST', '/api/vehicle/add-part', { blueprint, partId, anchor, mount, dir }),

  vehicleAddLoosePart: (blueprint, partId, x, y, options = {}) =>
    call('POST', '/api/vehicle/add-loose-part', { blueprint, partId, x, y, ...options }),

  vehicleRemovePart: (blueprint, uid) =>
    call('POST', '/api/vehicle/remove-part', { blueprint, uid }),

  vehicleCheckTargets: (blueprint, partId, targets) =>
    call('POST', '/api/vehicle/check-targets', { blueprint, partId, targets }),

  vehicleAttachTargets: (blueprint, partId, sym = true) =>
    call('POST', '/api/vehicle/attach-targets', { blueprint, partId, sym }),

  vehicleValidate: blueprint =>
    call('POST', '/api/vehicle/validate', { blueprint }),

  vehicleAutoStage: blueprint =>
    call('POST', '/api/vehicle/auto-stage', { blueprint }),

  vehicleSetStage: (blueprint, uid, value) =>
    call('POST', '/api/vehicle/set-stage', { blueprint, uid, value }),

  vehicleSetGroup: (blueprint, uid, value) =>
    call('POST', '/api/vehicle/set-group', { blueprint, uid, value }),

  vehicleConnections: blueprint =>
    call('POST', '/api/vehicle/connections', { blueprint }),

  flightIntegrate: payload =>
    call('POST', '/api/flight/integrate', payload),

  startFlight: payload =>
    call('POST', '/api/flight/start', payload),

  getFlightSnapshot: sessionId =>
    call('GET', `/api/flight/${encodeURIComponent(sessionId)}/snapshot`),

  sendFlightCommand: (sessionId, command, payload = {}) =>
    call('POST', `/api/flight/${encodeURIComponent(sessionId)}/command`, {
      command,
      ...payload,
    }),

  closeFlight: sessionId =>
    call('POST', `/api/flight/${encodeURIComponent(sessionId)}/close`, {}),

    predictFlight: (sessionId, options = {}) =>
    call('POST', `/api/flight/${encodeURIComponent(sessionId)}/predict`, options),
    
  orbitElements: state =>
    call('POST', '/api/orbit/elements', state),

  orbitPropagate: state =>
    call('POST', '/api/orbit/propagate', state),

  orbitConic: (elements, count = 240, maxRadius = Infinity) =>
    call('POST', '/api/orbit/conic', {
      elements,
      count,
      ...(Number.isFinite(maxRadius) ? { maxRadius } : {}),
    }),

  ephemerisPosition: (body, time, mu) =>
    call('POST', '/api/ephemeris/position', { body, time, mu }),

  ephemerisPath: (body, count = 240) =>
    call('POST', '/api/ephemeris/path', { body, count }),

  ephemerisPeriod: (body, mu) =>
    call('POST', '/api/ephemeris/period', { body, mu }),

  ephemerisSnapshot: (bodies, time) =>
    call('POST', '/api/ephemeris/snapshot', { bodies, time }),
};

export const getJSON = async url => {
  const r = await fetch(url);

  if (!r.ok) {
    throw new Error(`Failed to load ${url} (${r.status})`);
  }

  return r.json();
};