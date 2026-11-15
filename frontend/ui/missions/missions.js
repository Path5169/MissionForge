import { state, mission as missionById, loadPreset } from '../../js/core/store.js';
import { h, bus, toast } from '../../js/core/bus.js';
import { fmtDist, fmtMoney, fmtMoneyShort, fmtTime, fmtMass } from '../shared/format.js';
import { missionBudget } from '../../js/core/economy.js';

const pips = n => h('span', { class: 'dots' }, h('span', { class: 'on' }, '●'.repeat(n)), '○'.repeat(5 - n));

const CAPABILITY_LABELS = {
  'Multi-stage rocket with staging separation': 'Multi-stage launch',
  'Earth orbit with periapsis above 150 km': 'Orbital mechanics',
  'Translunar injection burn': 'Translunar injection',
  'Lunar orbit capture': 'Lunar orbit insertion',
  'Dedicated lander with landing legs': 'Lunar lander',
  'Soft landing at under 8 m/s': 'Precision landing',
  'Interplanetary transfer to Mars': 'Mars transfer',
  'Interplanetary transfer': 'Interplanetary transfer',
  'Mars atmospheric entry': 'Atmospheric entry',
  'Parachute': 'Parachute deployment',
};

function statusBadge(st) {
  if (st === 'Completed') return h('span', { class: 'st green' }, st);
  if (st === 'Compulsory') return h('span', { class: 'st cyan' }, 'Compulsory');
  if (st === 'Ready') return h('span', { class: 'st cyan' }, st);
  return h('span', { class: 'st faint' }, st);
}

function nasaBadge(nasaRef) {
  if (!nasaRef) return null;
  return h('div', { class: 'ms-nasa-badge' }, '🛸 ' + nasaRef);
}

function budgetBreakdown(budget) {
  if (!budget) return null;
  const rows = [
    ['Total mission budget', budget.total],
    ['Construction allowance', budget.construction],
    ['Fuel allocation', budget.fuel],
    ['Operations', budget.operations],
    ['Contingency reserve', budget.contingency],
  ];
  if (budget.payload) rows.splice(2, 0, ['Payload allocation', budget.payload]);
  if (budget.specialEquipment) rows.splice(-1, 0, ['Special equipment', budget.specialEquipment]);
  return h('div', { class: 'ms-budget' },
    ...rows.map(([label, value]) =>
      h('div', { class: 'ms-budget-row' },
        h('span', {}, label),
        h('b', {}, fmtMoneyShort(value))
      )
    )
  );
}

function rewardBreakdown(rewards) {
  if (!rewards) return null;
  const items = [
    h('div', { class: 'ms-budget-row' }, h('span', {}, 'Base mission reward'), h('b', { class: 'ms-reward-val' }, fmtMoneyShort(rewards.baseReward))),
    ...(rewards.bonuses || []).map(b =>
      h('div', { class: 'ms-budget-row ms-bonus-row' },
        h('span', {}, '+ ' + b.label),
        h('b', { class: 'ms-reward-val' }, fmtMoneyShort(b.amount))
      )
    ),
  ];
  const total = rewards.baseReward + (rewards.bonuses || []).reduce((s, b) => s + b.amount, 0);
  items.push(h('div', { class: 'ms-budget-row ms-reward-total' }, h('span', {}, 'Maximum potential reward'), h('b', { class: 'ms-reward-val' }, fmtMoneyShort(total))));
  return h('div', { class: 'ms-budget ms-rewards' }, ...items);
}

function scienceData(rewards) {
  if (!rewards?.scientificData?.length) return null;
  return h('ul', { class: 'ms-science-list' },
    ...rewards.scientificData.map(d => h('li', {}, d))
  );
}

function capabilityGaps(m) {
  if (!m.capabilityGaps?.length) return null;
  return h('div', { class: 'ms-gap-list' },
    ...m.capabilityGaps.map(g => h('div', { class: 'ms-gap-item' }, h('span', { class: 'ms-gap-icon' }, '⚙'), g))
  );
}

function passCriteriaList(criteria) {
  if (!criteria?.length) return null;
  return h('ul', { class: 'ms-pass-list' },
    ...criteria.map(c => h('li', { class: 'ms-pass-item' }, h('span', { class: 'ms-check-icon' }, '✓'), c))
  );
}

function failCriteriaList(criteria) {
  if (!criteria?.length) return null;
  return h('ul', { class: 'ms-fail-list' },
    ...criteria.map(c => h('li', { class: 'ms-fail-item' }, h('span', { class: 'ms-fail-icon' }, '✕'), c))
  );
}

function programUnlocks(rewards) {
  if (!rewards?.certifications?.length && !rewards?.unlockedParts?.length) return null;
  return h('div', { class: 'ms-unlocks-list' },
    ...(rewards.certifications || []).map(c => h('div', { class: 'ms-unlock-pill' }, '🏅 ' + c)),
    ...(rewards.unlockedParts || []).map(p => h('div', { class: 'ms-unlock-pill ms-rover-pill' }, '🚀 ' + p))
  );
}

function missionPhases(m) {
  if (!m.missionPhases?.length) return null;
  return h('ol', { class: 'ms-phases' },
    ...m.missionPhases.map(ph => {
      const colonIdx = ph.indexOf(':');
      if (colonIdx > 0) {
        return h('li', {}, h('b', {}, ph.slice(0, colonIdx + 1)), ph.slice(colonIdx + 1));
      }
      return h('li', {}, ph);
    })
  );
}

export const missions = {
  sel: null,
  mount(root) { this.root = root; },
  show() {
    const root = this.root, keepScroll = root.querySelector('.ms-list')?.scrollTop || 0;
    root.innerHTML = '';
    this.sel = this.sel || (state.missions.find(m => m.status !== 'locked') || state.missions[0]).id;
    const done = state.missions.filter(m => state.progress[m.id]?.completed).length;
    const unlocked = state.missions.filter(m => m.status !== 'locked').length;
    const lockedCount = state.missions.length - unlocked;
    const list = h('div', { class: 'ms-list' },
      h('h2', {}, 'Missions'),
      h('div', { class: 'sub' },
        unlocked ? `${done} of ${unlocked} available missions completed.${lockedCount > 0 ? ` ${lockedCount} more are locked.` : ''}` : `${state.missions.length} NASA missions. All are locked — use Sandbox to fly in the meantime.`
      ),
      ...state.missions.map((m, i) => {
        const p = state.progress[m.id];
        const isLocked = m.status === 'locked';
        const st = isLocked ? 'Locked' : p?.completed ? 'Completed' : m.compulsory ? 'Compulsory' : 'Ready';
        const hasNasa = !!m.nasaRef;
        return h('button', {
          class: 'mrow' + (m.id === this.sel ? ' on' : '') + (isLocked ? ' locked' : '') + (hasNasa ? ' nasa' : ''),
          onclick: () => { this.sel = m.id; this.show(); }
        },
          h('span', { class: 'n' }, String(i + 1).padStart(2, '0')),
          h('span', { class: 't' }, m.title),
          statusBadge(st)
        );
      })
    );
    root.append(list, this.detail(), h('button', { class: 'btn ms-back', onclick: () => bus.emit('nav', 'menu') }, '← Main menu'));
    list.scrollTop = keepScroll;
  },
  detail() {
    const m = missionById(this.sel);
    const p = state.progress[m.id];
    const isNasa = !!m.nasaRef;
    const d = h('div', { class: 'ms-detail' + (isNasa ? ' nasa-mission' : '') });

    d.append(h('h2', {}, m.title));
    if (m.compulsory) {
      d.append(h('div', { class: 'ms-compulsory-badge', style: 'display:inline-block; margin-bottom:8px; padding:3px 10px; border-radius:4px; font-size:12px; font-weight:bold; letter-spacing:0.06em; text-transform:uppercase; background:rgba(0,217,255,0.12); color:#00d9ff; border:1px solid rgba(0,217,255,0.35);' }, '★ Mission 01 · Compulsory Spaceflight Qualification'));
    }
    if (isNasa) d.append(nasaBadge(m.nasaRef));
    d.append(h('div', { class: 'pips', 'aria-label': `Difficulty ${m.difficulty} of 5` }, 'Difficulty ', pips(m.difficulty)));
    d.append(h('p', {}, m.text));

    if (m.historicalBackground) {
      d.append(h('div', { class: 'sec' }, 'Historical background'));
      d.append(h('p', { class: 'ms-history' }, m.historicalBackground));
    }

    if (m.scientificObjective) {
      d.append(h('div', { class: 'sec' }, 'Scientific objective'));
      d.append(h('p', { class: 'ms-sci-obj' }, m.scientificObjective));
    }

    if (m.destination) {
      d.append(h('div', { class: 'sec' }, 'Destination'));
      d.append(h('div', { class: 'ms-destination' }, '📍 ' + m.destination));
    }

    const budget = missionBudget(m);
    if (budget) {
      d.append(h('div', { class: 'sec' }, 'Mission budget · USD'));
      d.append(budgetBreakdown(budget));
      d.append(h('p', { class: 'ms-budget-note' }, budget.basis || 'Planning allocations are game-economy estimates. Actual fuel and operating costs depend on the vehicle and flight profile chosen.'));
    }

    if (m.status === 'locked') {
      d.append(h('div', { class: 'sec' }, 'Why it is locked'));
      d.append(h('div', { class: 'lock' }, m.lockReason));
      if (m.capabilityGaps?.length) {
        d.append(h('div', { class: 'sec' }, 'Missing capabilities'));
        d.append(capabilityGaps(m));
      }
      if (m.missionPhases?.length) {
        d.append(h('div', { class: 'sec' }, 'Mission phases'));
        d.append(missionPhases(m));
      }
      if (m.rewards) {
        d.append(h('div', { class: 'sec' }, 'Completion rewards (when unlocked)'));
        d.append(rewardBreakdown(m.rewards));
        if (m.rewards.scientificData?.length) {
          d.append(h('div', { class: 'sec' }, 'Scientific data awarded'));
          d.append(scienceData(m.rewards));
        }
      }
      return d;
    }

    const bodyName = state.catalog.body(m.body).name;
    const start = m.start.type === 'pad'
      ? `On the launch pad, ${bodyName}`
      : m.start.type === 'orbit'
        ? `In a circular ${fmtDist(m.start.altitude)} orbit of ${bodyName}`
        : `${fmtDist(m.start.altitude)} above ${bodyName}`;
    d.append(h('div', { class: 'sec' }, 'Start condition'));
    d.append(h('div', {}, start));

    if (m.missionPhases?.length) {
      d.append(h('div', { class: 'sec' }, 'Mission phases'));
      d.append(missionPhases(m));
    }

    if (m.requiredCapabilities?.length) {
      d.append(h('div', { class: 'sec' }, 'Required spacecraft capabilities'));
      d.append(h('ul', { class: 'ms-caps' },
        ...m.requiredCapabilities.map(c => h('li', {}, c))
      ));
    }

    if (m.passCriteria?.length) {
      d.append(h('div', { class: 'sec', style: 'color:#5fdb8f' }, 'Mission Pass Criteria'));
      d.append(passCriteriaList(m.passCriteria));
    }

    if (m.failCriteria?.length) {
      d.append(h('div', { class: 'sec', style: 'color:#ff7a6b' }, 'Mission Failure Criteria'));
      d.append(failCriteriaList(m.failCriteria));
    }

    if (m.objectives?.length) {
      d.append(h('div', { class: 'sec' }, 'Objectives'));
      d.append(...m.objectives.map(o => h('div', { class: 'obj' }, h('i', {}, '○'), o.label)));
    }

    if (p?.completed) {
      const best = p.best || p.stats || {};
      d.append(h('div', { class: 'sec' }, 'Best so far'));
      d.append(h('div', { class: 'green' }, `Time ${fmtTime(best.time ?? 0)} · launch mass ${fmtMass(best.mass ?? 0)} · cost ${fmtMoney(best.cost ?? 0)}`));
    }

    if (m.rewards) {
      d.append(h('div', { class: 'sec' }, 'Completion rewards'));
      d.append(rewardBreakdown(m.rewards));
      if (m.rewards.scientificData?.length) {
        d.append(h('div', { class: 'sec' }, 'Scientific data awarded'));
        d.append(scienceData(m.rewards));
      }
      if (m.rewards.certifications?.length || m.rewards.unlockedParts?.length) {
        d.append(h('div', { class: 'sec', style: 'color:#ffe2ac' }, 'Program Qualifications & Rewards'));
        d.append(programUnlocks(m.rewards));
      }
    }

    const preset = state.presets.find(x => x.id === m.suggestedVehicle);
    d.append(h('div', { class: 'ms-actions' },
      preset
        ? h('button', {
          class: 'btn primary glow',
          onclick: async () => {
            const loaded = await loadPreset(preset.id);
            if (!loaded) { toast('That vehicle could not be loaded.', 'bad'); return; }
            state.blueprint = loaded;
            state.mode = 'mission';
            state.missionId = m.id;
            bus.emit('nav', 'flight', {
              bodyId: m.body || 'earth',
              start: m.start || { type: 'pad' },
              blueprint: structuredClone(loaded),
              missionId: m.id,
            });
          }
        }, `Launch with recommended vehicle: ${preset.name}`)
        : null,
      h('button', {
        class: preset ? 'btn' : 'btn primary',
        onclick: () => { state.mode = 'mission'; state.missionId = m.id; bus.emit('nav', 'workshop'); }
      }, preset ? 'Open in workshop with custom vehicle' : 'Open in workshop with my vehicle')
    ));
    return d;
  },
};