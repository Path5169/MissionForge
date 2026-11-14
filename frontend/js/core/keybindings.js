const STORAGE_KEY = 'missionforge.keybindings';

export const DEFAULT_KEYBINDINGS = {
  stage: { code: 'Space', label: 'Stage / Ignite', group: 'Flight' },
  throttleUp: { code: 'KeyW', label: 'Throttle Up', group: 'Propulsion' },
  throttleDown: { code: 'KeyS', label: 'Throttle Down', group: 'Propulsion' },
  throttleMax: { code: 'KeyZ', label: 'Full Throttle (100%)', group: 'Propulsion' },
  throttleCut: { code: 'KeyX', label: 'Cut Engine (0%)', group: 'Propulsion' },
  steerLeft: { code: 'KeyA', label: 'Rotate Left (CCW)', group: 'Attitude' },
  steerRight: { code: 'KeyD', label: 'Rotate Right (CW)', group: 'Attitude' },
  sasPrograde: { code: 'KeyT', label: 'SAS Prograde', group: 'Autopilot' },
  sasRetrograde: { code: 'KeyG', label: 'SAS Retrograde', group: 'Autopilot' },
  sasRadial: { code: 'KeyV', label: 'SAS Radial Out', group: 'Autopilot' },
  sasHold: { code: 'KeyY', label: 'SAS Stability Hold', group: 'Autopilot' },
  deployPayload: { code: 'KeyP', label: 'Deploy Payload', group: 'Equipment' },
  deployRover: { code: 'KeyR', label: 'Deploy Rover', group: 'Equipment' },
  deployParachute: { code: 'KeyC', label: 'Deploy Parachute', group: 'Equipment' },
  jettisonFairing: { code: 'KeyF', label: 'Jettison Fairing', group: 'Equipment' },
  collectSample: { code: 'KeyK', label: 'Collect Science Sample', group: 'Equipment' },
  toggleMap: { code: 'KeyM', label: 'Toggle Orbital Map', group: 'Navigation' },
  warpFaster: { code: 'Period', label: 'Time Warp Faster', group: 'Navigation' },
  warpSlower: { code: 'Comma', label: 'Time Warp Slower', group: 'Navigation' },
};

class KeybindingsManager {
  constructor() {
    this.bindings = {};
    this.load();
  }

  load() {
    this.bindings = {};
    for (const [action, def] of Object.entries(DEFAULT_KEYBINDINGS)) {
      this.bindings[action] = def.code;
    }

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        for (const [action, code] of Object.entries(parsed)) {
          if (this.bindings[action] && typeof code === 'string') {
            this.bindings[action] = code;
          }
        }
      }
    } catch { }
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.bindings));
    } catch { }
  }

  get(action) {
    return this.bindings[action] || DEFAULT_KEYBINDINGS[action]?.code || '';
  }

  set(action, code) {
    if (!DEFAULT_KEYBINDINGS[action] || !code) return;
    this.bindings[action] = code;
    this.save();
  }

  matches(eventCode, action) {
    const bound = this.get(action);
    return eventCode === bound;
  }

  resetDefaults() {
    for (const [action, def] of Object.entries(DEFAULT_KEYBINDINGS)) {
      this.bindings[action] = def.code;
    }
    this.save();
  }

  getAll() {
    const result = [];
    for (const [action, def] of Object.entries(DEFAULT_KEYBINDINGS)) {
      result.push({
        action,
        label: def.label,
        group: def.group,
        code: this.get(action),
        formatted: this.formatKey(this.get(action)),
      });
    }
    return result;
  }

  formatKey(code) {
    if (!code) return 'NONE';
    if (code.startsWith('Key')) return code.slice(3).toUpperCase();
    if (code.startsWith('Digit')) return code.slice(5);
    if (code === 'Space') return 'SPACE';
    if (code === 'Period') return '.';
    if (code === 'Comma') return ',';
    if (code === 'ArrowUp') return '↑';
    if (code === 'ArrowDown') return '↓';
    if (code === 'ArrowLeft') return '←';
    if (code === 'ArrowRight') return '→';
    if (code === 'ShiftLeft' || code === 'ShiftRight') return 'SHIFT';
    if (code === 'ControlLeft' || code === 'ControlRight') return 'CTRL';
    if (code === 'AltLeft' || code === 'AltRight') return 'ALT';
    if (code === 'Enter') return 'ENTER';
    if (code === 'Escape') return 'ESC';
    if (code === 'Tab') return 'TAB';
    if (code === 'Backspace') return '⌫';
    return code.toUpperCase();
  }
}

export const keybindings = new KeybindingsManager();
